var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var MAX_PAGE_SIZE = 200;
var MAX_MASTER_SYNC_BYTES = 5 * 1024 * 1024;
var MASTER_SYNC_BATCH_SIZE = 75;
var MAX_MIGRATION_BATCH_ROWS = 1e3;
var MAX_STOCK_MOVEMENT_BATCH_ROWS = 500;
var MAX_STOCK_WRITE_BATCH_ROWS = 400;
function responseJson(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...extraHeaders
    }
  });
}
__name(responseJson, "responseJson");
function apiError(status, code, message, requestId) {
  return responseJson({ ok: false, error: { code, message }, requestId }, status);
}
__name(apiError, "apiError");
function cleanText(value, maxLength = 200) {
  return String(value ?? "").trim().slice(0, maxLength);
}
__name(cleanText, "cleanText");
function positiveInt(value, fallback, maximum = MAX_PAGE_SIZE) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}
__name(positiveInt, "positiveInt");
function isoDate(value) {
  const text = cleanText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}
__name(isoDate, "isoDate");
function isoTimestamp(value, eventDate = "") {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1e3).toISOString();
  const text = cleanText(value, 40);
  if (text && !Number.isNaN(Date.parse(text))) return new Date(text).toISOString();
  return eventDate ? `${eventDate}T00:00:00.000Z` : (/* @__PURE__ */ new Date()).toISOString();
}
__name(isoTimestamp, "isoTimestamp");
function signedMovement(row) {
  if (cleanText(row.record_type || row.recordType, 40).toUpperCase() !== "MOVEMENT") return 0;
  const quantity = Number(row.quantity ?? row.qty ?? 0);
  const direction = cleanText(row.direction, 10).toUpperCase();
  if (direction === "IN") return quantity;
  if (direction === "OUT") return -quantity;
  return 0;
}
__name(signedMovement, "signedMovement");
function movementRank(row) {
  return [Number(row.version || 1), String(row.created_at || ""), String(row.record_id || "")];
}
__name(movementRank, "movementRank");
function newerMovement(left, right) {
  if (!right) return true;
  const a = movementRank(left), b = movementRank(right);
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}
__name(newerMovement, "newerMovement");
function activeMovements(rows) {
  const latest = /* @__PURE__ */ new Map();
  for (const row of rows || []) {
    const key = cleanText(row.logical_id, 160) || cleanText(row.record_id, 160);
    if (key && newerMovement(row, latest.get(key))) latest.set(key, row);
  }
  return [...latest.values()];
}
__name(activeMovements, "activeMovements");
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
__name(sha256, "sha256");
async function secureEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  let mismatch = leftHash.length ^ rightHash.length;
  for (let index = 0; index < leftHash.length; index += 1) {
    mismatch |= leftHash[index] ^ rightHash[index];
  }
  return mismatch === 0;
}
__name(secureEqual, "secureEqual");
async function authorize(request, env) {
  if (!env.API_KEY) return { ok: false, status: 503, code: "API_NOT_ACTIVATED", message: "API data belum diaktifkan." };
  const supplied = cleanText(request.headers.get("x-api-key"), 512);
  if (!supplied || !await secureEqual(supplied, env.API_KEY)) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Kredensial API tidak valid." };
  }
  return { ok: true };
}
__name(authorize, "authorize");
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
__name(readJsonWithLimit, "readJsonWithLimit");
function limitedArray(value, name, maximum) {
  if (!Array.isArray(value)) throw new Error(`INVALID_${name.toUpperCase()}`);
  if (value.length > maximum) throw new Error(`TOO_MANY_${name.toUpperCase()}`);
  return value;
}
__name(limitedArray, "limitedArray");
function requiredText(value, name, maximum = 180) {
  const result = cleanText(value, maximum);
  if (!result) throw new Error(`INVALID_${name.toUpperCase()}`);
  return result;
}
__name(requiredText, "requiredText");
async function runStatementBatches(database, statements2) {
  let written = 0;
  for (let index = 0; index < statements2.length; index += MASTER_SYNC_BATCH_SIZE) {
    const batch = statements2.slice(index, index + MASTER_SYNC_BATCH_SIZE);
    const results = await database.batch(batch);
    written += results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
  }
  return written;
}
__name(runStatementBatches, "runStatementBatches");
function masterSyncStatements(database, data) {
  const statements2 = [];
  const counts = {};
  const addAll = /* @__PURE__ */ __name((name, rows, maximum, createStatement) => {
    const input = limitedArray(rows, name, maximum);
    counts[name] = input.length;
    for (const row of input) statements2.push(createStatement(row || {}));
  }, "addAll");
  addAll("outlets", data.outlets, 500, (row) => database.prepare(
    `INSERT INTO outlets(outlet_code, outlet_name, active, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(outlet_code) DO UPDATE SET
       outlet_name = excluded.outlet_name, active = excluded.active, updated_at = CURRENT_TIMESTAMP`
  ).bind(requiredText(row.outletCode, "outlet_code", 40).toUpperCase(), requiredText(row.outletName, "outlet_name"), row.active === false ? 0 : 1));
  addAll("locations", data.locations, 3e3, (row) => database.prepare(
    `INSERT INTO stock_locations(outlet_code, location_code, location_name, active, created_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(outlet_code, location_code) DO UPDATE SET
       location_name = excluded.location_name, active = excluded.active, created_by = excluded.created_by`
  ).bind(requiredText(row.outletCode, "outlet_code", 40).toUpperCase(), requiredText(row.locationCode, "location_code", 80), requiredText(row.locationName, "location_name", 120), row.active === false ? 0 : 1, cleanText(row.updatedBy || "MASTER_SYNC", 100)));
  addAll("items", data.items, 2e4, (row) => database.prepare(
    `INSERT INTO stock_items(item_code, category, item_name, default_unit, active, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(item_code) DO UPDATE SET
       category = excluded.category, item_name = excluded.item_name,
       default_unit = excluded.default_unit, active = excluded.active, updated_at = CURRENT_TIMESTAMP`
  ).bind(requiredText(row.itemCode, "item_code", 80).toUpperCase(), cleanText(row.category || "Uncategorized", 100), requiredText(row.itemName, "item_name"), requiredText(row.defaultUnit, "default_unit", 40), row.active === false ? 0 : 1));
  addAll("conversions", data.conversions, 3e4, (row) => {
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
  addAll("formulas", data.formulas, 1e4, (row) => {
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
  addAll("materials", data.materials, 5e4, (row) => {
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
  addAll("showcaseItems", data.showcaseItems, 1e4, (row) => {
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
  return { statements: statements2, counts };
}
__name(masterSyncStatements, "masterSyncStatements");
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
    const { statements: statements2, counts } = masterSyncStatements(masterDatabase, data);
    const existing = await operationsDatabase.prepare(
      "SELECT status, result_json FROM upload_jobs WHERE upload_type = 'MASTER_SYNC' AND source_hash = ? LIMIT 1"
    ).bind(sourceHash).first();
    if (existing?.status === "COMPLETED") {
      let previous = {};
      try {
        previous = JSON.parse(existing.result_json || "{}");
      } catch {
        previous = {};
      }
      return responseJson({ ok: true, duplicate: true, syncId, counts: previous.counts || counts, requestId });
    }
    await operationsDatabase.prepare(
      `INSERT INTO upload_jobs(job_id, upload_type, source_hash, status, total_rows,
          processed_rows, checkpoint_row, result_json, created_by, started_at, updated_at)
       VALUES (?, 'MASTER_SYNC', ?, 'PROCESSING', ?, 0, 0, ?, 'APPS_SCRIPT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(upload_type, source_hash) DO UPDATE SET
         status = 'PROCESSING', total_rows = excluded.total_rows, result_json = excluded.result_json,
         error_message = NULL, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`
    ).bind(syncId, sourceHash, statements2.length, JSON.stringify({ generatedAt, counts })).run();
    const written = await runStatementBatches(masterDatabase, statements2);
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
__name(syncMasterData, "syncMasterData");
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
    ).first()
  ]);
  return responseJson({ ok: true, jobs: jobs.results, counts: counts || {}, requestId });
}
__name(masterSyncStatus, "masterSyncStatus");
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
    const statements = rows.map((row) => {
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
        cleanText(row.itemName, 180),
        quantity,
        cleanText(row.unit, 40) || null,
        cleanText(row.updatedAt, 40) || (/* @__PURE__ */ new Date()).toISOString()
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
__name(migrateStockBalances, "migrateStockBalances");
function normalizeMovement(row) {
  const source = row?.json && typeof row.json === "object" ? row.json : row || {};
  const recordType = cleanText(source.record_type ?? source.recordType, 40).toUpperCase() || "MOVEMENT";
  const suppliedItemCode = cleanText(source.item_code ?? source.itemCode, 80).toUpperCase();
  const systemItemCode = recordType === "IMPORT" ? "__IMPORT__" : recordType === "LOG" ? "__LOG__" : "";
  const eventDate = isoDate(source.event_date ?? source.eventDate);
  const quantity = Number(source.qty ?? source.quantity);
  const sourceRowValue = source.source_row ?? source.sourceRow;
  const sourceRow = sourceRowValue === null || sourceRowValue === void 0 || sourceRowValue === "" ? null : Number.parseInt(String(sourceRowValue), 10);
  if (!eventDate) throw new Error("INVALID_EVENT_DATE");
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error("INVALID_QUANTITY");
  if (sourceRow !== null && !Number.isFinite(sourceRow)) throw new Error("INVALID_SOURCE_ROW");
  const direction = cleanText(source.direction, 10).toUpperCase() || "NONE";
  if (!["IN", "OUT", "NONE", "LOT"].includes(direction)) throw new Error("INVALID_DIRECTION");
  return {
    record_id: requiredText(source.record_id ?? source.recordId ?? row?.insertId, "record_id", 160),
    logical_id: cleanText(source.logical_id ?? source.logicalId, 160) || null,
    version: Math.max(1, Number.parseInt(String(source.version || 1), 10) || 1),
    record_type: recordType,
    outlet_code: requiredText(source.outlet ?? source.outlet_code ?? source.outletCode, "outlet_code", 40).toUpperCase(),
    location_code: requiredText(source.location ?? source.location_code ?? source.locationCode, "location_code", 80),
    item_code: requiredText(suppliedItemCode || systemItemCode, "item_code", 80).toUpperCase(),
    category: cleanText(source.category, 100) || null,
    item_name: cleanText(source.item_name ?? source.itemName, 180) || null,
    unit: cleanText(source.unit, 40) || (["IMPORT", "LOG"].includes(recordType) ? "NONE" : "PCS"),
    direction: direction === "LOT" ? "NONE" : direction,
    quantity,
    movement_type: cleanText(source.movement_type ?? source.movementType, 100) || "UNKNOWN",
    info: cleanText(source.info, 1e3) || null,
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
    created_at: isoTimestamp(source.created_at ?? source.createdAt, eventDate)
  };
}
__name(normalizeMovement, "normalizeMovement");
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
    row.record_id,
    row.logical_id,
    row.version,
    row.record_type,
    row.outlet_code,
    row.location_code,
    row.item_code,
    row.category,
    row.item_name,
    row.unit,
    row.direction,
    row.quantity,
    row.movement_type,
    row.info,
    row.event_date,
    row.arrival_date,
    row.production_date,
    row.expiry_date,
    row.supplier,
    row.lot_id,
    row.sale_line_id,
    row.transfer_id,
    row.source_file,
    row.source_object_key,
    row.source_hash,
    row.source_row,
    row.created_by,
    row.created_at
  );
}
__name(movementInsertStatement, "movementInsertStatement");
var HISTORY_MONTH_BINDINGS = [
  ["2026-08", "HISTORY_DB_2026_08"],
  ["2026-09", "HISTORY_DB_2026_09"],
  ["2026-10", "HISTORY_DB_2026_10"],
  ["2026-11", "HISTORY_DB_2026_11"],
  ["2026-12", "HISTORY_DB_2026_12"]
];
function historyDatabaseEntries(env) {
  const entries = [{ key: "legacy-2026", database: env.HISTORY_DB_2026, legacy: true }];
  for (const [key, binding] of HISTORY_MONTH_BINDINGS) {
    if (env[binding]) entries.push({ key, database: env[binding], legacy: false });
  }
  return entries;
}
__name(historyDatabaseEntries, "historyDatabaseEntries");
function historyDatabaseForDate(env, eventDate) {
  const month = String(eventDate || "").slice(0, 7);
  const binding = HISTORY_MONTH_BINDINGS.find(([key]) => key === month)?.[1];
  if (!binding || !env[binding]) throw new Error(`HISTORY_MONTH_NOT_CONFIGURED:${month || "UNKNOWN"}`);
  return { key: month, database: env[binding] };
}
__name(historyDatabaseForDate, "historyDatabaseForDate");
function historyDatabasesForRange(env, from, to) {
  const start = String(from || "0000-01-01").slice(0, 7);
  const end = String(to || "9999-12-31").slice(0, 7);
  const overlapsLegacy = String(from || "0000-01-01") <= "2026-08-23" && String(to || "9999-12-31") >= "2026-06-20";
  return historyDatabaseEntries(env).filter((entry) => entry.legacy ? overlapsLegacy : entry.key >= start && entry.key <= end);
}
__name(historyDatabasesForRange, "historyDatabasesForRange");
async function queryHistoryDatabases(entries, statementFactory) {
  const rows = [];
  for (const entry of entries) {
    const result = await statementFactory(entry.database).all();
    rows.push(...result.results);
  }
  return rows;
}
__name(queryHistoryDatabases, "queryHistoryDatabases");
async function existingMovementState(env, rows) {
  const logicalIds = [...new Set(rows.map((row) => row.logical_id || row.record_id))];
  const recordIds = [...new Set(rows.map((row) => row.record_id))];
  const eventDates = rows.map((row) => row.event_date).filter(Boolean).sort();
  const historyEntries = historyDatabasesForRange(env, eventDates[0], eventDates.at(-1));
  const existing = [], duplicateIds = /* @__PURE__ */ new Set();
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
  const active = /* @__PURE__ */ new Map();
  for (const row of existing) {
    const key = cleanText(row.logical_id, 160) || cleanText(row.record_id, 160);
    if (key && newerMovement(row, active.get(key))) active.set(key, row);
  }
  return { active, duplicateIds };
}
__name(existingMovementState, "existingMovementState");
async function writeStockMovements(request, env, requestId) {
  let payload;
  try {
    payload = await readJsonWithLimit(request, MAX_MASTER_SYNC_BYTES);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_PAYLOAD";
    return apiError(code === "PAYLOAD_TOO_LARGE" ? 413 : 400, code, "Payload transaksi stok tidak valid.", requestId);
  }
  const input = Array.isArray(payload?.rows) ? payload.rows : null;
  if (!input || input.length === 0 || input.length > MAX_STOCK_WRITE_BATCH_ROWS) {
    return apiError(400, "INVALID_BATCH", `Batch transaksi stok harus berisi 1 sampai ${MAX_STOCK_WRITE_BATCH_ROWS} baris.`, requestId);
  }
  try {
    const rows = input.map(normalizeMovement);
    const state = await existingMovementState(env, rows);
    const accepted = [], balanceDeltas = /* @__PURE__ */ new Map();
    rows.sort((a, b) => a.version - b.version || a.created_at.localeCompare(b.created_at));
    for (const row of rows) {
      if (state.duplicateIds.has(row.record_id)) continue;
      accepted.push(row);
      const logicalId = row.logical_id || row.record_id;
      const previous = state.active.get(logicalId);
      if (newerMovement(row, previous)) {
        const delta = signedMovement(row) - (previous ? signedMovement(previous) : 0);
        const key = `${row.outlet_code}${row.location_code}${row.item_code}`;
        const current = balanceDeltas.get(key) || { row, delta: 0 };
        current.row = row;
        current.delta += delta;
        balanceDeltas.set(key, current);
        state.active.set(logicalId, row);
      }
    }
    const statements2 = accepted.map((row) => movementInsertStatement(env.OPERATIONS_DB, row));
    for (const { row, delta } of balanceDeltas.values()) {
      if (Math.abs(delta) < 1e-9) continue;
      statements2.push(env.OPERATIONS_DB.prepare(
        `INSERT INTO stock_balances(outlet_code, location_code, item_code, item_name, current_qty, unit, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(outlet_code, location_code, item_code) DO UPDATE SET
           item_name = excluded.item_name,
           current_qty = stock_balances.current_qty + excluded.current_qty,
           unit = excluded.unit, updated_at = excluded.updated_at`
      ).bind(row.outlet_code, row.location_code, row.item_code, row.item_name, delta, row.unit, row.created_at));
    }
    // Keep movement rows and their balance deltas atomic. With the GAS caller
    // capped at 400 rows this remains below the paid Workers per-request D1
    // query allowance even when every row creates a distinct balance update.
    const batchResults = statements2.length ? await env.OPERATIONS_DB.batch(statements2) : [];
    const written = batchResults.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
    console.log(JSON.stringify({ event: "stock_movements_written", received: rows.length, accepted: accepted.length, written, requestId }));
    return responseJson({ ok: true, received: rows.length, accepted: accepted.length, duplicates: rows.length - accepted.length, written, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "stock_movement_write_failed", message, requestId }));
    return apiError(400, "STOCK_MOVEMENT_WRITE_FAILED", message, requestId);
  }
}
__name(writeStockMovements, "writeStockMovements");
function normalizeTransferEvent(row) {
  const source = row?.json && typeof row.json === "object" ? row.json : row || {};
  const numberOrNull = /* @__PURE__ */ __name((value) => value === null || value === void 0 || value === "" ? null : Number(value), "numberOrNull");
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
    qty: numberOrNull(source.qty),
    received_qty: numberOrNull(source.received_qty ?? source.receivedQty),
    note: cleanText(source.note, 1e3) || null,
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
    rejection_reason: cleanText(source.rejection_reason ?? source.rejectionReason, 1e3) || null,
    receipt_no: cleanText(source.receipt_no ?? source.receiptNo, 160) || null,
    photo_file_ids: cleanText(source.photo_file_ids ?? source.photoFileIds, 2e3) || null,
    photo_count: Math.max(0, Number.parseInt(String(source.photo_count ?? source.photoCount ?? 0), 10) || 0),
    photo_data_json: cleanText(source.photo_data_json ?? source.photoDataJson, 1e6) || null
  };
}
__name(normalizeTransferEvent, "normalizeTransferEvent");
async function writeTransferEvents(request, env, requestId) {
  let payload;
  try {
    payload = await readJsonWithLimit(request, MAX_MASTER_SYNC_BYTES);
  } catch (error) {
    return apiError(400, "INVALID_PAYLOAD", "Payload transfer tidak valid.", requestId);
  }
  const input = Array.isArray(payload?.rows) ? payload.rows : null;
  if (!input || input.length === 0 || input.length > 500) return apiError(400, "INVALID_BATCH", "Batch transfer harus berisi 1 sampai 500 baris.", requestId);
  try {
    const columns = ["event_id", "transfer_id", "status", "from_outlet", "from_location", "to_outlet", "to_location", "item_code", "category", "item_name", "unit", "qty", "received_qty", "note", "expiry_date", "delivery_date", "created_by", "created_by_name", "created_at", "accepted_by", "accepted_by_name", "accepted_at", "received_at", "storage_entered_at", "product_temperature", "rejected_by", "rejected_by_name", "rejected_at", "rejection_reason", "receipt_no", "photo_file_ids", "photo_count", "photo_data_json"];
    const statements2 = input.map((raw) => {
      const row = normalizeTransferEvent(raw);
      return env.OPERATIONS_DB.prepare(
        `INSERT INTO stock_transfer_events(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(event_id) DO NOTHING`
      ).bind(...columns.map((column) => row[column]));
    });
    const written = await runStatementBatches(env.OPERATIONS_DB, statements2);
    return responseJson({ ok: true, received: input.length, written, requestId });
  } catch (error) {
    return apiError(400, "TRANSFER_WRITE_FAILED", error instanceof Error ? error.message : String(error), requestId);
  }
}
__name(writeTransferEvents, "writeTransferEvents");
async function convertItemUnit(request, env, requestId) {
  let payload;
  try {
    payload = await readJsonWithLimit(request, 1e5);
  } catch (error) {
    return apiError(400, "INVALID_PAYLOAD", "Payload konversi unit tidak valid.", requestId);
  }
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
        entry.database.prepare("UPDATE stock_lot_allocations_history SET quantity = quantity * ?, unit = ? WHERE UPPER(unit) = ? AND movement_id IN (SELECT record_id FROM stock_movements_history WHERE item_code = ?)").bind(factor, newUnit, oldUnit, itemCode)
      ]));
    }
    const operationResults = await env.OPERATIONS_DB.batch([
      env.OPERATIONS_DB.prepare("UPDATE stock_movements SET quantity = quantity * ?, unit = ? WHERE item_code = ? AND UPPER(unit) = ?").bind(factor, newUnit, itemCode, oldUnit),
      env.OPERATIONS_DB.prepare("UPDATE stock_balances SET current_qty = current_qty * ?, unit = ?, updated_at = CURRENT_TIMESTAMP WHERE item_code = ? AND UPPER(COALESCE(unit, '')) = ?").bind(factor, newUnit, itemCode, oldUnit),
      env.OPERATIONS_DB.prepare("UPDATE stock_lots SET original_qty = original_qty * ?, current_qty = current_qty * ?, unit = ?, updated_at = CURRENT_TIMESTAMP WHERE item_code = ? AND UPPER(unit) = ?").bind(factor, factor, newUnit, itemCode, oldUnit),
      env.OPERATIONS_DB.prepare("UPDATE stock_transfer_lines SET requested_qty = requested_qty * ?, received_qty = CASE WHEN received_qty IS NULL THEN NULL ELSE received_qty * ? END, unit = ? WHERE item_code = ? AND UPPER(unit) = ?").bind(factor, factor, newUnit, itemCode, oldUnit),
      env.OPERATIONS_DB.prepare("UPDATE stock_transfer_events SET qty = CASE WHEN qty IS NULL THEN NULL ELSE qty * ? END, received_qty = CASE WHEN received_qty IS NULL THEN NULL ELSE received_qty * ? END, unit = ? WHERE item_code = ? AND UPPER(COALESCE(unit, '')) = ?").bind(factor, factor, newUnit, itemCode, oldUnit)
    ]);
    const masterResult = await env.MASTER_DB.prepare("UPDATE stock_items SET default_unit = ?, updated_at = CURRENT_TIMESTAMP WHERE item_code = ? AND UPPER(default_unit) = ?").bind(newUnit, itemCode, oldUnit).run();
    const changes = /* @__PURE__ */ __name((results) => results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0), "changes");
    return responseJson({ ok: true, itemCode, oldUnit, newUnit, historyRows: changes(historyResults), operationRows: changes(operationResults), masterRows: Number(masterResult.meta?.changes || 0), requestId });
  } catch (error) {
    return apiError(400, "UNIT_CONVERSION_FAILED", error instanceof Error ? error.message : String(error), requestId);
  }
}
__name(convertItemUnit, "convertItemUnit");
async function listTransferEvents(url, env, requestId) {
  const transferId = cleanText(url.searchParams.get("transfer_id"), 160);
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  if (!transferId && !outlet) return apiError(400, "INVALID_FILTER", "transfer_id atau outlet wajib diisi.", requestId);
  const result = transferId ? await env.OPERATIONS_DB.prepare("SELECT * FROM stock_transfer_events WHERE transfer_id = ? ORDER BY created_at, status, item_name, expiry_date").bind(transferId).all() : await env.OPERATIONS_DB.prepare("SELECT * FROM stock_transfer_events WHERE from_outlet = ? OR to_outlet = ? ORDER BY created_at DESC LIMIT 5000").bind(outlet, outlet).all();
  return responseJson({ ok: true, data: result.results, requestId });
}
__name(listTransferEvents, "listTransferEvents");
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
    const groupedStatements = /* @__PURE__ */ new Map();
    rows.forEach((row) => {
      const quantity = Number(row.quantity);
      const version = Math.max(1, Number.parseInt(String(row.version || 1), 10) || 1);
      const sourceRow = row.sourceRow === null || row.sourceRow === void 0 || row.sourceRow === "" ? null : Number.parseInt(String(row.sourceRow), 10);
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
        cleanText(row.info, 1e3) || null,
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
      requestId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "stock_movement_migration_failed", message, requestId }));
    return apiError(400, "STOCK_MOVEMENT_MIGRATION_FAILED", message, requestId);
  }
}
__name(migrateStockMovements, "migrateStockMovements");
async function stockMovementMigrationStatus(env, requestId) {
  const sql = `SELECT COUNT(*) AS row_count, COUNT(DISTINCT record_id) AS record_count,
                      MIN(event_date) AS min_date, MAX(event_date) AS max_date,
                      MIN(created_at) AS first_created_at, MAX(created_at) AS last_created_at
                 FROM stock_movements_history`;
  const partitions = [];
  for (const entry of historyDatabaseEntries(env)) {
    partitions.push({ key: entry.key, ...await entry.database.prepare(sql).first() || {} });
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
      max_date: present.map((row) => row.max_date).filter(Boolean).sort().at(-1) || null
    },
    partitions,
    requestId
  });
}
__name(stockMovementMigrationStatus, "stockMovementMigrationStatus");
async function databaseHealth(database, role) {
  const [migration, objects] = await database.batch([
    database.prepare("SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC, version DESC LIMIT 1"),
    database.prepare("SELECT COUNT(*) AS object_count FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'")
  ]);
  return {
    role,
    ready: true,
    schemaVersion: migration.results[0]?.version || null,
    schemaObjects: Number(objects.results[0]?.object_count || 0)
  };
}
__name(databaseHealth, "databaseHealth");
async function health(env, requestId) {
  const databases = [
    await databaseHealth(env.MASTER_DB, "master"),
    await databaseHealth(env.OPERATIONS_DB, "operations")
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
    requestId
  });
}
__name(health, "health");
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
      histories
    },
    requestId
  });
}
__name(schemaMeta, "schemaMeta");
async function listStockItems(url, env, requestId) {
  const limit = positiveInt(url.searchParams.get("limit"), 100);
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
    requestId
  });
}
__name(listStockItems, "listStockItems");
async function listBalances(url, env, requestId) {
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  const location = cleanText(url.searchParams.get("location"), 80);
  const cursor = cleanText(url.searchParams.get("cursor"), 80).toUpperCase();
  const limit = positiveInt(url.searchParams.get("limit"), 100);
  if (!outlet || !location) return apiError(400, "INVALID_SCOPE", "Outlet dan lokasi wajib diisi.", requestId);
  const result = await env.OPERATIONS_DB.prepare(
    `SELECT item_code, item_name, current_qty, unit, updated_at
       FROM stock_balances
      WHERE outlet_code = ? AND location_code = ? AND item_code > ?
      ORDER BY item_code
      LIMIT ?`
  ).bind(outlet, location, cursor, limit + 1).all();
  const rows = result.results.slice(0, limit);
  return responseJson({
    ok: true,
    data: rows,
    nextCursor: result.results.length > limit ? rows.at(-1)?.item_code || null : null,
    requestId
  });
}
__name(listBalances, "listBalances");
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
  const bindings = [outlet, location, itemCode, from, to, beforeCreatedAt, Math.min(1e3, limit * 4 + 20)];
  const operations = await env.OPERATIONS_DB.prepare(sql.replace("__TABLE__", "stock_movements")).bind(...bindings).all();
  const history = await queryHistoryDatabases(
    historyDatabasesForRange(env, from, to),
    (database) => database.prepare(sql.replace("__TABLE__", "stock_movements_history")).bind(...bindings)
  );
  const merged = activeMovements([...operations.results, ...history]).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.record_id).localeCompare(String(a.record_id)));
  const rows = merged.slice(0, limit);
  return responseJson({
    ok: true,
    data: rows,
    nextCursor: merged.length > limit ? rows.at(-1)?.created_at || null : null,
    requestId
  });
}
__name(listStockCard, "listStockCard");
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
  const limit = positiveInt(url.searchParams.get("limit"), 500, 5e3);
  const conditions = ["event_date BETWEEN ? AND ?"], bindings = [from, to];
  const add = /* @__PURE__ */ __name((condition, value) => {
    if (value) {
      conditions.push(condition);
      bindings.push(value);
    }
  }, "add");
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
  bindings.push(Math.min(1e4, limit * 4 + 100));
  const operations = await env.OPERATIONS_DB.prepare(sql.replace("__TABLE__", "stock_movements")).bind(...bindings).all();
  const history = await queryHistoryDatabases(
    historyDatabasesForRange(env, from, to),
    (database) => database.prepare(sql.replace("__TABLE__", "stock_movements_history")).bind(...bindings)
  );
  const rows = activeMovements([...operations.results, ...history]).sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)) || String(b.created_at).localeCompare(String(a.created_at)) || String(b.record_id).localeCompare(String(a.record_id))).slice(0, limit);
  const last = rows.at(-1);
  return responseJson({
    ok: true,
    data: rows,
    nextCursor: rows.length === limit && last ? `${last.event_date}|${last.created_at}|${last.record_id}` : null,
    requestId
  });
}
__name(listMovements, "listMovements");

