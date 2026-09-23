const MAX_PAGE_SIZE = 200;
const MAX_MASTER_SYNC_BYTES = 5 * 1024 * 1024;
const MASTER_SYNC_BATCH_SIZE = 75;
const MAX_MIGRATION_BATCH_ROWS = 1000;
const MAX_STOCK_MOVEMENT_BATCH_ROWS = 500;

function responseJson(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...extraHeaders,
    },
  });
}

function apiError(status, code, message, requestId) {
  return responseJson({ ok: false, error: { code, message }, requestId }, status);
}

function cleanText(value, maxLength = 200) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function positiveInt(value, fallback, maximum = MAX_PAGE_SIZE) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function isoDate(value) {
  const text = cleanText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function isoTimestamp(value, eventDate = "") {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000).toISOString();
  const text = cleanText(value, 40);
  if (text && !Number.isNaN(Date.parse(text))) return new Date(text).toISOString();
  return eventDate ? `${eventDate}T00:00:00.000Z` : new Date().toISOString();
}

function signedMovement(row) {
  if (cleanText(row.record_type || row.recordType, 40).toUpperCase() !== "MOVEMENT") return 0;
  const quantity = Number(row.quantity ?? row.qty ?? 0);
  const direction = cleanText(row.direction, 10).toUpperCase();
  if (direction === "IN") return quantity;
  if (direction === "OUT") return -quantity;
  return 0;
}

function movementRank(row) {
  return [Number(row.version || 1), String(row.created_at || ""), String(row.record_id || "")];
}

function newerMovement(left, right) {
  if (!right) return true;
  const a = movementRank(left), b = movementRank(right);
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}

function activeMovements(rows) {
  const latest = new Map();
  for (const row of rows || []) {
    const key = cleanText(row.logical_id, 160) || cleanText(row.record_id, 160);
    if (key && newerMovement(row, latest.get(key))) latest.set(key, row);
  }
  return [...latest.values()];
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function secureEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  let mismatch = leftHash.length ^ rightHash.length;
  for (let index = 0; index < leftHash.length; index += 1) {
    mismatch |= leftHash[index] ^ rightHash[index];
  }
  return mismatch === 0;
}

async function authorize(request, env) {
  if (!env.API_KEY) return { ok: false, status: 503, code: "API_NOT_ACTIVATED", message: "API data belum diaktifkan." };
  const supplied = cleanText(request.headers.get("x-api-key"), 512);
  if (!supplied || !(await secureEqual(supplied, env.API_KEY))) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Kredensial API tidak valid." };
  }
  return { ok: true };
}