function showcaseAgeBuckets(lots, eventDate) {
  const result = { fresh: 0, green: 0, yellow: 0, red: 0 };
  const selectedTime = Date.parse(`${eventDate}T00:00:00Z`);
  for (const lot of lots || []) {
    const quantity = Math.max(0, Number(lot.quantity || 0));
    if (quantity <= 1e-7) continue;
    const entryTime = Date.parse(`${String(lot.entryDate || "").slice(0, 10)}T00:00:00Z`);
    const age = Number.isFinite(entryTime) && Number.isFinite(selectedTime)
      ? Math.max(0, Math.floor((selectedTime - entryTime) / 864e5))
      : 3;
    if (age === 0) result.fresh += quantity;
    else if (age === 1) result.green += quantity;
    else if (age === 2) result.yellow += quantity;
    else result.red += quantity;
  }
  for (const key of Object.keys(result)) result[key] = Math.round(result[key] * 1e6) / 1e6;
  return result;
}
__name(showcaseAgeBuckets, "showcaseAgeBuckets");

function sortShowcaseLots(lots) {
  lots.sort((left, right) =>
    String(left.expiryDate || "9999-12-31").localeCompare(String(right.expiryDate || "9999-12-31")) ||
    String(left.sourceDate || "").localeCompare(String(right.sourceDate || "")) ||
    String(left.entryDate || "").localeCompare(String(right.entryDate || "")) ||
    String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
  );
}
__name(sortShowcaseLots, "sortShowcaseLots");

function applyShowcaseLotMovement(state, row) {
  const quantity = Math.max(0, Number(row.quantity || 0));
  if (quantity <= 1e-7) return;
  const direction = cleanText(row.direction, 10).toUpperCase();
  if (direction === "LOT" && cleanText(row.movement_type, 100) === "Lot Balance Override") {
    let detail = null;
    try { detail = JSON.parse(String(row.info || "")); } catch {}
    if (Array.isArray(detail?.lots)) {
      state.lots = detail.lots.filter((lot) => Number(lot.qty || 0) > 1e-7).map((lot) => ({
        quantity: Number(lot.qty || 0),
        entryDate: cleanText(lot.stockInDate || lot.showcaseDate || lot.arrivalDate || row.event_date, 10),
        expiryDate: cleanText(lot.expiryDate, 10),
        sourceDate: cleanText(lot.arrivalDate, 10),
        createdAt: cleanText(row.created_at, 40)
      }));
      state.debt = 0;
      sortShowcaseLots(state.lots);
    }
    return;
  }
  if (direction === "IN") {
    let remaining = quantity;
    if (state.debt > 1e-7) {
      const covered = Math.min(remaining, state.debt);
      state.debt -= covered;
      remaining -= covered;
    }
    if (remaining > 1e-7) {
      state.lots.push({
        quantity: remaining,
        entryDate: cleanText(row.event_date, 10),
        expiryDate: cleanText(row.expiry_date, 10),
        sourceDate: cleanText(row.arrival_date || row.event_date, 10),
        createdAt: cleanText(row.created_at, 40)
      });
      sortShowcaseLots(state.lots);
    }
    return;
  }
  if (direction !== "OUT") return;
  let remaining = quantity;
  sortShowcaseLots(state.lots);
  for (const lot of state.lots) {
    if (remaining <= 1e-7) break;
    const available = Math.max(0, Number(lot.quantity || 0));
    const used = Math.min(available, remaining);
    lot.quantity = available - used;
    remaining -= used;
  }
  state.lots = state.lots.filter((lot) => Number(lot.quantity || 0) > 1e-7);
  if (remaining > 1e-7) state.debt += remaining;
}
__name(applyShowcaseLotMovement, "applyShowcaseLotMovement");