async function readJsonWithLimit(request, maximumBytes) {
  if (!request.body) throw new Error("EMPTY_BODY");
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("payload too large");
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function limitedArray(value, name, maximum) {
  if (!Array.isArray(value)) throw new Error(`INVALID_${name.toUpperCase()}`);
  if (value.length > maximum) throw new Error(`TOO_MANY_${name.toUpperCase()}`);
  return value;
}

function requiredText(value, name, maximum = 180) {
  const result = cleanText(value, maximum);
  if (!result) throw new Error(`INVALID_${name.toUpperCase()}`);
  return result;
}

async function runStatementBatches(database, statements) {
  let written = 0;
  for (let index = 0; index < statements.length; index += MASTER_SYNC_BATCH_SIZE) {
    const batch = statements.slice(index, index + MASTER_SYNC_BATCH_SIZE);
    const results = await database.batch(batch);
    written += results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
  }
  return written;
}

function masterSyncStatements(database, data) {
  const statements = [];
  const counts = {};
  const addAll = (name, rows, maximum, createStatement) => {
    const input = limitedArray(rows, name, maximum);
    counts[name] = input.length;
    for (const row of input) statements.push(createStatement(row || {}));
  };

  addAll("outlets", data.outlets, 500, (row) => database.prepare(
    `INSERT INTO outlets(outlet_code, outlet_name, active, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(outlet_code) DO UPDATE SET
       outlet_name = excluded.outlet_name, active = excluded.active, updated_at = CURRENT_TIMESTAMP`
  ).bind(requiredText(row.outletCode, "outlet_code", 40).toUpperCase(), requiredText(row.outletName, "outlet_name"), row.active === false ? 0 : 1));

  addAll("locations", data.locations, 3000, (row) => database.prepare(
    `INSERT INTO stock_locations(outlet_code, location_code, location_name, active, created_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(outlet_code, location_code) DO UPDATE SET
       location_name = excluded.location_name, active = excluded.active, created_by = excluded.created_by`
  ).bind(requiredText(row.outletCode, "outlet_code", 40).toUpperCase(), requiredText(row.locationCode, "location_code", 80), requiredText(row.locationName, "location_name", 120), row.active === false ? 0 : 1, cleanText(row.updatedBy || "MASTER_SYNC", 100)));

  addAll("items", data.items, 20000, (row) => database.prepare(
    `INSERT INTO stock_items(item_code, category, item_name, default_unit, active, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(item_code) DO UPDATE SET
       category = excluded.category, item_name = excluded.item_name,
       default_unit = excluded.default_unit, active = excluded.active, updated_at = CURRENT_TIMESTAMP`
  ).bind(requiredText(row.itemCode, "item_code", 80).toUpperCase(), cleanText(row.category || "Uncategorized", 100), requiredText(row.itemName, "item_name"), requiredText(row.defaultUnit, "default_unit", 40), row.active === false ? 0 : 1));

  addAll("conversions", data.conversions, 30000, (row) => {
    const factor = Number(row.factor);
    if (!Number.isFinite(factor) || factor <= 0) throw new Error("INVALID_CONVERSION_FACTOR");
    return database.prepare(
      `INSERT INTO stock_unit_conversions(item_code, from_unit, to_unit, factor, active, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(item_code, from_unit, to_unit) DO UPDATE SET
         factor = excluded.factor, active = excluded.active,
         updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`
    ).bind(requiredText(row.itemCode, "item_code", 80).toUpperCase(), requiredText(row.fromUnit, "from_unit", 40), requiredText(row.toUnit, "to_unit", 40), factor, row.active === false ? 0 : 1, cleanText(row.updatedBy || "MASTER_SYNC", 100));
  });

  addAll("formulas", data.formulas, 10000, (row) => {
    const mode = cleanText(row.salesUsageMode || "AUTO_PRODUCE", 30).toUpperCase();
    if (mode !== "AUTO_PRODUCE" && mode !== "DIRECT_WIP") throw new Error("INVALID_SALES_USAGE_MODE");
    return database.prepare(
      `INSERT INTO wip_formulas(formula_code, formula_name, finished_unit, sales_usage_mode, active, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(formula_code) DO UPDATE SET
         formula_name = excluded.formula_name, finished_unit = excluded.finished_unit,
         sales_usage_mode = excluded.sales_usage_mode, active = excluded.active,
         updated_at = CURRENT_TIMESTAMP`
    ).bind(requiredText(row.formulaCode, "formula_code", 80).toUpperCase(), requiredText(row.formulaName, "formula_name"), requiredText(row.finishedUnit, "finished_unit", 40), mode, row.active === false ? 0 : 1);
  });

  addAll("materials", data.materials, 50000, (row) => {
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("INVALID_MATERIAL_QUANTITY");
    return database.prepare(
      `INSERT INTO wip_recipe_materials(formula_code, material_code, material_name, qty_usage, material_unit, sequence_no)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(formula_code, material_code) DO UPDATE SET
         material_name = excluded.material_name, qty_usage = excluded.qty_usage,
         material_unit = excluded.material_unit, sequence_no = excluded.sequence_no`
    ).bind(requiredText(row.formulaCode, "formula_code", 80).toUpperCase(), requiredText(row.materialCode, "material_code", 80).toUpperCase(), cleanText(row.materialName, 180), quantity, requiredText(row.materialUnit, "material_unit", 40), Math.max(0, Number.parseInt(String(row.sequenceNo || 0), 10) || 0));
  });

  addAll("showcaseItems", data.showcaseItems, 10000, (row) => {
    const quantity = Number(row.productQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("INVALID_SHOWCASE_QUANTITY");
    return database.prepare(
      `INSERT INTO showcase_items(menu_code, menu_name, menu_category, menu_category_detail,
          product_code, product_name, product_category, product_sub_category,
          product_unit, product_qty, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(menu_code) DO UPDATE SET
         menu_name = excluded.menu_name, menu_category = excluded.menu_category,
         menu_category_detail = excluded.menu_category_detail, product_code = excluded.product_code,
         product_name = excluded.product_name, product_category = excluded.product_category,
         product_sub_category = excluded.product_sub_category, product_unit = excluded.product_unit,
         product_qty = excluded.product_qty, active = excluded.active, updated_at = CURRENT_TIMESTAMP`
    ).bind(requiredText(row.menuCode, "menu_code", 80).toUpperCase(), requiredText(row.menuName, "menu_name"), cleanText(row.menuCategory, 100), cleanText(row.menuCategoryDetail, 100), requiredText(row.productCode, "product_code", 80).toUpperCase(), cleanText(row.productName, 180), cleanText(row.productCategory, 100), cleanText(row.productSubCategory, 100), requiredText(row.productUnit, "product_unit", 40), quantity, row.active === false ? 0 : 1);
  });

  return { statements, counts };
}

async function syncMasterData(request, env, requestId) {
  const masterDatabase = env.MASTER_DB;
  const operationsDatabase = env.OPERATIONS_DB;
  let payload;
  try {
    payload = await readJsonWithLimit(request, MAX_MASTER_SYNC_BYTES);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_PAYLOAD";
    const status = code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
    return apiError(status, code, "Payload sinkronisasi master tidak valid.", requestId);
  }
  let syncId;
  let sourceHash;
  try {
    syncId = requiredText(payload.syncId, "sync_id", 100);
    sourceHash = requiredText(payload.sourceHash, "source_hash", 128);
  } catch {
    return apiError(400, "INVALID_SYNC_ID", "Identitas sinkronisasi tidak valid.", requestId);
  }
  const generatedAt = cleanText(payload.generatedAt, 40);
  const data = payload.data && typeof payload.data === "object" ? payload.data : null;
  if (!data) return apiError(400, "INVALID_DATA", "Data master wajib tersedia.", requestId);

  try {
    const { statements, counts } = masterSyncStatements(masterDatabase, data);
    const existing = await operationsDatabase.prepare(
      "SELECT status, result_json FROM upload_jobs WHERE upload_type = 'MASTER_SYNC' AND source_hash = ? LIMIT 1"
    ).bind(sourceHash).first();
    if (existing?.status === "COMPLETED") {
      let previous = {};
      try { previous = JSON.parse(existing.result_json || "{}"); } catch { previous = {}; }
      return responseJson({ ok: true, duplicate: true, syncId, counts: previous.counts || counts, requestId });
    }
    await operationsDatabase.prepare(
      `INSERT INTO upload_jobs(job_id, upload_type, source_hash, status, total_rows,
          processed_rows, checkpoint_row, result_json, created_by, started_at, updated_at)
       VALUES (?, 'MASTER_SYNC', ?, 'PROCESSING', ?, 0, 0, ?, 'APPS_SCRIPT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(upload_type, source_hash) DO UPDATE SET
         status = 'PROCESSING', total_rows = excluded.total_rows, result_json = excluded.result_json,
         error_message = NULL, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`
    ).bind(syncId, sourceHash, statements.length, JSON.stringify({ generatedAt, counts })).run();

    const written = await runStatementBatches(masterDatabase, statements);
    await operationsDatabase.prepare(
      `UPDATE upload_jobs SET status = 'COMPLETED', processed_rows = total_rows,
          checkpoint_row = total_rows, result_json = ?, completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP WHERE upload_type = 'MASTER_SYNC' AND source_hash = ?`
    ).bind(JSON.stringify({ generatedAt, counts, written }), sourceHash).run();
    console.log(JSON.stringify({ event: "master_sync_completed", syncId, sourceHash, counts, written, requestId }));
    return responseJson({ ok: true, duplicate: false, syncId, counts, written, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await operationsDatabase.prepare(
      `UPDATE upload_jobs SET status = 'ERROR', error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE upload_type = 'MASTER_SYNC' AND source_hash = ?`
    ).bind(cleanText(message, 500), sourceHash).run();
    console.error(JSON.stringify({ event: "master_sync_failed", syncId, sourceHash, message, requestId }));
    return apiError(400, "MASTER_SYNC_FAILED", message, requestId);
  }
}

async function masterSyncStatus(env, requestId) {
  const [jobs, counts] = await Promise.all([
    env.OPERATIONS_DB.prepare(
      `SELECT job_id, source_hash, status, total_rows, processed_rows, error_message,
              created_at, started_at, completed_at, updated_at
         FROM upload_jobs WHERE upload_type = 'MASTER_SYNC'
        ORDER BY created_at DESC LIMIT 10`
    ).all(),
    env.MASTER_DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM outlets) AS outlets,
        (SELECT COUNT(*) FROM stock_locations) AS locations,
        (SELECT COUNT(*) FROM stock_items) AS items,
        (SELECT COUNT(*) FROM stock_unit_conversions) AS conversions,
        (SELECT COUNT(*) FROM wip_formulas) AS formulas,
        (SELECT COUNT(*) FROM wip_recipe_materials) AS materials,
        (SELECT COUNT(*) FROM showcase_items) AS showcase_items`
    ).first(),
  ]);
  return responseJson({ ok: true, jobs: jobs.results, counts: counts || {}, requestId });
}

async function migrateStockBalances(request, env, requestId) {
  let payload;
  try {
    payload = await readJsonWithLimit(request, MAX_MASTER_SYNC_BYTES);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_PAYLOAD";
    return apiError(code === "PAYLOAD_TOO_LARGE" ? 413 : 400, code, "Payload migrasi saldo tidak valid.", requestId);
  }
  const rows = Array.isArray(payload?.rows) ? payload.rows : null;
  if (!rows || rows.length === 0 || rows.length > MAX_MIGRATION_BATCH_ROWS) {
    return apiError(400, "INVALID_BATCH", "Batch saldo harus berisi 1 sampai 1000 baris.", requestId);
  }
  try {
    const groupedStatements = new Map();
    rows.forEach((row) => {
      const quantity = Number(row.currentQty);
      if (!Number.isFinite(quantity)) throw new Error("INVALID_CURRENT_QTY");
      return env.OPERATIONS_DB.prepare(
        `INSERT INTO stock_balances(outlet_code, location_code, item_code, item_name, current_qty, unit, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(outlet_code, location_code, item_code) DO UPDATE SET
           item_name = excluded.item_name, current_qty = excluded.current_qty,
           unit = excluded.unit, updated_at = excluded.updated_at`
      ).bind(
        requiredText(row.outletCode, "outlet_code", 40).toUpperCase(),
        requiredText(row.locationCode, "location_code", 80),
        requiredText(row.itemCode, "item_code", 80).toUpperCase(),
        cleanText(row.itemName, 180), quantity, cleanText(row.unit, 40) || null,
        cleanText(row.updatedAt, 40) || new Date().toISOString()
      );
    });
    const written = await runStatementBatches(env.OPERATIONS_DB, statements);
    return responseJson({ ok: true, received: rows.length, written, batchId: cleanText(payload.batchId, 100), requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "balance_migration_failed", message, requestId }));
    return apiError(400, "BALANCE_MIGRATION_FAILED", message, requestId);
  }
}

function normalizeMovement(row) {
  const source = row?.json && typeof row.json === "object" ? row.json : (row || {});
  const eventDate = isoDate(source.event_date ?? source.eventDate);
  const quantity = Number(source.qty ?? source.quantity);
  const sourceRowValue = source.source_row ?? source.sourceRow;
  const sourceRow = sourceRowValue === null || sourceRowValue === undefined || sourceRowValue === ""
    ? null : Number.parseInt(String(sourceRowValue), 10);
  if (!eventDate) throw new Error("INVALID_EVENT_DATE");
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error("INVALID_QUANTITY");
  if (sourceRow !== null && !Number.isFinite(sourceRow)) throw new Error("INVALID_SOURCE_ROW");
  const direction = cleanText(source.direction, 10).toUpperCase() || "NONE";
  if (!["IN", "OUT", "NONE", "LOT"].includes(direction)) throw new Error("INVALID_DIRECTION");
  return {
    record_id: requiredText(source.record_id ?? source.recordId ?? row?.insertId, "record_id", 160),
    logical_id: cleanText(source.logical_id ?? source.logicalId, 160) || null,
    version: Math.max(1, Number.parseInt(String(source.version || 1), 10) || 1),
    record_type: cleanText(source.record_type ?? source.recordType, 40).toUpperCase() || "MOVEMENT",
    outlet_code: requiredText(source.outlet ?? source.outlet_code ?? source.outletCode, "outlet_code", 40).toUpperCase(),
    location_code: requiredText(source.location ?? source.location_code ?? source.locationCode, "location_code", 80),
    item_code: requiredText(source.item_code ?? source.itemCode ?? (cleanText(source.record_type ?? source.recordType, 40).toUpperCase() === "IMPORT" ? "__IMPORT__" : ""), "item_code", 80).toUpperCase(),
    category: cleanText(source.category, 100) || null,
    item_name: cleanText(source.item_name ?? source.itemName, 180) || null,
    unit: cleanText(source.unit, 40) || (cleanText(source.record_type ?? source.recordType, 40).toUpperCase() === "IMPORT" ? "NONE" : "PCS"),
    direction: direction === "LOT" ? "NONE" : direction,
    quantity,
    movement_type: cleanText(source.movement_type ?? source.movementType, 100) || "UNKNOWN",
    info: cleanText(source.info, 1000) || null,
    event_date: eventDate,
    arrival_date: isoDate(source.source_arrival_date ?? source.arrival_date ?? source.arrivalDate) || null,
    production_date: isoDate(source.production_date ?? source.productionDate) || null,
    expiry_date: isoDate(source.expiry_date ?? source.expiryDate) || null,
    supplier: cleanText(source.supplier, 180) || null,
    lot_id: cleanText(source.lot_id ?? source.lotId, 160) || null,
    sale_line_id: cleanText(source.sale_line_id ?? source.saleLineId, 160) || null,
    transfer_id: cleanText(source.transfer_id ?? source.transferId, 160) || null,
    source_file: cleanText(source.source_file ?? source.sourceFile, 300) || null,
    source_object_key: cleanText(source.source_object_key ?? source.sourceObjectKey, 500) || null,
    source_hash: cleanText(source.source_hash ?? source.sourceHash, 160) || null,
    source_row: sourceRow,
    created_by: cleanText(source.created_by ?? source.createdBy, 180) || "APPS_SCRIPT",
    created_at: isoTimestamp(source.created_at ?? source.createdAt, eventDate),
  };
}

function movementInsertStatement(database, row) {
  return database.prepare(
    `INSERT INTO stock_movements(
       record_id, logical_id, version, record_type, outlet_code, location_code,
       item_code, category, item_name, unit, direction, quantity, movement_type,
       info, event_date, arrival_date, production_date, expiry_date, supplier,
       lot_id, sale_line_id, transfer_id, source_file, source_object_key,
       source_hash, source_row, created_by, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(record_id) DO NOTHING`
  ).bind(
    row.record_id, row.logical_id, row.version, row.record_type, row.outlet_code,
    row.location_code, row.item_code, row.category, row.item_name, row.unit,
    row.direction, row.quantity, row.movement_type, row.info, row.event_date,
    row.arrival_date, row.production_date, row.expiry_date, row.supplier, row.lot_id,
    row.sale_line_id, row.transfer_id, row.source_file, row.source_object_key,
    row.source_hash, row.source_row, row.created_by, row.created_at
  );
}

const HISTORY_MONTH_BINDINGS = [
  ["2026-06", "HISTORY_DB_2026_06"],
  ["2026-07", "HISTORY_DB_2026_07"],
  ["2026-08", "HISTORY_DB_2026_08"],
  ["2026-09", "HISTORY_DB_2026_09"],
  ["2026-10", "HISTORY_DB_2026_10"],
  ["2026-11", "HISTORY_DB_2026_11"],
  ["2026-12", "HISTORY_DB_2026_12"],
];

function historyDatabaseEntries(env) {
  const entries = [{ key: "legacy-2026", database: env.HISTORY_DB_2026, legacy: true }];
  for (const [key, binding] of HISTORY_MONTH_BINDINGS) {
    if (env[binding]) entries.push({ key, database: env[binding], legacy: false });
  }
  return entries;
}

function historyDatabaseForDate(env, eventDate) {
  const month = String(eventDate || "").slice(0, 7);
  const binding = HISTORY_MONTH_BINDINGS.find(([key]) => key === month)?.[1];
  if (!binding || !env[binding]) throw new Error(`HISTORY_MONTH_NOT_CONFIGURED:${month || "UNKNOWN"}`);
  return { key: month, database: env[binding] };
}

function historyDatabasesForRange(env, from, to) {
  const start = String(from || "0000-01-01").slice(0, 7);
  const end = String(to || "9999-12-31").slice(0, 7);
  const overlapsLegacy = String(from || "0000-01-01") <= "2026-08-23" && String(to || "9999-12-31") >= "2026-06-20";
  return historyDatabaseEntries(env).filter((entry) => (entry.legacy ? overlapsLegacy : entry.key >= start && entry.key <= end));
}

async function queryHistoryDatabases(entries, statementFactory) {
  const rows = [];
  for (const entry of entries) {
    const result = await statementFactory(entry.database).all();
    rows.push(...result.results);
  }
  return rows;
}

async function existingMovementState(env, rows) {
  const logicalIds = [...new Set(rows.map((row) => row.logical_id || row.record_id))];
  const recordIds = [...new Set(rows.map((row) => row.record_id))];
  const eventDates = rows.map((row) => row.event_date).filter(Boolean).sort();
  const historyEntries = historyDatabasesForRange(env, eventDates[0], eventDates.at(-1));
  const existing = [], duplicateIds = new Set();
  for (let index = 0; index < logicalIds.length; index += 50) {
    const ids = logicalIds.slice(index, index + 50);
    const placeholders = ids.map(() => "?").join(",");
    const query = `SELECT * FROM stock_movements WHERE COALESCE(NULLIF(logical_id, ''), record_id) IN (${placeholders})`;
    const historyQuery = `SELECT * FROM stock_movements_history WHERE COALESCE(NULLIF(logical_id, ''), record_id) IN (${placeholders})`;
    const ops = await env.OPERATIONS_DB.prepare(query).bind(...ids).all();
    existing.push(...ops.results);
    for (const entry of historyEntries) {
      const history = await entry.database.prepare(historyQuery).bind(...ids).all();
      existing.push(...history.results);
    }
  }
  for (const row of existing) if (recordIds.includes(String(row.record_id))) duplicateIds.add(String(row.record_id));
  const active = new Map();
  for (const row of existing) {
    const key = cleanText(row.logical_id, 160) || cleanText(row.record_id, 160);
    if (key && newerMovement(row, active.get(key))) active.set(key, row);
  }
  return { active, duplicateIds };
}

async function writeStockMovements(request, env, requestId) {
  let payload;
  try { payload = await readJsonWithLimit(request, MAX_MASTER_SYNC_BYTES); }
  catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_PAYLOAD";
    return apiError(code === "PAYLOAD_TOO_LARGE" ? 413 : 400, code, "Payload transaksi stok tidak valid.", requestId);
  }
  const input = Array.isArray(payload?.rows) ? payload.rows : null;
  if (!input || input.length === 0 || input.length > 40) {
    return apiError(400, "INVALID_BATCH", "Batch transaksi stok harus berisi 1 sampai 40 baris.", requestId);
  }
  try {
    const rows = input.map(normalizeMovement);
    const state = await existingMovementState(env, rows);
    const accepted = [], balanceDeltas = new Map();
    rows.sort((a, b) => a.version - b.version || a.created_at.localeCompare(b.created_at));
    for (const row of rows) {
      if (state.duplicateIds.has(row.record_id)) continue;
      accepted.push(row);
      const logicalId = row.logical_id || row.record_id;
      const previous = state.active.get(logicalId);
      if (newerMovement(row, previous)) {
        const delta = signedMovement(row) - (previous ? signedMovement(previous) : 0);
        const key = `${row.outlet_code}\u001f${row.location_code}\u001f${row.item_code}`;
        const current = balanceDeltas.get(key) || { row, delta: 0 };
        current.row = row;
        current.delta += delta;
        balanceDeltas.set(key, current);
        state.active.set(logicalId, row);
      }
    }
    const statements = accepted.map((row) => movementInsertStatement(env.OPERATIONS_DB, row));
    for (const { row, delta } of balanceDeltas.values()) {
      if (Math.abs(delta) < 0.000000001) continue;
      statements.push(env.OPERATIONS_DB.prepare(
        `INSERT INTO stock_balances(outlet_code, location_code, item_code, item_name, current_qty, unit, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(outlet_code, location_code, item_code) DO UPDATE SET
           item_name = excluded.item_name,
           current_qty = stock_balances.current_qty + excluded.current_qty,
           unit = excluded.unit, updated_at = excluded.updated_at`
      ).bind(row.outlet_code, row.location_code, row.item_code, row.item_name, delta, row.unit, row.created_at));
    }
    const batchResults = statements.length ? await env.OPERATIONS_DB.batch(statements) : [];
    const written = batchResults.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
    console.log(JSON.stringify({ event: "stock_movements_written", received: rows.length, accepted: accepted.length, written, requestId }));
    return responseJson({ ok: true, received: rows.length, accepted: accepted.length, duplicates: rows.length - accepted.length, written, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "stock_movement_write_failed", message, requestId }));
    return apiError(400, "STOCK_MOVEMENT_WRITE_FAILED", message, requestId);
  }
}

function normalizeTransferEvent(row) {
  const source = row?.json && typeof row.json === "object" ? row.json : (row || {});
  const numberOrNull = (value) => value === null || value === undefined || value === "" ? null : Number(value);
  return {
    event_id: requiredText(source.event_id ?? source.eventId ?? row?.insertId, "event_id", 160),
    transfer_id: requiredText(source.transfer_id ?? source.transferId, "transfer_id", 160),
    status: requiredText(source.status, "status", 30).toUpperCase(),
    from_outlet: cleanText(source.from_outlet ?? source.fromOutlet, 40).toUpperCase() || null,
    from_location: cleanText(source.from_location ?? source.fromLocation, 80) || null,
    to_outlet: cleanText(source.to_outlet ?? source.toOutlet, 40).toUpperCase() || null,
    to_location: cleanText(source.to_location ?? source.toLocation, 80) || null,
    item_code: cleanText(source.item_code ?? source.itemCode, 80).toUpperCase() || null,
    category: cleanText(source.category, 100) || null,
    item_name: cleanText(source.item_name ?? source.itemName, 180) || null,
    unit: cleanText(source.unit, 40) || null,
    qty: numberOrNull(source.qty), received_qty: numberOrNull(source.received_qty ?? source.receivedQty),
    note: cleanText(source.note, 1000) || null,
    expiry_date: isoDate(source.expiry_date ?? source.expiryDate) || null,
    delivery_date: isoDate(source.delivery_date ?? source.deliveryDate) || null,
    created_by: cleanText(source.created_by ?? source.createdBy, 180) || null,
    created_by_name: cleanText(source.created_by_name ?? source.createdByName, 180) || null,
    created_at: isoTimestamp(source.created_at ?? source.createdAt),
    accepted_by: cleanText(source.accepted_by ?? source.acceptedBy, 180) || null,
    accepted_by_name: cleanText(source.accepted_by_name ?? source.acceptedByName, 180) || null,
    accepted_at: source.accepted_at ?? source.acceptedAt ? isoTimestamp(source.accepted_at ?? source.acceptedAt) : null,
    received_at: source.received_at ?? source.receivedAt ? isoTimestamp(source.received_at ?? source.receivedAt) : null,
    storage_entered_at: source.storage_entered_at ?? source.storageEnteredAt ? isoTimestamp(source.storage_entered_at ?? source.storageEnteredAt) : null,
    product_temperature: numberOrNull(source.product_temperature ?? source.productTemperature),
    rejected_by: cleanText(source.rejected_by ?? source.rejectedBy, 180) || null,
    rejected_by_name: cleanText(source.rejected_by_name ?? source.rejectedByName, 180) || null,
    rejected_at: source.rejected_at ?? source.rejectedAt ? isoTimestamp(source.rejected_at ?? source.rejectedAt) : null,
    rejection_reason: cleanText(source.rejection_reason ?? source.rejectionReason, 1000) || null,
    receipt_no: cleanText(source.receipt_no ?? source.receiptNo, 160) || null,
    photo_file_ids: cleanText(source.photo_file_ids ?? source.photoFileIds, 2000) || null,
    photo_count: Math.max(0, Number.parseInt(String(source.photo_count ?? source.photoCount ?? 0), 10) || 0),
    photo_data_json: cleanText(source.photo_data_json ?? source.photoDataJson, 1000000) || null,
  };
}

async function writeTransferEvents(request, env, requestId) {
  let payload;
  try { payload = await readJsonWithLimit(request, MAX_MASTER_SYNC_BYTES); }
  catch (error) { return apiError(400, "INVALID_PAYLOAD", "Payload transfer tidak valid.", requestId); }
  const input = Array.isArray(payload?.rows) ? payload.rows : null;
  if (!input || input.length === 0 || input.length > 500) return apiError(400, "INVALID_BATCH", "Batch transfer harus berisi 1 sampai 500 baris.", requestId);
  try {
    const columns = ["event_id","transfer_id","status","from_outlet","from_location","to_outlet","to_location","item_code","category","item_name","unit","qty","received_qty","note","expiry_date","delivery_date","created_by","created_by_name","created_at","accepted_by","accepted_by_name","accepted_at","received_at","storage_entered_at","product_temperature","rejected_by","rejected_by_name","rejected_at","rejection_reason","receipt_no","photo_file_ids","photo_count","photo_data_json"];
    const statements = input.map((raw) => {
      const row = normalizeTransferEvent(raw);
      return env.OPERATIONS_DB.prepare(
        `INSERT INTO stock_transfer_events(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(event_id) DO NOTHING`
      ).bind(...columns.map((column) => row[column]));
    });
    const written = await runStatementBatches(env.OPERATIONS_DB, statements);
    return responseJson({ ok: true, received: input.length, written, requestId });
  } catch (error) {
    return apiError(400, "TRANSFER_WRITE_FAILED", error instanceof Error ? error.message : String(error), requestId);
  }
}

async function convertItemUnit(request, env, requestId) {
  let payload;
  try { payload = await readJsonWithLimit(request, 100000); }
  catch (error) { return apiError(400, "INVALID_PAYLOAD", "Payload konversi unit tidak valid.", requestId); }
  try {
    const itemCode = requiredText(payload.itemCode, "item_code", 80).toUpperCase();
    const oldUnit = requiredText(payload.oldUnit, "old_unit", 40).toUpperCase();
    const newUnit = requiredText(payload.newUnit, "new_unit", 40).toUpperCase();
    const factor = Number(payload.factor);
    if (oldUnit === newUnit || !Number.isFinite(factor) || factor <= 0) throw new Error("INVALID_CONVERSION");
    const historyResults = [];
    for (const entry of historyDatabaseEntries(env)) {
      historyResults.push(...await entry.database.batch([
        entry.database.prepare("UPDATE stock_movements_history SET quantity = quantity * ?, unit = ? WHERE item_code = ? AND UPPER(unit) = ?").bind(factor, newUnit, itemCode, oldUnit),
        entry.database.prepare("UPDATE stock_lot_allocations_history SET quantity = quantity * ?, unit = ? WHERE UPPER(unit) = ? AND movement_id IN (SELECT record_id FROM stock_movements_history WHERE item_code = ?)").bind(factor, newUnit, oldUnit, itemCode),
      ]));
    }
    const operationResults = await env.OPERATIONS_DB.batch([
      env.OPERATIONS_DB.prepare("UPDATE stock_movements SET quantity = quantity * ?, unit = ? WHERE item_code = ? AND UPPER(unit) = ?").bind(factor, newUnit, itemCode, oldUnit),
      env.OPERATIONS_DB.prepare("UPDATE stock_balances SET current_qty = current_qty * ?, unit = ?, updated_at = CURRENT_TIMESTAMP WHERE item_code = ? AND UPPER(COALESCE(unit, '')) = ?").bind(factor, newUnit, itemCode, oldUnit),
      env.OPERATIONS_DB.prepare("UPDATE stock_lots SET original_qty = original_qty * ?, current_qty = current_qty * ?, unit = ?, updated_at = CURRENT_TIMESTAMP WHERE item_code = ? AND UPPER(unit) = ?").bind(factor, factor, newUnit, itemCode, oldUnit),
      env.OPERATIONS_DB.prepare("UPDATE stock_transfer_lines SET requested_qty = requested_qty * ?, received_qty = CASE WHEN received_qty IS NULL THEN NULL ELSE received_qty * ? END, unit = ? WHERE item_code = ? AND UPPER(unit) = ?").bind(factor, factor, newUnit, itemCode, oldUnit),
      env.OPERATIONS_DB.prepare("UPDATE stock_transfer_events SET qty = CASE WHEN qty IS NULL THEN NULL ELSE qty * ? END, received_qty = CASE WHEN received_qty IS NULL THEN NULL ELSE received_qty * ? END, unit = ? WHERE item_code = ? AND UPPER(COALESCE(unit, '')) = ?").bind(factor, factor, newUnit, itemCode, oldUnit),
    ]);
    const masterResult = await env.MASTER_DB.prepare("UPDATE stock_items SET default_unit = ?, updated_at = CURRENT_TIMESTAMP WHERE item_code = ? AND UPPER(default_unit) = ?").bind(newUnit, itemCode, oldUnit).run();
    const changes = (results) => results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
    return responseJson({ ok: true, itemCode, oldUnit, newUnit, historyRows: changes(historyResults), operationRows: changes(operationResults), masterRows: Number(masterResult.meta?.changes || 0), requestId });
  } catch (error) {
    return apiError(400, "UNIT_CONVERSION_FAILED", error instanceof Error ? error.message : String(error), requestId);
  }
}

async function listTransferEvents(url, env, requestId) {
  const transferId = cleanText(url.searchParams.get("transfer_id"), 160);
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  if (!transferId && !outlet) return apiError(400, "INVALID_FILTER", "transfer_id atau outlet wajib diisi.", requestId);
  const result = transferId
    ? await env.OPERATIONS_DB.prepare("SELECT * FROM stock_transfer_events WHERE transfer_id = ? ORDER BY created_at, status, item_name, expiry_date").bind(transferId).all()
    : await env.OPERATIONS_DB.prepare("SELECT * FROM stock_transfer_events WHERE from_outlet = ? OR to_outlet = ? ORDER BY created_at DESC LIMIT 5000").bind(outlet, outlet).all();
  return responseJson({ ok: true, data: result.results, requestId });
}

async function migrateStockMovements(request, env, requestId) {
  let payload;
  try {
    payload = await readJsonWithLimit(request, MAX_MASTER_SYNC_BYTES);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_PAYLOAD";
    return apiError(code === "PAYLOAD_TOO_LARGE" ? 413 : 400, code, "Payload migrasi riwayat stok tidak valid.", requestId);
  }
  const rows = Array.isArray(payload?.rows) ? payload.rows : null;
  if (!rows || rows.length === 0 || rows.length > MAX_STOCK_MOVEMENT_BATCH_ROWS) {
    return apiError(400, "INVALID_BATCH", "Batch riwayat stok harus berisi 1 sampai 500 baris.", requestId);
  }

  try {
    const groupedStatements = new Map();
    rows.forEach((row) => {
      const quantity = Number(row.quantity);
      const version = Math.max(1, Number.parseInt(String(row.version || 1), 10) || 1);
      const sourceRow = row.sourceRow === null || row.sourceRow === undefined || row.sourceRow === ""
        ? null
        : Number.parseInt(String(row.sourceRow), 10);
      if (!Number.isFinite(quantity)) throw new Error("INVALID_QUANTITY");
      if (sourceRow !== null && !Number.isFinite(sourceRow)) throw new Error("INVALID_SOURCE_ROW");
      const eventDate = isoDate(row.eventDate);
      if (!eventDate || !eventDate.startsWith("2026-")) throw new Error("INVALID_HISTORY_YEAR");

      const target = historyDatabaseForDate(env, eventDate);
      const statement = target.database.prepare(
        `INSERT INTO stock_movements_history(
           record_id, logical_id, version, record_type, outlet_code, location_code,
           item_code, category, item_name, unit, direction, quantity, movement_type,
           info, event_date, arrival_date, production_date, expiry_date, supplier,
           lot_id, sale_line_id, transfer_id, source_file, source_object_key,
           source_hash, source_row, created_by, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(record_id) DO UPDATE SET
           logical_id = excluded.logical_id, version = excluded.version,
           record_type = excluded.record_type, outlet_code = excluded.outlet_code,
           location_code = excluded.location_code, item_code = excluded.item_code,
           category = excluded.category, item_name = excluded.item_name, unit = excluded.unit,
           direction = excluded.direction, quantity = excluded.quantity,
           movement_type = excluded.movement_type, info = excluded.info,
           event_date = excluded.event_date, arrival_date = excluded.arrival_date,
           production_date = excluded.production_date, expiry_date = excluded.expiry_date,
           supplier = excluded.supplier, lot_id = excluded.lot_id,
           sale_line_id = excluded.sale_line_id, transfer_id = excluded.transfer_id,
           source_file = excluded.source_file, source_object_key = excluded.source_object_key,
           source_hash = excluded.source_hash, source_row = excluded.source_row,
           created_by = excluded.created_by, created_at = excluded.created_at`
      ).bind(
        requiredText(row.recordId, "record_id", 160),
        cleanText(row.logicalId, 160) || null,
        version,
        cleanText(row.recordType, 40) || "MOVEMENT",
        requiredText(row.outletCode, "outlet_code", 40).toUpperCase(),
        requiredText(row.locationCode, "location_code", 80),
        cleanText(row.itemCode, 80).toUpperCase(),
        cleanText(row.category, 100) || null,
        cleanText(row.itemName, 180) || null,
        cleanText(row.unit, 40),
        cleanText(row.direction, 10).toUpperCase() || "NONE",
        quantity,
        cleanText(row.movementType, 100) || "UNKNOWN",
        cleanText(row.info, 1000) || null,
        eventDate,
        isoDate(row.arrivalDate) || null,
        isoDate(row.productionDate) || null,
        isoDate(row.expiryDate) || null,
        cleanText(row.supplier, 180) || null,
        cleanText(row.lotId, 160) || null,
        cleanText(row.saleLineId, 160) || null,
        cleanText(row.transferId, 160) || null,
        cleanText(row.sourceFile, 300) || null,
        cleanText(row.sourceObjectKey, 500) || null,
        cleanText(row.sourceHash, 160) || null,
        sourceRow,
        cleanText(row.createdBy, 180) || "BIGQUERY_MIGRATION",
        cleanText(row.createdAt, 40) || `${eventDate}T00:00:00.000Z`
      );
      const group = groupedStatements.get(target.key) || { database: target.database, statements: [] };
      group.statements.push(statement);
      groupedStatements.set(target.key, group);
    });
    let written = 0;
    const partitions = {};
    for (const [key, group] of groupedStatements) {
      const partitionWritten = await runStatementBatches(group.database, group.statements);
      written += partitionWritten;
      partitions[key] = { received: group.statements.length, written: partitionWritten };
    }
    return responseJson({
      ok: true,
      received: rows.length,
      written,
      partitions,
      batchId: cleanText(payload.batchId, 120),
      checkpoint: payload.checkpoint || null,
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "stock_movement_migration_failed", message, requestId }));
    return apiError(400, "STOCK_MOVEMENT_MIGRATION_FAILED", message, requestId);
  }
}

async function stockMovementMigrationStatus(env, requestId) {
  const sql = `SELECT COUNT(*) AS row_count, COUNT(DISTINCT record_id) AS record_count,
                      MIN(event_date) AS min_date, MAX(event_date) AS max_date,
                      MIN(created_at) AS first_created_at, MAX(created_at) AS last_created_at
                 FROM stock_movements_history`;
  const partitions = [];
  for (const entry of historyDatabaseEntries(env)) {
    partitions.push({ key: entry.key, ...(await entry.database.prepare(sql).first() || {}) });
  }
  const rowCount = partitions.reduce((sum, row) => sum + Number(row.row_count || 0), 0);
  const recordCount = partitions.reduce((sum, row) => sum + Number(row.record_count || 0), 0);
  const present = partitions.filter((row) => row.min_date || row.max_date);
  return responseJson({
    ok: true,
    stats: {
      row_count: rowCount,
      record_count: recordCount,
      min_date: present.map((row) => row.min_date).filter(Boolean).sort()[0] || null,
      max_date: present.map((row) => row.max_date).filter(Boolean).sort().at(-1) || null,
    },
    partitions,
    requestId,
  });
}

async function databaseHealth(database, role) {
  const [migration, objects] = await database.batch([
    database.prepare("SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC, version DESC LIMIT 1"),
    database.prepare("SELECT COUNT(*) AS object_count FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'"),
  ]);
  return {
    role,
    ready: true,
    schemaVersion: migration.results[0]?.version || null,
    schemaObjects: Number(objects.results[0]?.object_count || 0),
  };
}

async function health(env, requestId) {
  const databases = [
    await databaseHealth(env.MASTER_DB, "master"),
    await databaseHealth(env.OPERATIONS_DB, "operations"),
  ];
  for (const entry of historyDatabaseEntries(env)) {
    databases.push(await databaseHealth(entry.database, `history-${entry.key}`));
  }
  return responseJson({
    ok: true,
    service: "bakerzin-inventory-api",
    environment: env.ENVIRONMENT || "unknown",
    migrationState: env.ENVIRONMENT === "cloudflare-primary" ? "cloudflare-primary-migration-continuing" : "containers-ready",
    databases,
    storage: { r2: Boolean(env.FILES), public: false },
    backgroundQueue: Boolean(env.JOBS_QUEUE),
    requestId,
  });
}

async function schemaMeta(env, requestId) {
  const query = "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV' ORDER BY type, name";
  const master = await env.MASTER_DB.prepare(query).all();
  const operations = await env.OPERATIONS_DB.prepare(query).all();
  const histories = {};
  for (const entry of historyDatabaseEntries(env)) {
    histories[entry.key] = (await entry.database.prepare(query).all()).results;
  }
  return responseJson({
    ok: true,
    databases: {
      master: master.results,
      operations: operations.results,
      histories,
    },
    requestId,
  });
}

async function listStockItems(url, env, requestId) {
  const limit = positiveInt(url.searchParams.get("limit"), 100, 5000);
  const cursor = cleanText(url.searchParams.get("cursor"), 80).toUpperCase();
  const includeInactive = url.searchParams.get("include_inactive") === "1";
  const result = await env.MASTER_DB.prepare(
    `SELECT item_code, category, item_name, default_unit, active, updated_at
       FROM stock_items
      WHERE item_code > ? AND (? = 1 OR active = 1)
      ORDER BY item_code
      LIMIT ?`
  ).bind(cursor, includeInactive ? 1 : 0, limit + 1).all();
  const rows = result.results.slice(0, limit);
  return responseJson({
    ok: true,
    data: rows,
    nextCursor: result.results.length > limit ? rows.at(-1)?.item_code || null : null,
    requestId,
  });
}

async function listBalances(url, env, requestId) {
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  const location = cleanText(url.searchParams.get("location"), 80);
  const itemCode = cleanText(url.searchParams.get("item_code"), 80).toUpperCase();
  const itemName = cleanText(url.searchParams.get("item_name"), 180);
  const cursor = cleanText(url.searchParams.get("cursor"), 80).toUpperCase();
  // A busy outlet can hold more than 4,000 item balances. Let Apps Script
  // fetch one complete outlet/location in a single Worker request instead of
  // opening 8-20 sequential requests that are vulnerable to transient D1
  // errors while migration writes are still running.
  const limit = positiveInt(url.searchParams.get("limit"), 100, 5000);
  if (!outlet || !location) return apiError(400, "INVALID_SCOPE", "Outlet dan lokasi wajib diisi.", requestId);
  const conditions = ["outlet_code = ?", "location_code = ?", "item_code > ?"];
  const bindings = [outlet, location, cursor];
  if (itemCode) { conditions.push("item_code = ?"); bindings.push(itemCode); }
  if (itemName) { conditions.push("item_name = ? COLLATE NOCASE"); bindings.push(itemName); }
  const result = await env.OPERATIONS_DB.prepare(
    `SELECT item_code, item_name, current_qty, unit, updated_at
       FROM stock_balances
      WHERE ${conditions.join(" AND ")}
      ORDER BY item_code
      LIMIT ?`
  ).bind(...bindings, limit + 1).all();
  const rows = result.results.slice(0, limit);
  return responseJson({
    ok: true,
    data: rows,
    nextCursor: result.results.length > limit ? rows.at(-1)?.item_code || null : null,
    requestId,
  });
}

async function listStockCard(url, env, requestId) {
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  const location = cleanText(url.searchParams.get("location"), 80);
  const itemCode = cleanText(url.searchParams.get("item_code"), 80).toUpperCase();
  const from = isoDate(url.searchParams.get("from")) || "0000-01-01";
  const to = isoDate(url.searchParams.get("to")) || "9999-12-31";
  const beforeCreatedAt = cleanText(url.searchParams.get("before_created_at"), 40) || "9999-12-31T23:59:59.999Z";
  const limit = positiveInt(url.searchParams.get("limit"), 100);
  if (!outlet || !location || !itemCode) {
    return apiError(400, "INVALID_FILTER", "Outlet, lokasi, dan item_code wajib diisi.", requestId);
  }
  const sql = `SELECT record_id, logical_id, version, record_type, outlet_code, location_code,
                      item_code, category, item_name, unit, direction, quantity, movement_type, info,
                      event_date, arrival_date, production_date, expiry_date, supplier, lot_id,
                      sale_line_id, transfer_id, source_file, source_hash, source_row, created_by, created_at
                 FROM __TABLE__
                WHERE outlet_code = ? AND location_code = ? AND item_code = ?
                  AND event_date BETWEEN ? AND ? AND created_at < ?
                ORDER BY created_at DESC, record_id DESC LIMIT ?`;
  const bindings = [outlet, location, itemCode, from, to, beforeCreatedAt, Math.min(1000, limit * 4 + 20)];
  const operations = await env.OPERATIONS_DB.prepare(sql.replace("__TABLE__", "stock_movements")).bind(...bindings).all();
  const history = await queryHistoryDatabases(
    historyDatabasesForRange(env, from, to),
    (database) => database.prepare(sql.replace("__TABLE__", "stock_movements_history")).bind(...bindings)
  );
  const merged = activeMovements([...operations.results, ...history])
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.record_id).localeCompare(String(a.record_id)));
  const rows = merged.slice(0, limit);
  return responseJson({
    ok: true,
    data: rows,
    nextCursor: merged.length > limit ? rows.at(-1)?.created_at || null : null,
    requestId,
  });
}

async function listMovements(url, env, requestId) {
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  const location = cleanText(url.searchParams.get("location"), 80);
  const itemCode = cleanText(url.searchParams.get("item_code"), 80).toUpperCase();
  const itemName = cleanText(url.searchParams.get("item_name"), 180);
  const logicalId = cleanText(url.searchParams.get("logical_id"), 160);
  const recordType = cleanText(url.searchParams.get("record_type"), 40).toUpperCase();
  const movementType = cleanText(url.searchParams.get("movement_type"), 100);
  const sourceHash = cleanText(url.searchParams.get("source_hash"), 160);
  const transferId = cleanText(url.searchParams.get("transfer_id"), 160);
  const from = isoDate(url.searchParams.get("from")) || "0000-01-01";
  const to = isoDate(url.searchParams.get("to")) || "9999-12-31";
  const cursor = cleanText(url.searchParams.get("cursor"), 500);
  const limit = positiveInt(url.searchParams.get("limit"), 500, 5000);
  const conditions = ["event_date BETWEEN ? AND ?"], bindings = [from, to];
  const add = (condition, value) => { if (value) { conditions.push(condition); bindings.push(value); } };
  add("outlet_code = ?", outlet);
  add("location_code = ?", location);
  add("item_code = ?", itemCode);
  add("item_name = ? COLLATE NOCASE", itemName);
  add("COALESCE(NULLIF(logical_id, ''), record_id) = ?", logicalId);
  add("record_type = ?", recordType);
  add("movement_type = ?", movementType);
  add("source_hash = ?", sourceHash);
  add("transfer_id = ?", transferId);
  if (cursor) {
    const parts = cursor.split("|");
    if (parts.length !== 3) return apiError(400, "INVALID_CURSOR", "Cursor riwayat tidak valid.", requestId);
    conditions.push("(event_date < ? OR (event_date = ? AND (created_at < ? OR (created_at = ? AND record_id < ?))))");
    bindings.push(parts[0], parts[0], parts[1], parts[1], parts[2]);
  }
  if (!outlet) return apiError(400, "INVALID_FILTER", "Outlet wajib diisi.", requestId);
  const sql = `SELECT * FROM __TABLE__ WHERE ${conditions.join(" AND ")}
               ORDER BY event_date DESC, created_at DESC, record_id DESC LIMIT ?`;
  bindings.push(Math.min(10000, limit * 4 + 100));
  const operations = await env.OPERATIONS_DB.prepare(sql.replace("__TABLE__", "stock_movements")).bind(...bindings).all();
  const history = await queryHistoryDatabases(
    historyDatabasesForRange(env, from, to),
    (database) => database.prepare(sql.replace("__TABLE__", "stock_movements_history")).bind(...bindings)
  );
  const rows = activeMovements([...operations.results, ...history])
    .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)) || String(b.created_at).localeCompare(String(a.created_at)) || String(b.record_id).localeCompare(String(a.record_id)))
    .slice(0, limit);
  const last = rows.at(-1);
  return responseJson({
    ok: true,
    data: rows,
    nextCursor: rows.length === limit && last ? `${last.event_date}|${last.created_at}|${last.record_id}` : null,
    requestId,
  });
}

async function mockRecall(url, env, requestId) {
  const saleLineId = cleanText(url.searchParams.get("sale_line_id"), 100);
  const billNumber = cleanText(url.searchParams.get("bill_number"), 100);
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  if (!saleLineId && !(billNumber && outlet)) {
    return apiError(400, "INVALID_TRACE_KEY", "Isi sale_line_id atau kombinasi outlet dan bill_number.", requestId);
  }
  const lines = saleLineId
    ? await env.OPERATIONS_DB.prepare(
        `SELECT l.*, d.outlet_code, d.sale_date, d.bill_number
           FROM sales_lines l JOIN sales_documents d ON d.document_id = l.document_id
          WHERE l.sale_line_id = ? LIMIT 50`
      ).bind(saleLineId).all()
    : await env.OPERATIONS_DB.prepare(
        `SELECT l.*, d.outlet_code, d.sale_date, d.bill_number
           FROM sales_lines l JOIN sales_documents d ON d.document_id = l.document_id
          WHERE d.outlet_code = ? AND d.bill_number = ?
          ORDER BY l.source_row LIMIT 200`
      ).bind(outlet, billNumber).all();
  const roots = lines.results.map((row) => row.sale_line_id);
  if (roots.length === 0) return responseJson({ ok: true, sales: [], trace: [], requestId });
  const placeholders = roots.map(() => "?").join(",");
  const trace = await env.OPERATIONS_DB.prepare(
    `SELECT trace_root_id, parent_type, parent_id, child_type, child_id,
            relation_type, quantity, unit, event_date
       FROM mock_recall_edges
      WHERE trace_root_id IN (${placeholders})
      ORDER BY trace_root_id, created_at
      LIMIT 1000`
  ).bind(...roots).all();
  return responseJson({ ok: true, sales: lines.results, trace: trace.results, requestId });
}

async function listTransfers(url, env, requestId) {
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  const status = cleanText(url.searchParams.get("status"), 30).toUpperCase();
  const before = cleanText(url.searchParams.get("before"), 40) || "9999-12-31T23:59:59.999Z";
  const limit = positiveInt(url.searchParams.get("limit"), 100);
  if (!outlet) return apiError(400, "INVALID_OUTLET", "Outlet wajib diisi.", requestId);
  const result = await env.OPERATIONS_DB.prepare(
    `SELECT transfer_id, status, from_outlet, from_location, to_outlet, to_location,
            delivery_date, receipt_no, note, created_by, created_by_name, created_at,
            accepted_by, accepted_by_name, accepted_at, received_at, rejected_at,
            rejection_reason, updated_at
       FROM stock_transfers
      WHERE (from_outlet = ? OR to_outlet = ?)
        AND (? = '' OR status = ?) AND created_at < ?
      ORDER BY created_at DESC, transfer_id DESC
      LIMIT ?`
  ).bind(outlet, outlet, status, status, before, limit + 1).all();
  const rows = result.results.slice(0, limit);
  return responseJson({
    ok: true,
    data: rows,
    nextCursor: result.results.length > limit ? rows.at(-1)?.created_at || null : null,
    requestId,
  });
}

async function route(request, env) {
  const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") return health(env, requestId);

  const auth = await authorize(request, env);
  if (!auth.ok) return apiError(auth.status, auth.code, auth.message, requestId);

  if (request.method === "POST" && url.pathname === "/v1/sync/master") return syncMasterData(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/stock-movements") return writeStockMovements(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/transfer-events") return writeTransferEvents(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/items/convert-unit") return convertItemUnit(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/migrate/stock-balances") return migrateStockBalances(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/migrate/stock-movements") return migrateStockMovements(request, env, requestId);
  if (request.method !== "GET") return apiError(405, "METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", requestId);
  if (url.pathname === "/v1/meta/schema") return schemaMeta(env, requestId);
  if (url.pathname === "/v1/sync/status") return masterSyncStatus(env, requestId);
  if (url.pathname === "/v1/migrate/stock-movements/status") return stockMovementMigrationStatus(env, requestId);
  if (url.pathname === "/v1/stock-items") return listStockItems(url, env, requestId);
  if (url.pathname === "/v1/balances") return listBalances(url, env, requestId);
  if (url.pathname === "/v1/stock-card") return listStockCard(url, env, requestId);
  if (url.pathname === "/v1/movements") return listMovements(url, env, requestId);
  if (url.pathname === "/v1/mock-recall") return mockRecall(url, env, requestId);
  if (url.pathname === "/v1/transfers") return listTransfers(url, env, requestId);
  if (url.pathname === "/v1/transfer-events") return listTransferEvents(url, env, requestId);
  return apiError(404, "NOT_FOUND", "Endpoint tidak ditemukan.", requestId);
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
      console.error(JSON.stringify({ event: "request_failed", requestId, message: error instanceof Error ? error.message : String(error) }));
      return apiError(500, "INTERNAL_ERROR", "Terjadi kesalahan pada layanan inventory.", requestId);
    }
  },
};