function buildShowcaseSummary(rows, eventDate) {
  const states = new Map();
  const ordered = activeMovements(rows).sort((left, right) =>
    String(left.event_date).localeCompare(String(right.event_date)) ||
    String(left.created_at).localeCompare(String(right.created_at)) ||
    String(left.record_id).localeCompare(String(right.record_id))
  );
  for (const row of ordered) {
    const itemCode = cleanText(row.item_code, 80).toUpperCase();
    const itemName = cleanText(row.item_name, 180);
    const key = itemCode || `NAME|${itemName.toLowerCase()}`;
    if (!key) continue;
    if (!states.has(key)) states.set(key, {
      item_code: itemCode,
      item_name: itemName,
      previous_balance: 0,
      balance: 0,
      total_in: 0,
      total_sold: 0,
      total_waste: 0,
      in_actors: new Map(),
      sold_actors: new Map(),
      waste_actors: new Map(),
      lots: [], debt: 0, previous_aging: null, selectedDayStarted: false
    });
    const state = states.get(key);
    const rowDate = cleanText(row.event_date, 10);
    if (rowDate === eventDate && !state.selectedDayStarted) {
      state.previous_aging = showcaseAgeBuckets(state.lots, eventDate);
      state.selectedDayStarted = true;
    }
    const signed = signedMovement(row);
    if (rowDate < eventDate) state.previous_balance += signed;
    state.balance += signed;
    if (rowDate === eventDate && Math.abs(signed) > 1e-7) {
      const actorKey = `${cleanText(row.created_by, 100)}|${cleanText(row.source_file, 180)}`;
      const actor = { created_by: cleanText(row.created_by, 100), source_file: cleanText(row.source_file, 180) };
      const movementType = cleanText(row.movement_type, 100);
      if (movementType === "Transfer In") { state.total_in += signed; state.in_actors.set(actorKey, actor); }
      if (movementType === "Terjual" || movementType === "Sold") { state.total_sold -= signed; state.sold_actors.set(actorKey, actor); }
      if (movementType === "Waste") { state.total_waste -= signed; state.waste_actors.set(actorKey, actor); }
    }
    applyShowcaseLotMovement(state, row);
  }
  return [...states.values()].map((state) => ({
    item_code: state.item_code,
    item_name: state.item_name,
    previous_balance: Math.round(state.previous_balance * 1e6) / 1e6,
    balance: Math.round(state.balance * 1e6) / 1e6,
    total_in: Math.round(state.total_in * 1e6) / 1e6,
    total_sold: Math.round(state.total_sold * 1e6) / 1e6,
    total_waste: Math.round(state.total_waste * 1e6) / 1e6,
    in_actors: [...state.in_actors.values()],
    sold_actors: [...state.sold_actors.values()],
    waste_actors: [...state.waste_actors.values()],
    previous_aging: state.previous_aging || showcaseAgeBuckets(state.lots, eventDate),
    balance_aging: showcaseAgeBuckets(state.lots, eventDate)
  }));
}
__name(buildShowcaseSummary, "buildShowcaseSummary");

function buildCurrentShowcaseSummary(rows, balances, eventDate) {
  const daily = buildShowcaseSummary(rows, eventDate);
  const states = new Map(daily.map((item) => [cleanText(item.item_code, 80).toUpperCase() || `NAME|${cleanText(item.item_name, 180).toLowerCase()}`, item]));
  for (const balance of balances || []) {
    const itemCode = cleanText(balance.item_code, 80).toUpperCase();
    const itemName = cleanText(balance.item_name, 180);
    const key = itemCode || `NAME|${itemName.toLowerCase()}`;
    if (!key) continue;
    if (!states.has(key)) states.set(key, {
      item_code: itemCode, item_name: itemName, balance: 0,
      total_in: 0, total_sold: 0, total_waste: 0,
      in_actors: [], sold_actors: [], waste_actors: []
    });
    const state = states.get(key);
    const current = Number(balance.current_qty || 0);
    const dayDelta = Number(state.balance || 0);
    state.item_code = itemCode || state.item_code;
    state.item_name = itemName || state.item_name;
    state.previous_balance = Math.round((current - dayDelta) * 1e6) / 1e6;
    state.balance = Math.round(current * 1e6) / 1e6;
    state.previous_aging = null;
    state.balance_aging = null;
  }
  return [...states.values()];
}
__name(buildCurrentShowcaseSummary, "buildCurrentShowcaseSummary");

async function readShowcaseProgressRows(env, month, outlet = "") {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const from = `${month}-01`, to = `${month}-${String(lastDay).padStart(2, "0")}`;
  const outletCondition = outlet ? " AND outlet_code = ?" : "";
  const bindings = outlet ? [from, to, outlet] : [from, to];
  const sql = `SELECT record_id, logical_id, version, event_date, outlet_code, movement_type, created_at
                 FROM __TABLE__
                WHERE event_date BETWEEN ? AND ?${outletCondition}
                  AND record_type = 'LOG' AND location_code = 'Showcase'
                  AND movement_type IN ('Showcase Log In', 'Showcase Log Sold', 'Showcase Log Waste')`;
  const entries = historyDatabasesForRange(env, from, to);
  const results = await Promise.all([
    env.OPERATIONS_DB.prepare(sql.replace("__TABLE__", "stock_movements")).bind(...bindings).all(),
    ...entries.map((entry) => entry.database.prepare(sql.replace("__TABLE__", "stock_movements_history")).bind(...bindings).all())
  ]);
  const status = new Map();
  for (const row of activeMovements(results.flatMap((result) => result.results || []))) {
    const key = `${cleanText(row.outlet_code, 40).toUpperCase()}|${cleanText(row.event_date, 10)}`;
    const value = status.get(key) || { outlet: cleanText(row.outlet_code, 40).toUpperCase(), date: cleanText(row.event_date, 10), stockIn: false, sold: false, waste: false };
    if (row.movement_type === "Showcase Log In") value.stockIn = true;
    if (row.movement_type === "Showcase Log Sold") value.sold = true;
    if (row.movement_type === "Showcase Log Waste") value.waste = true;
    status.set(key, value);
  }
  return [...status.values()].sort((left, right) => left.outlet.localeCompare(right.outlet) || left.date.localeCompare(right.date));
}
__name(readShowcaseProgressRows, "readShowcaseProgressRows");

async function listShowcaseLog(url, env, requestId) {
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  const eventDate = isoDate(url.searchParams.get("date"));
  const current = url.searchParams.get("current") === "1";
  if (!outlet || !eventDate) return apiError(400, "INVALID_FILTER", "Outlet dan tanggal Showcase wajib diisi.", requestId);
  if (current) {
    const daySql = `SELECT record_id, logical_id, version, record_type, item_code, item_name, direction, quantity,
                           movement_type, info, event_date, arrival_date, expiry_date, source_file, created_by, created_at
                      FROM __TABLE__
                     WHERE outlet_code = ? AND location_code = 'Showcase'
                       AND record_type = 'MOVEMENT' AND event_date = ?`;
    const entries = historyDatabasesForRange(env, eventDate, eventDate);
    const [balances, dayResults, progress] = await Promise.all([
      env.OPERATIONS_DB.prepare(
        `SELECT item_code, item_name, current_qty FROM stock_balances
          WHERE outlet_code = ? AND location_code = 'Showcase'`
      ).bind(outlet).all(),
      Promise.all([
        env.OPERATIONS_DB.prepare(daySql.replace("__TABLE__", "stock_movements")).bind(outlet, eventDate).all(),
        ...entries.map((entry) => entry.database.prepare(daySql.replace("__TABLE__", "stock_movements_history")).bind(outlet, eventDate).all())
      ]),
      readShowcaseProgressRows(env, eventDate.slice(0, 7), outlet)
    ]);
    const movements = dayResults.flatMap((result) => result.results || []);
    return responseJson({
      ok: true, outlet, eventDate,
      items: buildCurrentShowcaseSummary(movements, balances.results || [], eventDate),
      progress, agingPending: true, requestId
    });
  }
  const sql = `SELECT record_id, logical_id, version, record_type, item_code, item_name, direction, quantity,
                      movement_type, info, event_date, arrival_date, expiry_date, source_file, created_by, created_at
                 FROM __TABLE__
                WHERE outlet_code = ? AND location_code = 'Showcase'
                  AND record_type = 'MOVEMENT' AND event_date <= ?`;
  const entries = historyDatabasesForRange(env, "0000-01-01", eventDate);
  const [movementResults, progress] = await Promise.all([
    Promise.all([
      env.OPERATIONS_DB.prepare(sql.replace("__TABLE__", "stock_movements")).bind(outlet, eventDate).all(),
      ...entries.map((entry) => entry.database.prepare(sql.replace("__TABLE__", "stock_movements_history")).bind(outlet, eventDate).all())
    ]),
    readShowcaseProgressRows(env, eventDate.slice(0, 7), outlet)
  ]);
  const movements = movementResults.flatMap((result) => result.results || []);
  return responseJson({ ok: true, outlet, eventDate, items: buildShowcaseSummary(movements, eventDate), progress, requestId });
}
__name(listShowcaseLog, "listShowcaseLog");

async function listShowcaseAging(url, env, requestId) {
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  const eventDate = isoDate(url.searchParams.get("date"));
  if (!outlet || !eventDate) return apiError(400, "INVALID_FILTER", "Outlet dan tanggal Showcase wajib diisi.", requestId);
  const sql = `SELECT record_id, logical_id, version, record_type, item_code, item_name, direction, quantity,
                      movement_type, info, event_date, arrival_date, expiry_date, source_file, created_by, created_at
                 FROM __TABLE__
                WHERE outlet_code = ? AND location_code = 'Showcase'
                  AND record_type = 'MOVEMENT' AND event_date <= ?`;
  const entries = historyDatabasesForRange(env, "0000-01-01", eventDate);
  const results = await Promise.all([
    env.OPERATIONS_DB.prepare(sql.replace("__TABLE__", "stock_movements")).bind(outlet, eventDate).all(),
    ...entries.map((entry) => entry.database.prepare(sql.replace("__TABLE__", "stock_movements_history")).bind(outlet, eventDate).all())
  ]);
  const items = buildShowcaseSummary(results.flatMap((result) => result.results || []), eventDate).map((item) => ({
    item_code: item.item_code,
    item_name: item.item_name,
    previous_aging: item.previous_aging,
    balance_aging: item.balance_aging
  }));
  return responseJson({ ok: true, outlet, eventDate, items, requestId });
}
__name(listShowcaseAging, "listShowcaseAging");

async function listShowcaseProgress(url, env, requestId) {
  const month = cleanText(url.searchParams.get("month"), 7);
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  if (!/^\d{4}-\d{2}$/.test(month)) return apiError(400, "INVALID_MONTH", "Bulan wajib memakai format YYYY-MM.", requestId);
  return responseJson({ ok: true, month, data: await readShowcaseProgressRows(env, month, outlet), requestId });
}
__name(listShowcaseProgress, "listShowcaseProgress");

async function listUploadProgress(url, env, requestId) {
  const month = cleanText(url.searchParams.get("month"), 7);
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return apiError(400, "INVALID_MONTH", "Bulan wajib memakai format YYYY-MM.", requestId);
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  const outletCondition = outlet ? " AND outlet_code = ?" : "";
  const bindings = outlet ? [from, to, outlet] : [from, to];
  const sql = `WITH versioned AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY COALESCE(NULLIF(logical_id, ''), record_id)
        ORDER BY version DESC, created_at DESC, record_id DESC
      ) AS row_rank
      FROM __TABLE__
      WHERE event_date BETWEEN ? AND ?${outletCondition}
        AND movement_type IN ('Goods Receipt', 'Terjual', 'Sold', 'Item Journal', 'Transfer Out Antar Outlet')
    )
    SELECT event_date, outlet_code,
      CASE
        WHEN movement_type = 'Goods Receipt' THEN 'goodsReceipt'
        WHEN movement_type IN ('Terjual', 'Sold') THEN 'salesUsage'
        WHEN movement_type = 'Item Journal' THEN 'itemJournal'
        ELSE 'goodsDelivery'
      END AS upload_type,
      COUNT(DISTINCT COALESCE(source_file, '') || '|' || COALESCE(source_hash, '') || '|' || CAST(COALESCE(source_row, 0) AS TEXT)) AS actual_rows,
      MAX(created_at) AS last_upload,
      MAX(created_by) AS last_user
    FROM versioned
    WHERE row_rank = 1 AND record_type = 'MOVEMENT'
      AND item_code IS NOT NULL AND item_code != ''
      AND source_file IS NOT NULL AND source_file != ''
      AND NOT (movement_type IN ('Terjual', 'Sold') AND UPPER(source_file) = 'SHOWCASE_LOG')
    GROUP BY event_date, outlet_code, upload_type`;
  const operations = await env.OPERATIONS_DB.prepare(sql.replace("__TABLE__", "stock_movements")).bind(...bindings).all();
  const history = await queryHistoryDatabases(
    historyDatabasesForRange(env, from, to),
    (database) => database.prepare(sql.replace("__TABLE__", "stock_movements_history")).bind(...bindings)
  );
  const merged = new Map();
  for (const row of [...operations.results, ...history]) {
    const key = `${row.event_date}|${row.outlet_code}|${row.upload_type}`;
    const current = merged.get(key) || {
      event_date: row.event_date,
      outlet_code: row.outlet_code,
      upload_type: row.upload_type,
      actual_rows: 0,
      last_upload: "",
      last_user: ""
    };
    current.actual_rows += Number(row.actual_rows || 0);
    if (String(row.last_upload || "") > current.last_upload) {
      current.last_upload = String(row.last_upload || "");
      current.last_user = cleanText(row.last_user, 180);
    }
    merged.set(key, current);
  }
  return responseJson({
    ok: true,
    month,
    data: [...merged.values()].sort((a, b) =>
      String(a.event_date).localeCompare(String(b.event_date)) ||
      String(a.outlet_code).localeCompare(String(b.outlet_code)) ||
      String(a.upload_type).localeCompare(String(b.upload_type))
    ),
    requestId
  });
}
__name(listUploadProgress, "listUploadProgress");

async function preloadMovements(request, env, requestId) {
  let payload;
  try {
    payload = await readJsonWithLimit(request, 5e5);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_PAYLOAD";
    return apiError(code === "PAYLOAD_TOO_LARGE" ? 413 : 400, code, "Payload preload FIFO tidak valid.", requestId);
  }
  try {
    const outlet = requiredText(payload?.outlet, "outlet", 40).toUpperCase();
    const location = cleanText(payload?.location, 80) || "Store";
    const to = isoDate(payload?.to);
    if (!to) throw new Error("INVALID_TO");
    const itemCodes = [...new Set(limitedArray(payload?.itemCodes || [], "item_codes", 30).map((value) => cleanText(value, 80).toUpperCase()).filter(Boolean))];
    const itemNames = [...new Set(limitedArray(payload?.itemNames || [], "item_names", 30).map((value) => cleanText(value, 180)).filter(Boolean))];
    const excludedSourceHashes = new Set(limitedArray(payload?.excludedSourceHashes || [], "excluded_source_hashes", 500).map((value) => cleanText(value, 160)).filter(Boolean));
    const perItemLimit = positiveInt(payload?.perItemLimit, 500, 750);
    if (!itemCodes.length && !itemNames.length) throw new Error("INVALID_ITEMS");

    const itemConditions = [], bindings = [outlet, location, to];
    if (itemCodes.length) {
      itemConditions.push(`item_code IN (${itemCodes.map(() => "?").join(",")})`);
      bindings.push(...itemCodes);
    }
    if (itemNames.length) {
      itemConditions.push(`((item_code IS NULL OR item_code = '') AND item_name COLLATE NOCASE IN (${itemNames.map(() => "?").join(",")}))`);
      bindings.push(...itemNames);
    }
    bindings.push(perItemLimit + 100);
    const sql = `WITH versioned AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY COALESCE(NULLIF(logical_id, ''), record_id)
        ORDER BY COALESCE(version, 1) DESC, created_at DESC, record_id DESC
      ) AS logical_rank
      FROM __TABLE__
      WHERE record_type IN ('MOVEMENT', 'OPNAME_DETAIL')
        AND outlet_code = ? AND location_code = ? AND event_date <= ?
        AND (${itemConditions.join(" OR ")})
    ), latest AS (
      SELECT * FROM versioned WHERE logical_rank = 1
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY COALESCE(NULLIF(item_code, ''), UPPER(item_name))
        ORDER BY event_date DESC, created_at DESC, record_id DESC
      ) AS item_rank
      FROM latest
    )
    SELECT * FROM ranked WHERE item_rank <= ?`;
    const operations = await env.OPERATIONS_DB.prepare(sql.replace("__TABLE__", "stock_movements")).bind(...bindings).all();
    const history = await queryHistoryDatabases(
      historyDatabasesForRange(env, "0000-01-01", to),
      (database) => database.prepare(sql.replace("__TABLE__", "stock_movements_history")).bind(...bindings)
    );
    const grouped = /* @__PURE__ */ new Map();
    activeMovements([...operations.results, ...history]).forEach((row) => {
      if (excludedSourceHashes.has(cleanText(row.source_hash, 160))) return;
      const key = cleanText(row.item_code, 80).toUpperCase() || cleanText(row.item_name, 180).toUpperCase();
      if (!key) return;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });
    const rows = [];
    for (const itemRows of grouped.values()) {
      itemRows.sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)) || String(b.created_at).localeCompare(String(a.created_at)) || String(b.record_id).localeCompare(String(a.record_id)));
      rows.push(...itemRows.slice(0, perItemLimit));
    }
    rows.sort((a, b) => String(a.item_code || "").localeCompare(String(b.item_code || "")) || String(a.item_name || "").localeCompare(String(b.item_name || "")) || String(a.event_date).localeCompare(String(b.event_date)) || String(a.created_at).localeCompare(String(b.created_at)));
    return responseJson({ ok: true, data: rows, requestId });
  } catch (error) {
    return apiError(400, "FIFO_PRELOAD_FAILED", error instanceof Error ? error.message : String(error), requestId);
  }
}
__name(preloadMovements, "preloadMovements");
async function mockRecall(url, env, requestId) {
  const saleLineId = cleanText(url.searchParams.get("sale_line_id"), 100);
  const billNumber = cleanText(url.searchParams.get("bill_number"), 100);
  const outlet = cleanText(url.searchParams.get("outlet"), 40).toUpperCase();
  if (!saleLineId && !(billNumber && outlet)) {
    return apiError(400, "INVALID_TRACE_KEY", "Isi sale_line_id atau kombinasi outlet dan bill_number.", requestId);
  }
  const lines = saleLineId ? await env.OPERATIONS_DB.prepare(
    `SELECT l.*, d.outlet_code, d.sale_date, d.bill_number
           FROM sales_lines l JOIN sales_documents d ON d.document_id = l.document_id
          WHERE l.sale_line_id = ? LIMIT 50`
  ).bind(saleLineId).all() : await env.OPERATIONS_DB.prepare(
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
__name(mockRecall, "mockRecall");
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
    requestId
  });
}
__name(listTransfers, "listTransfers");

/* ========================================================================
 * BERITA ACARA / BA - CLOUDFLARE D1 + R2
 *
 * Metadata -> OPERATIONS_DB.ba_submissions
 * data_json -> R2 binding FILES
 * ======================================================================== */
var MAX_BA_MIGRATION_BYTES = 10 * 1024 * 1024;
var MAX_BA_MIGRATION_ROWS = 50;
var MAX_BA_OFFLOAD_ROWS = 25;

function baNullableText(value, maxLength = 2e3) {
  if (value === null || value === void 0 || value === "") return null;
  return String(value).slice(0, maxLength);
}
__name(baNullableText, "baNullableText");

function baRequiredText(value, fieldName, maxLength = 180) {
  const result = String(value ?? "").trim().slice(0, maxLength);
  if (!result) throw new Error(`INVALID_${String(fieldName).toUpperCase()}`);
  return result;
}
__name(baRequiredText, "baRequiredText");

function baTimestampNumber(value) {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new Error("INVALID_TIMESTAMP");
  return result;
}
__name(baTimestampNumber, "baTimestampNumber");

function baObjectKey(rowId) {
  const safe = String(rowId || "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
  if (!safe) throw new Error("INVALID_ROW_ID");
  return `berita-acara/submissions/${safe}.json`;
}
__name(baObjectKey, "baObjectKey");

async function baStorePayloadInR2(env, rowId, dataJson) {
  if (!env.FILES) throw new Error("R2_FILES_BINDING_NOT_AVAILABLE");
  if (dataJson === null || dataJson === void 0 || dataJson === "") return null;
  const objectKey = baObjectKey(rowId);
  await env.FILES.put(objectKey, String(dataJson), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { type: "berita-acara-data-json", rowId: String(rowId).slice(0, 180) }
  });
  return objectKey;
}
__name(baStorePayloadInR2, "baStorePayloadInR2");

async function baReadPayloadFromR2(env, objectKey) {
  if (!objectKey || !env.FILES) return null;
  const object = await env.FILES.get(objectKey);
  return object ? await object.text() : null;
}
__name(baReadPayloadFromR2, "baReadPayloadFromR2");

function baInsertStatement(database, row, objectKey) {
  const rowId = baRequiredText(row.row_id ?? row.rowId, "row_id", 200);
  const submissionId = baRequiredText(row.submission_id ?? row.submissionId, "submission_id", 160);
  const timestamp = baTimestampNumber(row.timestamp);

  return database.prepare(
    `INSERT INTO ba_submissions (
       row_id, submission_id, timestamp, outlet, name, nik, ba_type,
       data_json, data_object_key, info,
       am_approved_date, am_approved_by, am_rejected_date, am_rejected_by, am_reject_reason,
       fnb_approved_date, fnb_approved_by, fnb_rejected_date, fnb_rejected_by, fnb_reject_reason,
       migrated_from
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(row_id) DO UPDATE SET
       submission_id = excluded.submission_id,
       timestamp = excluded.timestamp,
       outlet = excluded.outlet,
       name = excluded.name,
       nik = excluded.nik,
       ba_type = excluded.ba_type,
       data_json = NULL,
       data_object_key = excluded.data_object_key,
       info = excluded.info,
       am_approved_date = excluded.am_approved_date,
       am_approved_by = excluded.am_approved_by,
       am_rejected_date = excluded.am_rejected_date,
       am_rejected_by = excluded.am_rejected_by,
       am_reject_reason = excluded.am_reject_reason,
       fnb_approved_date = excluded.fnb_approved_date,
       fnb_approved_by = excluded.fnb_approved_by,
       fnb_rejected_date = excluded.fnb_rejected_date,
       fnb_rejected_by = excluded.fnb_rejected_by,
       fnb_reject_reason = excluded.fnb_reject_reason,
       migrated_from = excluded.migrated_from`
  ).bind(
    rowId, submissionId, timestamp,
    baNullableText(row.outlet, 80),
    baNullableText(row.name, 180),
    baNullableText(row.nik, 80),
    baNullableText(row.ba_type ?? row.baType, 180),
    baNullableText(objectKey, 500),
    baNullableText(row.info, 2e3),
    baNullableText(row.am_approved_date, 80),
    baNullableText(row.am_approved_by, 180),
    baNullableText(row.am_rejected_date, 80),
    baNullableText(row.am_rejected_by, 180),
    baNullableText(row.am_reject_reason, 4e3),
    baNullableText(row.fnb_approved_date, 80),
    baNullableText(row.fnb_approved_by, 180),
    baNullableText(row.fnb_rejected_date, 80),
    baNullableText(row.fnb_rejected_by, 180),
    baNullableText(row.fnb_reject_reason, 4e3),
    baNullableText(row.migrated_from, 40) || "BIGQUERY"
  );
}
__name(baInsertStatement, "baInsertStatement");

async function migrateBeritaAcaraSubmissions(request, env, requestId) {
  let payload;
  try {
    payload = await readJsonWithLimit(request, MAX_BA_MIGRATION_BYTES);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_PAYLOAD";
    return apiError(code === "PAYLOAD_TOO_LARGE" ? 413 : 400, code, "Payload migrasi Berita Acara tidak valid.", requestId);
  }

  const rows = Array.isArray(payload?.rows) ? payload.rows : null;
  if (!rows || rows.length < 1 || rows.length > MAX_BA_MIGRATION_ROWS) {
    return apiError(400, "INVALID_BA_BATCH", "Batch Berita Acara harus berisi 1 sampai 50 baris.", requestId);
  }

  try {
    const statements2 = [];
    for (const raw of rows) {
      const row = raw || {};
      const rowId = baRequiredText(row.row_id ?? row.rowId, "row_id", 200);
      const objectKey = await baStorePayloadInR2(env, rowId, row.data_json);
      statements2.push(baInsertStatement(env.OPERATIONS_DB, row, objectKey));
    }
    const written = await runStatementBatches(env.OPERATIONS_DB, statements2);
    return responseJson({
      ok: true,
      received: rows.length,
      written,
      storage: "D1_METADATA_R2_PAYLOAD",
      batchId: cleanText(payload.batchId, 120),
      checkpoint: payload.checkpoint || null,
      requestId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "ba_migration_failed", message, requestId }));
    return apiError(400, "BA_MIGRATION_FAILED", message, requestId);
  }
}
__name(migrateBeritaAcaraSubmissions, "migrateBeritaAcaraSubmissions");

async function offloadExistingBeritaAcaraPayloads(request, env, requestId) {
  let payload = {};
  try {
    payload = await readJsonWithLimit(request, 1e5);
  } catch (error) {
    if ((error instanceof Error ? error.message : "") !== "EMPTY_BODY") {
      return apiError(400, "INVALID_PAYLOAD", "Payload offload BA tidak valid.", requestId);
    }
  }

  const requested = Number.parseInt(String(payload?.limit || MAX_BA_OFFLOAD_ROWS), 10);
  const limit = Math.min(MAX_BA_OFFLOAD_ROWS, Math.max(1, Number.isFinite(requested) ? requested : MAX_BA_OFFLOAD_ROWS));

  try {
    const result = await env.OPERATIONS_DB.prepare(
      `SELECT row_id, data_json
         FROM ba_submissions
        WHERE data_object_key IS NULL
          AND data_json IS NOT NULL
          AND data_json <> ''
        ORDER BY row_id
        LIMIT ?`
    ).bind(limit).all();

    const rows = result.results || [];
    let offloaded = 0;

    for (const row of rows) {
      const objectKey = await baStorePayloadInR2(env, row.row_id, row.data_json);
      await env.OPERATIONS_DB.prepare(
        `UPDATE ba_submissions
            SET data_object_key = ?, data_json = NULL
          WHERE row_id = ?`
      ).bind(objectKey, row.row_id).run();
      offloaded += 1;
    }

    return responseJson({
      ok: true,
      selected: rows.length,
      offloaded,
      done: rows.length < limit,
      requestId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "ba_offload_existing_failed", message, requestId }));
    return apiError(400, "BA_OFFLOAD_FAILED", message, requestId);
  }
}
__name(offloadExistingBeritaAcaraPayloads, "offloadExistingBeritaAcaraPayloads");

async function beritaAcaraMigrationStatus(env, requestId) {
  const stats = await env.OPERATIONS_DB.prepare(
    `SELECT
       COUNT(*) AS row_count,
       COUNT(DISTINCT submission_id) AS submission_count,
       MIN(timestamp) AS min_timestamp,
       MAX(timestamp) AS max_timestamp
     FROM ba_submissions`
  ).first();

  return responseJson({
    ok: true,
    stats: {
      row_count: Number(stats?.row_count || 0),
      submission_count: Number(stats?.submission_count || 0),
      min_timestamp: stats?.min_timestamp ?? null,
      max_timestamp: stats?.max_timestamp ?? null
    },
    requestId
  });
}
__name(beritaAcaraMigrationStatus, "beritaAcaraMigrationStatus");

async function listBeritaAcaraSubmissions(url, env, requestId) {
  const outlet = cleanText(url.searchParams.get("outlet"), 80);
  const limit = positiveInt(url.searchParams.get("limit"), 300, 3e3);
  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw ? Number(beforeRaw) : Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(before)) return apiError(400, "INVALID_CURSOR", "Cursor BA tidak valid.", requestId);

  let sql = `
    SELECT row_id, submission_id, timestamp, outlet, name, nik, ba_type, info,
           data_object_key,
           am_approved_date, am_approved_by, am_rejected_date, am_rejected_by, am_reject_reason,
           fnb_approved_date, fnb_approved_by, fnb_rejected_date, fnb_rejected_by, fnb_reject_reason,
           migrated_from, created_at
      FROM v_ba_latest_submissions
     WHERE timestamp < ?`;
  const bindings = [before];
  if (outlet) {
    sql += " AND outlet = ?";
    bindings.push(outlet);
  }
  sql += " ORDER BY timestamp DESC, row_id DESC LIMIT ?";
  bindings.push(limit + 1);

  const result = await env.OPERATIONS_DB.prepare(sql).bind(...bindings).all();
  const data = (result.results || []).slice(0, limit);
  const last = data.at(-1);
  return responseJson({
    ok: true,
    data,
    nextCursor: (result.results || []).length > limit && last ? Number(last.timestamp) : null,
    requestId
  });
}
__name(listBeritaAcaraSubmissions, "listBeritaAcaraSubmissions");

async function getBeritaAcaraSubmission(url, env, requestId) {
  const submissionId = cleanText(url.searchParams.get("submission_id"), 160);
  if (!submissionId) return apiError(400, "INVALID_SUBMISSION_ID", "submission_id wajib diisi.", requestId);

  const row = await env.OPERATIONS_DB.prepare(
    `SELECT * FROM ba_submissions
      WHERE submission_id = ?
      ORDER BY timestamp DESC, row_id DESC
      LIMIT 1`
  ).bind(submissionId).first();

  if (!row) return responseJson({ ok: true, data: null, requestId });

  let dataJson = row.data_json || null;
  if (!dataJson && row.data_object_key) dataJson = await baReadPayloadFromR2(env, row.data_object_key);

  return responseJson({ ok: true, data: { ...row, data_json: dataJson }, requestId });
}
__name(getBeritaAcaraSubmission, "getBeritaAcaraSubmission");

/* ===================== END BERITA ACARA ADD-ON ===================== */

async function route(request, env) {
  const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") return health(env, requestId);
  const auth = await authorize(request, env);
  if (!auth.ok) return apiError(auth.status, auth.code, auth.message, requestId);
  if (request.method === "POST" && url.pathname === "/v1/sync/master") return syncMasterData(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/stock-movements") return writeStockMovements(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/movements/preload") return preloadMovements(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/transfer-events") return writeTransferEvents(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/items/convert-unit") return convertItemUnit(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/migrate/stock-balances") return migrateStockBalances(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/migrate/stock-movements") return migrateStockMovements(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/ba/migrate/submissions") return migrateBeritaAcaraSubmissions(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/ba/submission") return migrateBeritaAcaraSubmissions(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/ba/offload-existing") return offloadExistingBeritaAcaraPayloads(request, env, requestId);
  if (request.method === "GET" && url.pathname === "/v1/ba/migrate/status") return beritaAcaraMigrationStatus(env, requestId);
  if (request.method === "GET" && url.pathname === "/v1/ba/submissions") return listBeritaAcaraSubmissions(url, env, requestId);
  if (request.method === "GET" && url.pathname === "/v1/ba/submission") return getBeritaAcaraSubmission(url, env, requestId);
  if (request.method !== "GET") return apiError(405, "METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", requestId);
  if (url.pathname === "/v1/meta/schema") return schemaMeta(env, requestId);
  if (url.pathname === "/v1/sync/status") return masterSyncStatus(env, requestId);
  if (url.pathname === "/v1/migrate/stock-movements/status") return stockMovementMigrationStatus(env, requestId);
  if (url.pathname === "/v1/stock-items") return listStockItems(url, env, requestId);
  if (url.pathname === "/v1/balances") return listBalances(url, env, requestId);
  if (url.pathname === "/v1/stock-card") return listStockCard(url, env, requestId);
  if (url.pathname === "/v1/movements") return listMovements(url, env, requestId);
  if (url.pathname === "/v1/showcase-log") return listShowcaseLog(url, env, requestId);
  if (url.pathname === "/v1/showcase-aging") return listShowcaseAging(url, env, requestId);
  if (url.pathname === "/v1/showcase-progress") return listShowcaseProgress(url, env, requestId);
  if (url.pathname === "/v1/upload-progress") return listUploadProgress(url, env, requestId);
  if (url.pathname === "/v1/mock-recall") return mockRecall(url, env, requestId);
  if (url.pathname === "/v1/transfers") return listTransfers(url, env, requestId);
  if (url.pathname === "/v1/transfer-events") return listTransferEvents(url, env, requestId);
  return apiError(404, "NOT_FOUND", "Endpoint tidak ditemukan.", requestId);
}
__name(route, "route");
var index_default = {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
      console.error(JSON.stringify({ event: "request_failed", requestId, message: error instanceof Error ? error.message : String(error) }));
      return apiError(500, "INTERNAL_ERROR", "Terjadi kesalahan pada layanan inventory.", requestId);
    }
  }
};
export {
  buildCurrentShowcaseSummary,
  buildShowcaseSummary,
  index_default as default,
  normalizeMovement
};
//# sourceMappingURL=index.js.map
