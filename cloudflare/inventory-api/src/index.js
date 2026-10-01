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
    photo_data_json: cleanText(source.photo_data_json ?? source.photoDataJson, 1e6) || null,
    source_event_id: cleanText(source.source_event_id ?? source.sourceEventId, 160) || null
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
    const columns = ["event_id", "transfer_id", "status", "from_outlet", "from_location", "to_outlet", "to_location", "item_code", "category", "item_name", "unit", "qty", "received_qty", "note", "expiry_date", "delivery_date", "created_by", "created_by_name", "created_at", "accepted_by", "accepted_by_name", "accepted_at", "received_at", "storage_entered_at", "product_temperature", "rejected_by", "rejected_by_name", "rejected_at", "rejection_reason", "receipt_no", "photo_file_ids", "photo_count", "photo_data_json", "source_event_id"];
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

function baReusableObjectKey(value) {
  const objectKey = baNullableText(value, 500);
  if (!objectKey) return null;
  if (!/^berita-acara\/submissions\/[a-zA-Z0-9._-]+\.json$/.test(objectKey)) throw new Error("INVALID_BA_OBJECT_KEY");
  return objectKey;
}
__name(baReusableObjectKey, "baReusableObjectKey");

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
      const objectKey = row.data_json !== null && row.data_json !== void 0 && row.data_json !== ""
        ? await baStorePayloadInR2(env, rowId, row.data_json)
        : baReusableObjectKey(row.data_object_key ?? row.dataObjectKey);
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
    SELECT row_id, submission_id, timestamp,
           (SELECT MIN(first_row.timestamp)
              FROM ba_submissions first_row
             WHERE first_row.submission_id = v_ba_latest_submissions.submission_id) AS submitted_at,
           outlet, name, nik, ba_type, info,
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

  const metadataOnly = cleanText(url.searchParams.get("metadata_only"), 5) === "1";
  const selectedColumns = metadataOnly
    ? `row_id, submission_id, timestamp, outlet, name, nik, ba_type, info, data_object_key,
       am_approved_date, am_approved_by, am_rejected_date, am_rejected_by, am_reject_reason,
       fnb_approved_date, fnb_approved_by, fnb_rejected_date, fnb_rejected_by, fnb_reject_reason,
       migrated_from, created_at`
    : "*";

  const row = await env.OPERATIONS_DB.prepare(
    `SELECT ${selectedColumns},
            (SELECT MIN(first_row.timestamp)
               FROM ba_submissions first_row
              WHERE first_row.submission_id = current_row.submission_id) AS submitted_at
       FROM ba_submissions current_row
      WHERE current_row.submission_id = ?
      ORDER BY current_row.timestamp DESC, current_row.row_id DESC
      LIMIT 1`
  ).bind(submissionId).first();

  if (!row) return responseJson({ ok: true, data: null, requestId });

  let dataJson = row.data_json || null;
  if (!metadataOnly && !dataJson && row.data_object_key) dataJson = await baReadPayloadFromR2(env, row.data_object_key);

  return responseJson({ ok: true, data: { ...row, data_json: metadataOnly ? null : dataJson }, metadataOnly, requestId });
}
__name(getBeritaAcaraSubmission, "getBeritaAcaraSubmission");

async function ensureBaApprovalConfigSchema(env) {
  await env.OPERATIONS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS ba_approval_config (
       ba_type TEXT PRIMARY KEY,
       approval_1_position TEXT,
       approval_2_position TEXT,
       updated_by TEXT,
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`
  ).run();
}
__name(ensureBaApprovalConfigSchema, "ensureBaApprovalConfigSchema");

async function getBaApprovalConfig(env, requestId) {
  await ensureBaApprovalConfigSchema(env);
  const result = await env.OPERATIONS_DB.prepare(
    `SELECT ba_type, approval_1_position, approval_2_position, updated_by, updated_at
       FROM ba_approval_config
      ORDER BY ba_type`
  ).all();
  return responseJson({ ok: true, data: result.results || [], requestId });
}
__name(getBaApprovalConfig, "getBaApprovalConfig");

async function saveBaApprovalConfig(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 128 * 1024);
    const rows = limitedArray(payload?.rows || [], "rows", 100);
    const updatedBy = baNullableText(payload?.updatedBy, 180);
    const statements = rows.map((raw) => {
      const baType = baRequiredText(raw?.baType ?? raw?.ba_type, "ba_type", 180);
      const approval1 = baNullableText(String(raw?.approval1 ?? raw?.approval_1_position ?? "").trim().toUpperCase(), 180);
      const approval2 = baNullableText(String(raw?.approval2 ?? raw?.approval_2_position ?? "").trim().toUpperCase(), 180);
      return env.OPERATIONS_DB.prepare(
        `INSERT INTO ba_approval_config (
           ba_type, approval_1_position, approval_2_position, updated_by, updated_at
         ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(ba_type) DO UPDATE SET
           approval_1_position = excluded.approval_1_position,
           approval_2_position = excluded.approval_2_position,
           updated_by = excluded.updated_by,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(baType, approval1, approval2, updatedBy);
    });
    await ensureBaApprovalConfigSchema(env);
    const written = await runStatementBatches(env.OPERATIONS_DB, statements);
    return responseJson({ ok: true, data: { success: true, written }, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(400, "INVALID_BA_APPROVAL_CONFIG", message, requestId);
  }
}
__name(saveBaApprovalConfig, "saveBaApprovalConfig");

var MAX_MIDTRANS_PAYLOAD_BYTES = 64 * 1024;

function midtransConfig(env) {
  const serverKey = cleanText(env.MIDTRANS_SERVER_KEY, 512);
  const clientKey = cleanText(env.MIDTRANS_CLIENT_KEY, 512);
  const environment = cleanText(env.MIDTRANS_ENVIRONMENT || "sandbox", 20).toLowerCase();
  if (!serverKey || !clientKey) throw new Error("MIDTRANS_NOT_CONFIGURED");
  if (environment !== "sandbox" && environment !== "production") throw new Error("INVALID_MIDTRANS_ENVIRONMENT");
  return {
    serverKey,
    clientKey,
    environment,
    apiBase: environment === "production" ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com",
    snapBase: environment === "production" ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com"
  };
}
__name(midtransConfig, "midtransConfig");

function midtransAuthorization(serverKey) {
  return `Basic ${btoa(`${serverKey}:`)}`;
}
__name(midtransAuthorization, "midtransAuthorization");

async function fetchMidtransWithRetry(url, options) {
  const maximumAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryable || attempt === maximumAttempts) return response;
      if (response.body) await response.body.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === maximumAttempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
  }
  throw lastError || new Error("MIDTRANS_NETWORK_ERROR");
}
__name(fetchMidtransWithRetry, "fetchMidtransWithRetry");

function normalizeMidtransStatus(transactionStatus, fraudStatus) {
  const status = cleanText(transactionStatus, 40).toLowerCase();
  const fraud = cleanText(fraudStatus, 40).toLowerCase();
  if (status === "settlement" || status === "capture" && (!fraud || fraud === "accept")) return "PAID";
  if (status === "deny" || status === "cancel" || status === "failure") return "FAILED";
  if (status === "expire") return "EXPIRED";
  if (status === "refund" || status === "partial_refund") return "REFUNDED";
  return "PENDING";
}
__name(normalizeMidtransStatus, "normalizeMidtransStatus");

async function sha512Hex(value) {
  const digest = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha512Hex, "sha512Hex");

async function verifyMidtransSignature(payload, serverKey) {
  const orderId = cleanText(payload?.order_id, 100);
  const statusCode = cleanText(payload?.status_code, 10);
  const grossAmount = cleanText(payload?.gross_amount, 40);
  const supplied = cleanText(payload?.signature_key, 256).toLowerCase();
  if (!orderId || !statusCode || !grossAmount || !supplied) return false;
  const expected = await sha512Hex(`${orderId}${statusCode}${grossAmount}${serverKey}`);
  return secureEqual(supplied, expected);
}
__name(verifyMidtransSignature, "verifyMidtransSignature");

async function fetchMidtransTransaction(orderId, config) {
  const response = await fetchMidtransWithRetry(`${config.apiBase}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { authorization: midtransAuthorization(config.serverKey), accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(cleanText(payload?.status_message || `MIDTRANS_STATUS_${response.status}`, 300));
  return payload;
}
__name(fetchMidtransTransaction, "fetchMidtransTransaction");

async function persistMidtransStatus(env, existing, payload) {
  const grossAmount = Math.round(Number(payload?.gross_amount || 0));
  if (!Number.isFinite(grossAmount) || grossAmount !== Number(existing.amount)) throw new Error("MIDTRANS_AMOUNT_MISMATCH");
  const status = normalizeMidtransStatus(payload?.transaction_status, payload?.fraud_status);
  await env.OPERATIONS_DB.prepare(
    `UPDATE ba_asset_payments
        SET status = ?, transaction_status = ?, fraud_status = ?, payment_type = ?,
            midtrans_transaction_id = ?, paid_at = CASE WHEN ? = 'PAID' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END,
            updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ?`
  ).bind(
    status,
    cleanText(payload?.transaction_status, 40) || null,
    cleanText(payload?.fraud_status, 40) || null,
    cleanText(payload?.payment_type, 60) || null,
    cleanText(payload?.transaction_id, 120) || null,
    status,
    existing.order_id
  ).run();
  return status;
}
__name(persistMidtransStatus, "persistMidtransStatus");

async function createMidtransAssetPayment(request, env, requestId) {
  let payload;
  try {
    payload = await readJsonWithLimit(request, MAX_MIDTRANS_PAYLOAD_BYTES);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_PAYLOAD";
    return apiError(code === "PAYLOAD_TOO_LARGE" ? 413 : 400, code, "Data pembayaran tidak valid.", requestId);
  }
  let config;
  try {
    config = midtransConfig(env);
  } catch (error) {
    return apiError(503, error instanceof Error ? error.message : "PAYMENT_NOT_CONFIGURED", "Layanan pembayaran belum dikonfigurasi.", requestId);
  }
  const amount = Math.round(Number(payload?.amount || 0));
  const customerName = cleanText(payload?.customerName, 120);
  const customerEmail = cleanText(payload?.customerEmail, 180).toLowerCase();
  const outlet = cleanText(payload?.outlet, 80).toUpperCase();
  const nik = cleanText(payload?.nik, 80);
  if (!Number.isSafeInteger(amount) || amount < 1) return apiError(400, "INVALID_AMOUNT", "Nominal pembayaran harus lebih dari Rp 0.", requestId);
  if (!customerName || !customerEmail || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
    return apiError(400, "INVALID_CUSTOMER", "Nama dan email pembayar wajib valid.", requestId);
  }
  const orderId = `BA-ASSET-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  await env.OPERATIONS_DB.prepare(
    `INSERT INTO ba_asset_payments(order_id, amount, currency, status, customer_name, customer_email, outlet, nik, environment)
     VALUES (?, ?, 'IDR', 'PENDING', ?, ?, ?, ?, ?)`
  ).bind(orderId, amount, customerName, customerEmail, outlet || null, nik || null, config.environment).run();
  try {
    const response = await fetchMidtransWithRetry(`${config.snapBase}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        authorization: midtransAuthorization(config.serverKey),
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: amount },
        item_details: [{ id: "BA-ASSET", price: amount, quantity: 1, name: "Pembayaran Penjualan Asset" }],
        customer_details: { first_name: customerName, email: customerEmail },
        custom_field1: outlet,
        custom_field2: nik
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.token) throw new Error(cleanText(result?.error_messages?.join("; ") || result?.status_message || `MIDTRANS_CREATE_${response.status}`, 500));
    await env.OPERATIONS_DB.prepare(
      `UPDATE ba_asset_payments SET snap_token = ?, redirect_url = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`
    ).bind(cleanText(result.token, 512), cleanText(result.redirect_url, 1e3) || null, orderId).run();
    return responseJson({
      ok: true,
      payment: {
        orderId,
        amount,
        status: "PENDING",
        token: result.token,
        clientKey: config.clientKey,
        snapJsUrl: `${config.snapBase}/snap/snap.js`,
        environment: config.environment
      },
      requestId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.OPERATIONS_DB.prepare(
      "UPDATE ba_asset_payments SET status = 'FAILED', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?"
    ).bind(cleanText(message, 500), orderId).run();
    console.error(JSON.stringify({ event: "midtrans_create_failed", orderId, message, requestId }));
    return apiError(502, "PAYMENT_CREATE_FAILED", "Checkout pembayaran gagal dibuat. Silakan coba kembali.", requestId);
  }
}
__name(createMidtransAssetPayment, "createMidtransAssetPayment");

async function midtransAssetPaymentStatus(url, env, requestId) {
  const orderId = cleanText(url.searchParams.get("order_id"), 100);
  if (!orderId) return apiError(400, "INVALID_ORDER_ID", "order_id wajib diisi.", requestId);
  let payment = await env.OPERATIONS_DB.prepare(
    `SELECT order_id, amount, currency, status, transaction_status, payment_type, paid_at, created_at, updated_at
       FROM ba_asset_payments WHERE order_id = ? LIMIT 1`
  ).bind(orderId).first();
  if (!payment) return apiError(404, "PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.", requestId);
  if (payment.status === "PENDING") {
    try {
      const config = midtransConfig(env);
      const remote = await fetchMidtransTransaction(orderId, config);
      await persistMidtransStatus(env, payment, remote);
      payment = await env.OPERATIONS_DB.prepare(
        `SELECT order_id, amount, currency, status, transaction_status, payment_type, paid_at, created_at, updated_at
           FROM ba_asset_payments WHERE order_id = ? LIMIT 1`
      ).bind(orderId).first();
    } catch (error) {
      console.log(JSON.stringify({ event: "midtrans_status_pending", orderId, message: error instanceof Error ? error.message : String(error), requestId }));
    }
  }
  return responseJson({ ok: true, payment, requestId });
}
__name(midtransAssetPaymentStatus, "midtransAssetPaymentStatus");

async function claimMidtransAssetPayment(request, env, requestId) {
  let payload;
  try {
    payload = await readJsonWithLimit(request, MAX_MIDTRANS_PAYLOAD_BYTES);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_PAYLOAD";
    return apiError(code === "PAYLOAD_TOO_LARGE" ? 413 : 400, code, "Data penggunaan pembayaran tidak valid.", requestId);
  }
  const orderId = cleanText(payload?.orderId, 100);
  const submissionId = cleanText(payload?.submissionId, 160);
  const amount = Math.round(Number(payload?.amount || 0));
  if (!orderId || !submissionId || !Number.isSafeInteger(amount) || amount < 1) {
    return apiError(400, "INVALID_PAYMENT_CLAIM", "Order, submission, dan nominal pembayaran wajib valid.", requestId);
  }
  const result = await env.OPERATIONS_DB.prepare(
    `UPDATE ba_asset_payments
        SET consumed_by_submission = ?, consumed_at = COALESCE(consumed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ? AND status = 'PAID' AND amount = ?
        AND (
          consumed_by_submission IS NULL
          OR consumed_by_submission = ?
          OR NOT EXISTS (
            SELECT 1 FROM ba_submissions b WHERE b.submission_id = ba_asset_payments.consumed_by_submission
          )
        )`
  ).bind(submissionId, orderId, amount, submissionId).run();
  if (Number(result.meta?.changes || 0) !== 1) {
    return apiError(409, "PAYMENT_ALREADY_USED", "Pembayaran belum berhasil atau sudah digunakan oleh Berita Acara lain.", requestId);
  }
  return responseJson({ ok: true, payment: { orderId, amount, status: "PAID", submissionId }, requestId });
}
__name(claimMidtransAssetPayment, "claimMidtransAssetPayment");

async function midtransWebhook(request, env, requestId) {
  let payload;
  try {
    payload = await readJsonWithLimit(request, MAX_MIDTRANS_PAYLOAD_BYTES);
  } catch {
    return apiError(400, "INVALID_NOTIFICATION", "Notifikasi pembayaran tidak valid.", requestId);
  }
  let config;
  try {
    config = midtransConfig(env);
  } catch (error) {
    return apiError(503, error instanceof Error ? error.message : "PAYMENT_NOT_CONFIGURED", "Layanan pembayaran belum dikonfigurasi.", requestId);
  }
  if (!await verifyMidtransSignature(payload, config.serverKey)) {
    return apiError(401, "INVALID_MIDTRANS_SIGNATURE", "Tanda tangan notifikasi tidak valid.", requestId);
  }
  const orderId = cleanText(payload?.order_id, 100);
  const existing = await env.OPERATIONS_DB.prepare(
    "SELECT order_id, amount, status FROM ba_asset_payments WHERE order_id = ? LIMIT 1"
  ).bind(orderId).first();
  if (!existing) return apiError(404, "PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.", requestId);
  try {
    const verified = await fetchMidtransTransaction(orderId, config);
    const status = await persistMidtransStatus(env, existing, verified);
    console.log(JSON.stringify({ event: "midtrans_webhook_processed", orderId, status, requestId }));
    return responseJson({ ok: true, orderId, status, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "midtrans_webhook_failed", orderId, message, requestId }));
    return apiError(400, "MIDTRANS_VERIFICATION_FAILED", "Verifikasi pembayaran gagal.", requestId);
  }
}
__name(midtransWebhook, "midtransWebhook");

/* ===================== STAFF PERFORMANCE (D1 ONLY) ===================== */

function staffPerformanceDate(value, name) {
  const date = isoDate(value);
  if (!date) throw new Error(`INVALID_${name.toUpperCase()}`);
  return date;
}
__name(staffPerformanceDate, "staffPerformanceDate");

function staffPerformanceScope(url) {
  return {
    outlet: cleanText(url.searchParams.get("outlet"), 40).toUpperCase(),
    from: isoDate(url.searchParams.get("from")),
    to: isoDate(url.searchParams.get("to")),
    nik: cleanText(url.searchParams.get("nik"), 80)
  };
}
__name(staffPerformanceScope, "staffPerformanceScope");

async function migrateStaffPerformanceMaster(request, env, requestId) {
  let payload;
  try {
    payload = await readJsonWithLimit(request, MAX_MASTER_SYNC_BYTES);
    const jobId = requiredText(payload.jobId, "job_id", 120);
    const batchId = requiredText(payload.batchId || "master", "batch_id", 120);
    const previous = await env.OPERATIONS_DB.prepare(
      "SELECT written_rows FROM staff_performance_migration_batches WHERE job_id = ? AND batch_id = ? LIMIT 1"
    ).bind(jobId, batchId).first();
    if (previous) return responseJson({ ok: true, duplicate: true, writtenRows: Number(previous.written_rows || 0), requestId });

    const outlets = limitedArray(payload.outlets || [], "outlets", 500);
    const staff = limitedArray(payload.staff || [], "staff", 1e4);
    const indicators = limitedArray(payload.indicators || [], "indicators", 5e3);
    const statements = [];
    for (const row of outlets) {
      statements.push(env.OPERATIONS_DB.prepare(
        `INSERT INTO staff_performance_outlets(outlet_code, outlet_name, role, active, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(outlet_code) DO UPDATE SET outlet_name = excluded.outlet_name,
           role = excluded.role, active = excluded.active, updated_at = CURRENT_TIMESTAMP`
      ).bind(requiredText(row.outletCode, "outlet_code", 40).toUpperCase(), requiredText(row.outletName || row.outletCode, "outlet_name", 160), cleanText(row.role || "OUTLET", 40).toUpperCase(), row.active === false ? 0 : 1));
    }
    for (const row of staff) {
      statements.push(env.OPERATIONS_DB.prepare(
        `INSERT INTO staff_performance_staff(nik, name, position, outlet_code, status, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(nik) DO UPDATE SET name = excluded.name, position = excluded.position,
           outlet_code = excluded.outlet_code, status = excluded.status, updated_at = CURRENT_TIMESTAMP`
      ).bind(requiredText(row.nik, "nik", 80), requiredText(row.name, "name", 180), requiredText(row.position, "position", 120).replace(/\s+/g, " ").toUpperCase(), requiredText(row.outletCode, "outlet_code", 40).toUpperCase(), cleanText(row.status || "Active", 40)));
    }
    for (const row of indicators) {
      statements.push(env.OPERATIONS_DB.prepare(
        `INSERT INTO staff_performance_indicators(
           indicator_id, outlet_code, category, indicator_name, weight_json, target,
           threshold_a, threshold_b, threshold_c, threshold_d, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(indicator_id) DO UPDATE SET outlet_code = excluded.outlet_code,
           category = excluded.category, indicator_name = excluded.indicator_name,
           weight_json = excluded.weight_json, target = excluded.target,
           threshold_a = excluded.threshold_a, threshold_b = excluded.threshold_b,
           threshold_c = excluded.threshold_c, threshold_d = excluded.threshold_d,
           status = excluded.status, updated_at = CURRENT_TIMESTAMP`
      ).bind(
        requiredText(row.indicatorId, "indicator_id", 100), cleanText(row.outletCode, 40).toUpperCase(),
        requiredText(row.category || "General", "category", 120), requiredText(row.indicatorName, "indicator_name", 240),
        JSON.stringify(row.weight ?? 0), cleanText(row.target, 120), cleanText(row.thresholdA, 120),
        cleanText(row.thresholdB, 120), cleanText(row.thresholdC, 120), cleanText(row.thresholdD, 120),
        cleanText(row.status || "Active", 40)
      ));
    }
    const writtenRows = await runStatementBatches(env.OPERATIONS_DB, statements);
    const receivedRows = outlets.length + staff.length + indicators.length;
    await env.OPERATIONS_DB.batch([
      env.OPERATIONS_DB.prepare(
        `INSERT INTO staff_performance_migration_batches(job_id, batch_id, batch_type, received_rows, written_rows, checkpoint_row)
         VALUES (?, ?, 'MASTER', ?, ?, 0)`
      ).bind(jobId, batchId, receivedRows, writtenRows),
      env.OPERATIONS_DB.prepare(
        `INSERT INTO upload_jobs(job_id, upload_type, source_hash, status, total_rows, processed_rows,
           checkpoint_row, result_json, created_by, started_at, updated_at)
         VALUES (?, 'STAFF_PERFORMANCE', ?, 'PROCESSING', ?, 0, 0, ?, 'APPS_SCRIPT_MIGRATION', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(job_id) DO UPDATE SET total_rows = excluded.total_rows,
           result_json = excluded.result_json, updated_at = CURRENT_TIMESTAMP`
      ).bind(jobId, jobId, Number(payload.totalRows || 0), JSON.stringify({ masterRows: receivedRows }))
    ]);
    return responseJson({ ok: true, writtenRows, receivedRows, requestId });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "INVALID_MIGRATION_MASTER", "Batch master Staff Performance tidak valid.", requestId);
  }
}
__name(migrateStaffPerformanceMaster, "migrateStaffPerformanceMaster");

async function migrateStaffPerformanceScores(request, env, requestId) {
  let payload;
  try {
    payload = await readJsonWithLimit(request, MAX_MASTER_SYNC_BYTES);
    const jobId = requiredText(payload.jobId, "job_id", 120);
    const batchId = requiredText(payload.batchId, "batch_id", 120);
    const checkpoint = Math.max(0, Number(payload.checkpoint || 0));
    const totalRows = Math.max(0, Number(payload.totalRows || 0));
    const rows = limitedArray(payload.rows || [], "rows", 500);
    const previous = await env.OPERATIONS_DB.prepare(
      "SELECT written_rows FROM staff_performance_migration_batches WHERE job_id = ? AND batch_id = ? LIMIT 1"
    ).bind(jobId, batchId).first();
    if (previous) return responseJson({ ok: true, duplicate: true, writtenRows: Number(previous.written_rows || 0), checkpoint, requestId });

    const statements = rows.map((row) => env.OPERATIONS_DB.prepare(
      `INSERT INTO staff_performance_scores(
         transaction_id, score_date, nik, indicator_id, achievement, final_score, note, migrated_from, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'BIGQUERY', CURRENT_TIMESTAMP)
       ON CONFLICT(score_date, nik, indicator_id) DO UPDATE SET
         transaction_id = excluded.transaction_id, achievement = excluded.achievement,
         final_score = excluded.final_score, note = excluded.note,
         migrated_from = excluded.migrated_from, updated_at = CURRENT_TIMESTAMP`
    ).bind(
      requiredText(row.transactionId || `${row.scoreDate}_${row.nik}_${row.indicatorId}`, "transaction_id", 240),
      staffPerformanceDate(row.scoreDate, "score_date"), requiredText(row.nik, "nik", 80),
      requiredText(row.indicatorId, "indicator_id", 100), cleanText(row.achievement, 1000),
      Number.isFinite(Number(row.finalScore)) ? Number(row.finalScore) : 0, cleanText(row.note, 2000)
    ));
    const writtenRows = await runStatementBatches(env.OPERATIONS_DB, statements);
    const status = checkpoint >= totalRows ? "COMPLETED" : "PROCESSING";
    await env.OPERATIONS_DB.batch([
      env.OPERATIONS_DB.prepare(
        `INSERT INTO staff_performance_migration_batches(job_id, batch_id, batch_type, received_rows, written_rows, checkpoint_row)
         VALUES (?, ?, 'SCORES', ?, ?, ?)`
      ).bind(jobId, batchId, rows.length, writtenRows, checkpoint),
      env.OPERATIONS_DB.prepare(
        `UPDATE upload_jobs SET status = ?, total_rows = MAX(total_rows, ?),
           processed_rows = MAX(processed_rows, ?), checkpoint_row = MAX(checkpoint_row, ?),
           completed_at = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE completed_at END,
           updated_at = CURRENT_TIMESTAMP WHERE job_id = ? AND upload_type = 'STAFF_PERFORMANCE'`
      ).bind(status, totalRows, checkpoint, checkpoint, status, jobId)
    ]);
    return responseJson({ ok: true, writtenRows, receivedRows: rows.length, checkpoint, totalRows, status, requestId });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "INVALID_MIGRATION_BATCH", "Batch data Staff Performance tidak valid.", requestId);
  }
}
__name(migrateStaffPerformanceScores, "migrateStaffPerformanceScores");

async function staffPerformanceMigrationStatus(url, env, requestId) {
  const jobId = cleanText(url.searchParams.get("job_id"), 120);
  const job = jobId
    ? await env.OPERATIONS_DB.prepare("SELECT * FROM upload_jobs WHERE job_id = ? AND upload_type = 'STAFF_PERFORMANCE' LIMIT 1").bind(jobId).first()
    : await env.OPERATIONS_DB.prepare("SELECT * FROM upload_jobs WHERE upload_type = 'STAFF_PERFORMANCE' ORDER BY created_at DESC LIMIT 1").first();
  const counts = await env.OPERATIONS_DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM staff_performance_outlets) AS outlets,
       (SELECT COUNT(*) FROM staff_performance_staff) AS staff,
       (SELECT COUNT(*) FROM staff_performance_indicators) AS indicators,
       (SELECT COUNT(*) FROM staff_performance_scores) AS scores`
  ).first();
  const batches = job ? await env.OPERATIONS_DB.prepare(
    `SELECT batch_type, COUNT(*) AS batches, SUM(received_rows) AS received_rows,
       SUM(written_rows) AS written_rows, MAX(checkpoint_row) AS checkpoint_row
     FROM staff_performance_migration_batches WHERE job_id = ? GROUP BY batch_type`
  ).bind(job.job_id).all() : { results: [] };
  const processed = Number(job?.processed_rows || 0), total = Number(job?.total_rows || 0);
  return responseJson({ ok: true, data: { job: job || null, progressPercent: total ? Math.min(100, Math.round(processed * 1e4 / total) / 100) : 0, counts, batches: batches.results || [] }, requestId });
}
__name(staffPerformanceMigrationStatus, "staffPerformanceMigrationStatus");

async function staffPerformanceBootstrap(url, env, requestId) {
  const { outlet } = staffPerformanceScope(url);
  const staffQuery = outlet
    ? env.OPERATIONS_DB.prepare(`SELECT nik AS NIK, name AS Nama, UPPER(TRIM(position)) AS Posisi, outlet_code AS Outlet, status AS Status
       FROM staff_performance_staff WHERE outlet_code = ? AND UPPER(TRIM(status)) = 'ACTIVE' ORDER BY name`).bind(outlet)
    : env.OPERATIONS_DB.prepare(`SELECT nik AS NIK, name AS Nama, UPPER(TRIM(position)) AS Posisi, outlet_code AS Outlet, status AS Status
       FROM staff_performance_staff WHERE UPPER(TRIM(status)) = 'ACTIVE' ORDER BY outlet_code, name`);
  const indicatorQuery = outlet
    ? env.OPERATIONS_DB.prepare(`SELECT indicator_id AS ID_Indikator, outlet_code AS Outlet, category AS Kategori,
       indicator_name AS Nama_Indikator, weight_json, target AS Target, threshold_a AS Batas_A,
       threshold_b AS Batas_B, threshold_c AS Batas_C, threshold_d AS Batas_D, status AS Status
       FROM staff_performance_indicators WHERE outlet_code = '' OR outlet_code = ? ORDER BY category, indicator_name`).bind(outlet)
    : env.OPERATIONS_DB.prepare(`SELECT indicator_id AS ID_Indikator, outlet_code AS Outlet, category AS Kategori,
       indicator_name AS Nama_Indikator, weight_json, target AS Target, threshold_a AS Batas_A,
       threshold_b AS Batas_B, threshold_c AS Batas_C, threshold_d AS Batas_D, status AS Status
       FROM staff_performance_indicators ORDER BY category, indicator_name`);
  const [staff, indicators, outlets] = await Promise.all([
    staffQuery.all(), indicatorQuery.all(), env.OPERATIONS_DB.prepare(
      "SELECT outlet_code, outlet_name, role FROM staff_performance_outlets WHERE active = 1 ORDER BY outlet_code"
    ).all()
  ]);
  const indicatorRows = (indicators.results || []).map((row) => {
    let weight = row.weight_json;
    try { weight = JSON.parse(row.weight_json); } catch {}
    return { ...row, Bobot: weight };
  });
  const positions = [...new Set((staff.results || []).map((row) => row.Posisi).filter(Boolean))].sort();
  return responseJson({ ok: true, data: { staff: staff.results || [], indicators: indicatorRows, outlets: (outlets.results || []).map((row) => row.outlet_code), outletDetails: outlets.results || [], positions }, requestId });
}
__name(staffPerformanceBootstrap, "staffPerformanceBootstrap");

async function staffPerformanceLeaderboard(url, env, requestId) {
  const scope = staffPerformanceScope(url);
  if (!scope.from || !scope.to) return apiError(400, "INVALID_DATE_RANGE", "Periode tidak valid.", requestId);
  const whereOutlet = scope.outlet ? " AND st.outlet_code = ?" : "";
  const query = env.OPERATIONS_DB.prepare(
    `SELECT s.score_date AS Tanggal, s.nik AS NIK, SUM(s.final_score) AS Score
     FROM staff_performance_scores s JOIN staff_performance_staff st ON st.nik = s.nik
     WHERE s.score_date BETWEEN ? AND ? AND UPPER(TRIM(st.status)) = 'ACTIVE'${whereOutlet}
     GROUP BY s.score_date, s.nik ORDER BY s.score_date, s.nik`
  );
  const result = scope.outlet ? await query.bind(scope.from, scope.to, scope.outlet).all() : await query.bind(scope.from, scope.to).all();
  return responseJson({ ok: true, data: result.results || [], requestId });
}
__name(staffPerformanceLeaderboard, "staffPerformanceLeaderboard");

async function staffPerformanceDailyStats(url, env, requestId) {
  const scope = staffPerformanceScope(url);
  if (!scope.from || !scope.to) return apiError(400, "INVALID_DATE_RANGE", "Periode tidak valid.", requestId);
  const whereOutlet = scope.outlet ? " AND st.outlet_code = ?" : "";
  const query = env.OPERATIONS_DB.prepare(
    `SELECT DISTINCT s.score_date AS Tanggal, s.nik AS NIK
     FROM staff_performance_scores s JOIN staff_performance_staff st ON st.nik = s.nik
     WHERE s.score_date BETWEEN ? AND ? AND UPPER(TRIM(st.status)) = 'ACTIVE'${whereOutlet} ORDER BY s.score_date, s.nik`
  );
  const result = scope.outlet ? await query.bind(scope.from, scope.to, scope.outlet).all() : await query.bind(scope.from, scope.to).all();
  return responseJson({ ok: true, data: result.results || [], requestId });
}
__name(staffPerformanceDailyStats, "staffPerformanceDailyStats");

async function staffPerformanceData(url, env, requestId) {
  const scope = staffPerformanceScope(url);
  if (!scope.from || !scope.to) return apiError(400, "INVALID_DATE_RANGE", "Periode tidak valid.", requestId);
  const conditions = ["s.score_date BETWEEN ? AND ?", "UPPER(TRIM(st.status)) = 'ACTIVE'"], values = [scope.from, scope.to];
  if (scope.outlet) { conditions.push("st.outlet_code = ?"); values.push(scope.outlet); }
  if (scope.nik) { conditions.push("s.nik = ?"); values.push(scope.nik); }
  const result = await env.OPERATIONS_DB.prepare(
    `SELECT s.transaction_id AS ID_Transaksi, s.score_date AS Tanggal, s.nik AS NIK,
       s.indicator_id AS ID_Indikator, s.achievement AS Pencapaian,
       s.final_score AS Skor_Final, s.note AS Note
     FROM staff_performance_scores s JOIN staff_performance_staff st ON st.nik = s.nik
     WHERE ${conditions.join(" AND ")} ORDER BY s.score_date, s.nik, s.indicator_id`
  ).bind(...values).all();
  return responseJson({ ok: true, data: result.results || [], requestId });
}
__name(staffPerformanceData, "staffPerformanceData");

async function saveStaffPerformanceStaff(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 1e5);
    const nik = requiredText(payload.nik, "nik", 80);
    if (!payload.isEdit) {
      const existing = await env.OPERATIONS_DB.prepare("SELECT nik FROM staff_performance_staff WHERE nik = ? LIMIT 1").bind(nik).first();
      if (existing) return apiError(409, "NIK_EXISTS", "NIK sudah terdaftar.", requestId);
    }
    await env.OPERATIONS_DB.prepare(
      `INSERT INTO staff_performance_staff(nik, name, position, outlet_code, status, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(nik) DO UPDATE SET name = excluded.name, position = excluded.position,
         outlet_code = excluded.outlet_code, status = excluded.status, updated_at = CURRENT_TIMESTAMP`
    ).bind(nik, requiredText(payload.name, "name", 180), requiredText(payload.position, "position", 120).replace(/\s+/g, " ").toUpperCase(), requiredText(payload.outletCode, "outlet_code", 40).toUpperCase(), cleanText(payload.status || "Active", 40)).run();
    return responseJson({ ok: true, data: { success: true }, requestId });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "INVALID_STAFF", "Data staff tidak valid.", requestId);
  }
}
__name(saveStaffPerformanceStaff, "saveStaffPerformanceStaff");

async function syncStaffPerformanceStaff(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, MAX_MASTER_SYNC_BYTES);
    const rows = limitedArray(payload.rows || [], "rows", 1e4);
    if (!rows.length) throw new Error("EMPTY_STAFF_SYNC");
    const incomingNiks = new Set();
    const outletCodes = new Set();
    const statements = [];
    for (const row of rows) {
      const nik = requiredText(row.nik, "nik", 80);
      const outletCode = requiredText(row.outletCode, "outlet_code", 40).toUpperCase();
      incomingNiks.add(nik);
      outletCodes.add(outletCode);
      statements.push(env.OPERATIONS_DB.prepare(
        `INSERT INTO staff_performance_staff(nik, name, position, outlet_code, status, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(nik) DO UPDATE SET name = excluded.name, position = excluded.position,
           outlet_code = excluded.outlet_code, status = excluded.status, updated_at = CURRENT_TIMESTAMP`
      ).bind(
        nik, requiredText(row.name, "name", 180), cleanText(row.position || "-", 120).replace(/\s+/g, " ").toUpperCase(),
        outletCode, cleanText(row.status || "Active", 40)
      ));
    }
    for (const outletCode of outletCodes) {
      statements.push(env.OPERATIONS_DB.prepare(
        `INSERT INTO staff_performance_outlets(outlet_code, outlet_name, role, active, updated_at)
         VALUES (?, ?, 'OUTLET', 1, CURRENT_TIMESTAMP)
         ON CONFLICT(outlet_code) DO UPDATE SET active = 1, updated_at = CURRENT_TIMESTAMP`
      ).bind(outletCode, outletCode));
    }
    const existing = await env.OPERATIONS_DB.prepare("SELECT nik FROM staff_performance_staff").all();
    for (const row of existing.results || []) {
      const nik = cleanText(row.nik, 80);
      if (nik && !incomingNiks.has(nik)) {
        statements.push(env.OPERATIONS_DB.prepare(
          "UPDATE staff_performance_staff SET status = 'Inactive', updated_at = CURRENT_TIMESTAMP WHERE nik = ?"
        ).bind(nik));
      }
    }
    const writtenRows = await runStatementBatches(env.OPERATIONS_DB, statements);
    return responseJson({
      ok: true,
      data: { success: true, source: "MPP_EMP_LIST", receivedRows: rows.length, writtenRows, outlets: outletCodes.size },
      requestId
    });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "INVALID_STAFF_SYNC", "Sinkronisasi master staff MPP tidak valid.", requestId);
  }
}
__name(syncStaffPerformanceStaff, "syncStaffPerformanceStaff");

async function deactivateStaffPerformanceStaff(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 1e5);
    const nik = requiredText(payload.nik, "nik", 80);
    const result = await env.OPERATIONS_DB.prepare(
      "UPDATE staff_performance_staff SET status = 'Inactive', updated_at = CURRENT_TIMESTAMP WHERE nik = ?"
    ).bind(nik).run();
    if (!Number(result.meta?.changes || 0)) return apiError(404, "STAFF_NOT_FOUND", "Staff tidak ditemukan.", requestId);
    return responseJson({ ok: true, data: { success: true }, requestId });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "INVALID_STAFF", "NIK tidak valid.", requestId);
  }
}
__name(deactivateStaffPerformanceStaff, "deactivateStaffPerformanceStaff");

function sopiNormalizeText(value) {
  return cleanText(value, 1200).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
__name(sopiNormalizeText, "sopiNormalizeText");

function sopiSearchTerms(question) {
  const ignored = new Set([
    "apa", "apakah", "berapa", "bagaimana", "cara", "caranya", "buat", "membuat",
    "bikin", "isi", "isinya", "jumlah", "takaran", "bahan", "metode", "proses",
    "untuk", "dari", "dengan", "yang", "dan", "atau", "pada", "menu", "sop",
    "standar", "standard", "operasional", "prosedur", "ik", "instruksi", "intruksi",
    "kerja", "internal", "memo", "im", "nya", "ini", "itu", "di", "ke", "berapa"
  ]);
  const terms = sopiNormalizeText(question).split(" ").filter((term) => term.length > 1 && !ignored.has(term));
  return [...new Set(terms)].slice(0, 8);
}
__name(sopiSearchTerms, "sopiSearchTerms");

function sopiParseJson(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
__name(sopiParseJson, "sopiParseJson");

async function searchSopiDocuments(env, question) {
  const normalized = sopiNormalizeText(question);
  const terms = sopiSearchTerms(question);
  const usableTerms = terms.length ? terms : normalized.split(" ").filter(Boolean).slice(0, 4);
  if (!usableTerms.length) return [];
  const conditions = [];
  const whereBindings = [];
  for (const term of usableTerms) {
    conditions.push("INSTR(LOWER(d.search_text), ?) > 0");
    whereBindings.push(term);
  }
  conditions.unshift("INSTR(LOWER(d.title), ?) > 0");
  whereBindings.unshift(normalized);
  const statement = env.MASTER_DB.prepare(
    `SELECT d.document_id, d.title, d.category, d.category_detail, d.effective_date, d.revision,
            d.is_legacy, d.yield_text, d.shelf_life, d.ingredients_json, d.steps_json,
            d.content_text, d.attachment_id, d.source_url, d.source_type, d.status,
            d.search_text, a.file_name, a.mime_type
       FROM sopi_documents d
       LEFT JOIN sopi_attachments a ON a.attachment_id = d.attachment_id
      WHERE ${conditions.join(" OR ")}
      ORDER BY d.is_legacy ASC, d.effective_date DESC, d.title ASC
      LIMIT 40`
  ).bind(...whereBindings);
  const result = await statement.all();
  return (result.results || []).map((row) => {
    const titleNormalized = sopiNormalizeText(row.title);
    const searchNormalized = sopiNormalizeText(row.search_text);
    let relevance = titleNormalized === normalized ? 100 : titleNormalized.includes(normalized) ? 45 : 0;
    for (const term of usableTerms) {
      if (titleNormalized.includes(term)) relevance += 20;
      if (searchNormalized.includes(term)) relevance += 3;
    }
    return {
    id: cleanText(row.document_id, 180),
    title: cleanText(row.title, 240),
    category: cleanText(row.category, 100),
    categoryDetail: cleanText(row.category_detail, 100),
    effectiveDate: cleanText(row.effective_date, 20),
    revision: cleanText(row.revision, 40),
    isLegacy: Number(row.is_legacy || 0) === 1,
    yieldText: cleanText(row.yield_text, 300),
    shelfLife: cleanText(row.shelf_life, 300),
    ingredients: sopiParseJson(row.ingredients_json).slice(0, 80),
    steps: sopiParseJson(row.steps_json).slice(0, 60),
    contentText: cleanText(row.content_text, 12000),
    attachmentId: cleanText(row.attachment_id, 180),
    fileName: cleanText(row.file_name, 240),
    mimeType: cleanText(row.mime_type, 120),
    sourceUrl: cleanText(row.source_url, 600),
    sourceType: cleanText(row.source_type, 30),
    status: cleanText(row.status, 80),
      relevance
    };
  }).sort((left, right) => Number(left.isLegacy) - Number(right.isLegacy) || right.relevance - left.relevance || left.title.localeCompare(right.title)).slice(0, 6);
}
__name(searchSopiDocuments, "searchSopiDocuments");

function sopiContext(documents) {
  return documents.slice(0, 4).map((document, index) => {
    const ingredients = document.ingredients.map((item) => `- ${cleanText(item.name, 180)}: ${cleanText(item.qty, 40)} ${cleanText(item.uom, 60)}`).join("\n");
    const steps = document.steps.map((step, stepIndex) => `${stepIndex + 1}. ${cleanText(step.desc, 1200)}`).join("\n");
    return [
      `SUMBER ${index + 1}: ${document.title}`,
      `Kategori: ${document.category} / ${document.categoryDetail}`,
      `Tanggal efektif: ${document.effectiveDate || "-"} | Revisi: ${document.revision || "-"} | Arsip lama: ${document.isLegacy ? "YA" : "TIDAK"}`,
      `Yield: ${document.yieldText || "-"} | Shelf life: ${document.shelfLife || "-"}`,
      "Bahan:", ingredients || "-",
      "Metode:", steps || "-",
      "Informasi tambahan:", document.contentText || "-"
    ].join("\n");
  }).join("\n\n").slice(0, 24000);
}
__name(sopiContext, "sopiContext");

function sopiFallbackAnswer(document) {
  if (!document) return "Maaf, SOP yang sesuai belum ditemukan. Coba tuliskan nama menu dengan lebih lengkap.";
  const ingredients = document.ingredients.slice(0, 12).map((item) => `• ${cleanText(item.name, 180)} — ${cleanText(item.qty, 40)} ${cleanText(item.uom, 60)}`).join("\n");
  const steps = document.steps.slice(0, 8).map((step, index) => `${index + 1}. ${cleanText(step.desc, 350)}`).join("\n");
  return [
    `Berikut SOP ${document.title}:`,
    document.yieldText ? `Yield: ${document.yieldText}` : "",
    document.shelfLife ? `Shelf life: ${document.shelfLife}` : "",
    ingredients ? `\nBahan:\n${ingredients}` : "",
    steps ? `\nMetode:\n${steps}` : "",
    document.isLegacy ? "\nCatatan: sumber ini merupakan arsip SOP lama." : ""
  ].filter(Boolean).join("\n");
}
__name(sopiFallbackAnswer, "sopiFallbackAnswer");

function sopiAiText(result) {
  if (typeof result?.response === "string") return result.response.trim();
  if (typeof result?.result?.response === "string") return result.result.response.trim();
  const content = result?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}
__name(sopiAiText, "sopiAiText");

async function sopiRunAi(env, messages, requestId) {
  const models = [
    cleanText(env.SOPI_MODEL || "@cf/openai/gpt-oss-120b", 160),
    cleanText(env.SOPI_FALLBACK_MODEL || "@cf/google/gemma-4-26b-a4b-it", 160),
    cleanText(env.SOPI_LANGUAGE_MODEL || "@cf/aisingapore/gemma-sea-lion-v4-27b-it", 160)
  ].filter((model, index, all) => model && all.indexOf(model) === index);
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const startedAt = Date.now();
    try {
      const answer = sopiAiText(await env.AI.run(model, {
        messages,
        max_tokens: 900,
        temperature: 0.25,
        top_p: 0.88
      }));
      if (answer) {
        console.log(JSON.stringify({ event: "sopi_ai_model_succeeded", requestId, model, attempt: index + 1, durationMs: Date.now() - startedAt }));
        return answer;
      }
      throw new Error("EMPTY_AI_RESPONSE");
    } catch (error) {
      console.error(JSON.stringify({
        event: "sopi_ai_model_failed",
        requestId,
        model,
        attempt: index + 1,
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }
  return "";
}
__name(sopiRunAi, "sopiRunAi");

function sopiFriendlyName(value) {
  const first = cleanText(value, 120).trim().split(/\s+/)[0] || "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "";
}
__name(sopiFriendlyName, "sopiFriendlyName");

function sopiConversationFallback(question, userName = "") {
  const normalized = sopiNormalizeText(question);
  const greeting = sopiFriendlyName(userName) ? `Halo, ${sopiFriendlyName(userName)}!` : "Halo!";
  if (/^(halo|hallo|hai|hi|hello|pagi|siang|sore|malam)(\s|$)/.test(normalized)) {
    return `${greeting} Aku SOPi, asisten Bakerzin. Senang bertemu denganmu 😊 Kamu bisa bertanya apa pun tentang operasional Bakerzin.`;
  }
  if (/^(terima kasih|makasih|thanks|thank you)(\s|$)/.test(normalized)) return "Sama-sama! Senang bisa membantu. Ada SOP menu lain yang ingin kamu tanyakan?";
  if (/(siapa kamu|kamu siapa|namamu siapa)/.test(normalized)) return "Aku SOPi, asisten pengetahuan Bakerzin. Aku bisa membantu menjelaskan SOP dan mencarikan dokumen menu yang tersedia.";
  return "";
}
__name(sopiConversationFallback, "sopiConversationFallback");

var SOPI_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
var SOPI_MAX_DRIVE_BYTES = 8 * 1024 * 1024;
var SOPI_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
var SOPI_ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "png", "jpg", "jpeg", "webp", "gif", "bmp"
]);
var SOPI_ALLOWED_SOURCE_EXTENSIONS = new Set([
  ...SOPI_ALLOWED_EXTENSIONS, "html", "htm", "xml", "ods", "odt", "svg", "json", "txt", "md"
]);

function sopiSafeFileName(value) {
  const name = cleanText(value, 240).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/^[.\-\s]+/, "").replace(/\s+/g, " ").trim();
  return name || "lampiran";
}
__name(sopiSafeFileName, "sopiSafeFileName");

function sopiFileExtension(fileName) {
  const match = sopiSafeFileName(fileName).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}
__name(sopiFileExtension, "sopiFileExtension");

function sopiDecodeBase64(value, maximumBytes = SOPI_MAX_UPLOAD_BYTES) {
  const encoded = String(value || "").replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!encoded || encoded.length > Math.ceil(maximumBytes * 4 / 3) + 16) throw new Error("FILE_TOO_LARGE");
  let binary = "";
  try {
    binary = atob(encoded);
  } catch {
    throw new Error("INVALID_FILE");
  }
  if (binary.length > maximumBytes) throw new Error("FILE_TOO_LARGE");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
__name(sopiDecodeBase64, "sopiDecodeBase64");

function sopiDecodeImageDataUrl(value) {
  const input = String(value || "").trim();
  const match = input.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) throw new Error("INVALID_IMAGE");
  const encoded = match[2].replace(/\s+/g, "");
  if (!encoded || encoded.length > Math.ceil(SOPI_MAX_IMAGE_BYTES * 4 / 3) + 16) throw new Error("IMAGE_TOO_LARGE");
  let binary = "";
  try {
    binary = atob(encoded);
  } catch {
    throw new Error("INVALID_IMAGE");
  }
  if (binary.length > SOPI_MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return { bytes, mimeType: match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase() };
}
__name(sopiDecodeImageDataUrl, "sopiDecodeImageDataUrl");

function sopiHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sopiHex, "sopiHex");

async function sopiImageSignature(env, imageId, expires) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(env.API_KEY || "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return sopiHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${imageId}|${expires}`)));
}
__name(sopiImageSignature, "sopiImageSignature");

async function sopiImageUrl(requestUrl, env, imageId) {
  const expires = Math.floor(Date.now() / 1e3) + 900;
  const signature = await sopiImageSignature(env, imageId, expires);
  return `${requestUrl.origin}/v1/sopi/image?id=${encodeURIComponent(imageId)}&expires=${expires}&sig=${signature}`;
}
__name(sopiImageUrl, "sopiImageUrl");

async function sopiFileSignature(env, attachmentId, expires) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(env.API_KEY || "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return sopiHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${attachmentId}|file|${expires}`)));
}
__name(sopiFileSignature, "sopiFileSignature");

function sopiContentDisposition(fileName, inline = false) {
  const safeName = sopiSafeFileName(fileName);
  const asciiName = safeName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}
__name(sopiContentDisposition, "sopiContentDisposition");

function sopiEncodeBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
__name(sopiEncodeBase64, "sopiEncodeBase64");

function sopiMarkdownText(result) {
  const rows = Array.isArray(result) ? result : Array.isArray(result?.results) ? result.results : [result];
  const row = rows[0] || {};
  return cleanText(row.data || row.text || row.markdown || row.content || row.result?.data || "", 100000);
}
__name(sopiMarkdownText, "sopiMarkdownText");

async function sopiConvertSourceFile(env, file, maximumBytes = SOPI_MAX_UPLOAD_BYTES) {
  if (!file || typeof file !== "object") return "";
  const fileName = sopiSafeFileName(file.name);
  const extension = sopiFileExtension(fileName);
  const mimeType = cleanText(file.mimeType || "application/octet-stream", 120).toLowerCase();
  if (!SOPI_ALLOWED_SOURCE_EXTENSIONS.has(extension)) throw new Error("UNSUPPORTED_SOURCE_FILE");
  const bytes = sopiDecodeBase64(file.base64, maximumBytes);
  if (["json", "txt", "md"].includes(extension) || /^(?:text\/plain|text\/markdown|application\/(?:json|ld\+json))/.test(mimeType)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
    if (!text) throw new Error("SOURCE_CONVERSION_FAILED");
    return text.slice(0, 100000);
  }
  const conversion = await env.AI.toMarkdown(
    [{ name: fileName, blob: new Blob([bytes], { type: mimeType }) }],
    { conversionOptions: { output: { format: "text" } } }
  );
  const converted = sopiMarkdownText(conversion);
  if (!converted) throw new Error("SOURCE_CONVERSION_FAILED");
  return converted.slice(0, 100000);
}
__name(sopiConvertSourceFile, "sopiConvertSourceFile");

async function sopiTrackUnanswered(env, question) {
  const normalized = sopiNormalizeText(question);
  if (!normalized) return;
  await env.MASTER_DB.prepare(
    `INSERT INTO sopi_unanswered(question_id, normalized_question, question, ask_count, status, first_asked_at, last_asked_at)
     VALUES (?, ?, ?, 1, 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(normalized_question) DO UPDATE SET
       question = excluded.question,
       ask_count = sopi_unanswered.ask_count + 1,
       status = CASE WHEN sopi_unanswered.status = 'ANSWERED' THEN 'ANSWERED' ELSE 'OPEN' END,
       last_asked_at = CURRENT_TIMESTAMP`
  ).bind(crypto.randomUUID(), normalized, cleanText(question, 1200)).run();
}
__name(sopiTrackUnanswered, "sopiTrackUnanswered");

async function sopiAdminBootstrap(env, requestId) {
  const [questions, knowledgeCount, knowledge] = await Promise.all([
    env.MASTER_DB.prepare(
      `SELECT question_id, question, ask_count, first_asked_at, last_asked_at
         FROM sopi_unanswered WHERE status = 'OPEN'
        ORDER BY ask_count DESC, last_asked_at DESC LIMIT 100`
    ).all(),
    env.MASTER_DB.prepare("SELECT COUNT(*) AS total FROM sopi_documents WHERE source_type <> 'JSON'").first(),
    env.MASTER_DB.prepare(
      `SELECT d.document_id, d.title, d.category, d.admin_content, d.source_url, d.updated_at,
              a.file_name, a.mime_type
         FROM sopi_documents d
         LEFT JOIN sopi_attachments a ON a.attachment_id = d.attachment_id
        WHERE d.source_type = 'BIHQ_UPLOAD'
        ORDER BY d.updated_at DESC LIMIT 100`
    ).all()
  ]);
  const rows = (questions.results || []).map((row) => ({
    id: cleanText(row.question_id, 180),
    question: cleanText(row.question, 1200),
    askCount: Number(row.ask_count || 1),
    firstAskedAt: cleanText(row.first_asked_at, 40),
    lastAskedAt: cleanText(row.last_asked_at, 40)
  }));
  const knowledgeRows = (knowledge.results || []).map((row) => ({
    id: cleanText(row.document_id, 180),
    title: cleanText(row.title, 240),
    category: cleanText(row.category, 100),
    content: cleanText(row.admin_content, 30000),
    sourceUrl: cleanText(row.source_url, 600),
    fileName: cleanText(row.file_name, 240),
    mimeType: cleanText(row.mime_type, 120),
    updatedAt: cleanText(row.updated_at, 40)
  }));
  return responseJson({ ok: true, data: { openCount: rows.length, questions: rows, knowledgeCount: Number(knowledgeCount?.total || 0), knowledge: knowledgeRows }, requestId });
}
__name(sopiAdminBootstrap, "sopiAdminBootstrap");

async function sopiAdminAnswer(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 1e5);
    const questionId = requiredText(payload.questionId, "question_id", 180);
    const answer = requiredText(payload.answer, "answer", 12000);
    const answeredBy = cleanText(payload.answeredBy, 180);
    const row = await env.MASTER_DB.prepare(
      "SELECT question, normalized_question FROM sopi_unanswered WHERE question_id = ? AND status = 'OPEN' LIMIT 1"
    ).bind(questionId).first();
    if (!row) return apiError(404, "QUESTION_NOT_FOUND", "Pertanyaan tidak ditemukan atau sudah dijawab.", requestId);
    const documentId = `answer:${questionId}`;
    const question = cleanText(row.question, 1200);
    const searchText = `${question} ${answer}`.replace(/\s+/g, " ").trim();
    await env.MASTER_DB.batch([
      env.MASTER_DB.prepare(
        `INSERT INTO sopi_documents(
           document_id, title, category, category_detail, effective_date, revision, is_legacy,
           yield_text, shelf_life, ingredients_json, steps_json, search_text, source_url,
           source_type, status, content_text, attachment_id, updated_at
         ) VALUES (?, ?, 'Jawaban BIHQ', 'Knowledge Center', '', '1', 0, '', '', '[]', '[]', ?, '', 'BIHQ_ANSWER', 'ACTIVE', ?, '', CURRENT_TIMESTAMP)
         ON CONFLICT(document_id) DO UPDATE SET title = excluded.title, search_text = excluded.search_text,
           content_text = excluded.content_text, status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP`
      ).bind(documentId, question, searchText, answer),
      env.MASTER_DB.prepare(
        `UPDATE sopi_unanswered SET status = 'ANSWERED', answer = ?, answered_by = ?, answered_at = CURRENT_TIMESTAMP
          WHERE question_id = ?`
      ).bind(answer, answeredBy, questionId)
    ]);
    return responseJson({ ok: true, data: { success: true, documentId }, requestId });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "INVALID_ANSWER", "Jawaban tidak dapat disimpan.", requestId);
  }
}
__name(sopiAdminAnswer, "sopiAdminAnswer");

async function sopiAdminDeleteQuestion(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 2e4);
    const questionId = requiredText(payload.questionId, "question_id", 180);
    const existing = await env.MASTER_DB.prepare("SELECT question_id FROM sopi_unanswered WHERE question_id = ? LIMIT 1").bind(questionId).first();
    if (!existing) return apiError(404, "QUESTION_NOT_FOUND", "Pertanyaan tidak ditemukan.", requestId);
    await env.MASTER_DB.batch([
      env.MASTER_DB.prepare("DELETE FROM sopi_documents WHERE document_id = ? AND source_type = 'BIHQ_ANSWER'").bind(`answer:${questionId}`),
      env.MASTER_DB.prepare("DELETE FROM sopi_unanswered WHERE question_id = ?").bind(questionId)
    ]);
    return responseJson({ ok: true, data: { success: true }, requestId });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "INVALID_QUESTION", "Pertanyaan tidak dapat dihapus.", requestId);
  }
}
__name(sopiAdminDeleteQuestion, "sopiAdminDeleteQuestion");

async function sopiAdminKnowledge(request, env, requestId) {
  let uploadedKey = "";
  try {
    const payload = await readJsonWithLimit(request, 6e6);
    const title = requiredText(payload.title, "title", 240);
    const category = requiredText(payload.category, "category", 100);
    const body = cleanText(payload.content, 30000);
    const sourceUrl = cleanText(payload.sourceUrl, 600);
    const uploadedBy = cleanText(payload.uploadedBy, 180);
    const file = payload.file && typeof payload.file === "object" ? payload.file : null;
    const sourceFile = payload.sourceFile && typeof payload.sourceFile === "object" ? payload.sourceFile : null;
    if (!body && !file && !sourceUrl) throw new Error("EMPTY_KNOWLEDGE");

    const documentId = `knowledge:${crypto.randomUUID()}`;
    let attachmentId = "";
    let fileName = "";
    let mimeType = "";
    let converted = "";
    let sourceContent = "";
    let bytes = null;
    if (file) {
      fileName = sopiSafeFileName(file.name);
      mimeType = cleanText(file.mimeType || "application/octet-stream", 120).toLowerCase();
      const extension = sopiFileExtension(fileName);
      if (!SOPI_ALLOWED_EXTENSIONS.has(extension)) throw new Error("UNSUPPORTED_FILE");
      bytes = sopiDecodeBase64(file.base64);
      const conversion = await env.AI.toMarkdown([
        { name: fileName, blob: new Blob([bytes], { type: mimeType }) }
      ], { conversionOptions: { output: { format: "text" } } });
      converted = sopiMarkdownText(conversion);
      if (!converted) throw new Error("FILE_CONVERSION_FAILED");
      attachmentId = crypto.randomUUID();
      uploadedKey = `sopi/${documentId}/${fileName}`;
      await env.FILES.put(uploadedKey, bytes, { httpMetadata: { contentType: mimeType } });
    }

    if (sourceFile) sourceContent = await sopiConvertSourceFile(env, sourceFile);

    const contentText = [body, converted, sourceContent].filter(Boolean).join("\n\n").slice(0, 100000);
    const searchText = [title, category, contentText, fileName, sourceUrl].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const statements = [env.MASTER_DB.prepare(
      `INSERT INTO sopi_documents(
         document_id, title, category, category_detail, effective_date, revision, is_legacy,
         yield_text, shelf_life, ingredients_json, steps_json, search_text, source_url,
         admin_content, source_content, source_type, status, content_text, attachment_id, updated_at
       ) VALUES (?, ?, ?, 'Knowledge Center', '', '1', 0, '', '', '[]', '[]', ?, ?, ?, ?, 'BIHQ_UPLOAD', 'ACTIVE', ?, ?, CURRENT_TIMESTAMP)`
    ).bind(documentId, title, category, searchText, sourceUrl, body, sourceContent, contentText, attachmentId)];
    if (attachmentId) {
      statements.push(env.MASTER_DB.prepare(
        `INSERT INTO sopi_attachments(attachment_id, document_id, file_name, mime_type, size_bytes, r2_key, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      ).bind(attachmentId, documentId, fileName, mimeType, bytes.byteLength, uploadedKey, uploadedBy));
    }
    await env.MASTER_DB.batch(statements);
    return responseJson({ ok: true, data: { success: true, documentId, attachmentId, extractedCharacters: converted.length }, requestId });
  } catch (error) {
    if (uploadedKey) {
      try { await env.FILES.delete(uploadedKey); } catch {}
    }
    const code = error instanceof Error ? error.message : "INVALID_KNOWLEDGE";
    const messages = {
      FILE_TOO_LARGE: "Ukuran lampiran maksimal 4 MB.",
      UNSUPPORTED_FILE: "Format file belum didukung. Gunakan PDF, Word, Excel, CSV, atau gambar.",
      FILE_CONVERSION_FAILED: "Isi file tidak berhasil dibaca.",
      UNSUPPORTED_SOURCE_FILE: "Format dari link belum didukung.",
      SOURCE_CONVERSION_FAILED: "Isi dari link tidak berhasil dibaca.",
      EMPTY_KNOWLEDGE: "Isi informasi atau lampiran wajib diisi."
    };
    return apiError(code === "FILE_TOO_LARGE" ? 413 : 400, code, messages[code] || "Informasi tidak dapat disimpan.", requestId);
  }
}
__name(sopiAdminKnowledge, "sopiAdminKnowledge");

async function sopiAdminUpdateKnowledge(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 1e5);
    const documentId = requiredText(payload.documentId, "document_id", 180);
    const title = requiredText(payload.title, "title", 240);
    const category = requiredText(payload.category, "category", 100);
    const body = cleanText(payload.content, 30000);
    const sourceUrl = cleanText(payload.sourceUrl, 600);
    const sourceFile = payload.sourceFile && typeof payload.sourceFile === "object" ? payload.sourceFile : null;
    const row = await env.MASTER_DB.prepare(
      `SELECT d.content_text, d.admin_content, d.source_content, a.file_name
         FROM sopi_documents d LEFT JOIN sopi_attachments a ON a.attachment_id = d.attachment_id
        WHERE d.document_id = ? AND d.source_type = 'BIHQ_UPLOAD' LIMIT 1`
    ).bind(documentId).first();
    if (!row) return apiError(404, "KNOWLEDGE_NOT_FOUND", "Informasi tidak ditemukan.", requestId);
    const oldBody = cleanText(row.admin_content, 30000);
    const oldSourceContent = cleanText(row.source_content, 100000);
    const oldContent = cleanText(row.content_text, 100000);
    let extracted = oldBody && oldContent.startsWith(oldBody) ? oldContent.slice(oldBody.length).trim() : oldContent;
    if (oldSourceContent && extracted.endsWith(oldSourceContent)) extracted = extracted.slice(0, extracted.length - oldSourceContent.length).trim();
    const sourceContent = sourceFile ? await sopiConvertSourceFile(env, sourceFile) : "";
    const contentText = [body, extracted, sourceContent].filter(Boolean).join("\n\n").slice(0, 100000);
    const searchText = [title, category, contentText, cleanText(row.file_name, 240), sourceUrl].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    await env.MASTER_DB.prepare(
      `UPDATE sopi_documents
          SET title = ?, category = ?, admin_content = ?, source_url = ?, source_content = ?, content_text = ?, search_text = ?, updated_at = CURRENT_TIMESTAMP
        WHERE document_id = ? AND source_type = 'BIHQ_UPLOAD'`
    ).bind(title, category, body, sourceUrl, sourceContent, contentText, searchText, documentId).run();
    return responseJson({ ok: true, data: { success: true }, requestId });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "INVALID_KNOWLEDGE", "Informasi tidak dapat diperbarui.", requestId);
  }
}
__name(sopiAdminUpdateKnowledge, "sopiAdminUpdateKnowledge");

async function sopiAdminDeleteKnowledge(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 2e4);
    const documentId = requiredText(payload.documentId, "document_id", 180);
    const row = await env.MASTER_DB.prepare(
      `SELECT a.r2_key FROM sopi_documents d
         LEFT JOIN sopi_attachments a ON a.attachment_id = d.attachment_id
        WHERE d.document_id = ? AND d.source_type = 'BIHQ_UPLOAD' LIMIT 1`
    ).bind(documentId).first();
    if (!row) return apiError(404, "KNOWLEDGE_NOT_FOUND", "Informasi tidak ditemukan.", requestId);
    await env.MASTER_DB.batch([
      env.MASTER_DB.prepare("DELETE FROM sopi_attachments WHERE document_id = ?").bind(documentId),
      env.MASTER_DB.prepare("DELETE FROM sopi_documents WHERE document_id = ? AND source_type = 'BIHQ_UPLOAD'").bind(documentId)
    ]);
    if (row.r2_key) {
      try { await env.FILES.delete(cleanText(row.r2_key, 700)); } catch {}
    }
    return responseJson({ ok: true, data: { success: true }, requestId });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "INVALID_KNOWLEDGE", "Informasi tidak dapat dihapus.", requestId);
  }
}
__name(sopiAdminDeleteKnowledge, "sopiAdminDeleteKnowledge");

async function sopiAdminJsonDocument(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 2e5);
    const documentId = requiredText(payload.documentId, "document_id", 180);
    const title = requiredText(payload.title, "title", 240);
    const category = cleanText(payload.category, 100);
    const categoryDetail = cleanText(payload.categoryDetail, 100);
    const effectiveDate = cleanText(payload.effectiveDate, 20);
    const revision = cleanText(payload.revision, 40);
    const yieldText = cleanText(payload.yieldText, 300);
    const shelfLife = cleanText(payload.shelfLife, 300);
    const sourceUrl = cleanText(payload.sourceUrl, 600);
    const status = cleanText(payload.status, 80);
    const ingredients = (Array.isArray(payload.ingredients) ? payload.ingredients : []).slice(0, 100).map((item) => ({
      name: cleanText(item?.name, 180), qty: cleanText(item?.qty, 40), uom: cleanText(item?.uom, 60)
    })).filter((item) => item.name);
    const steps = (Array.isArray(payload.steps) ? payload.steps : []).slice(0, 60).map((step, index) => ({
      no: Number(step?.no || index + 1), desc: cleanText(step?.desc, 1200)
    })).filter((step) => step.desc);
    const searchText = [title, category, categoryDetail, yieldText, shelfLife,
      ...ingredients.flatMap((item) => [item.name, item.qty, item.uom]), ...steps.map((step) => step.desc)
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    await env.MASTER_DB.prepare(
      `INSERT INTO sopi_documents(
         document_id, title, category, category_detail, effective_date, revision, is_legacy,
         yield_text, shelf_life, ingredients_json, steps_json, search_text, source_url,
         source_type, status, content_text, attachment_id, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'JSON', ?, '', '', CURRENT_TIMESTAMP)
       ON CONFLICT(document_id) DO UPDATE SET
         title = excluded.title, category = excluded.category, category_detail = excluded.category_detail,
         effective_date = excluded.effective_date, revision = excluded.revision, is_legacy = excluded.is_legacy,
         yield_text = excluded.yield_text, shelf_life = excluded.shelf_life,
         ingredients_json = excluded.ingredients_json, steps_json = excluded.steps_json,
         search_text = excluded.search_text, source_url = excluded.source_url, source_type = 'JSON',
         status = excluded.status, updated_at = CURRENT_TIMESTAMP`
    ).bind(documentId, title, category, categoryDetail, effectiveDate, revision, payload.isLegacy ? 1 : 0,
      yieldText, shelfLife, JSON.stringify(ingredients), JSON.stringify(steps), searchText, sourceUrl, status).run();
    return responseJson({ ok: true, data: { success: true, documentId }, requestId });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "INVALID_JSON_DOCUMENT", "Dokumen JSON tidak dapat disinkronkan.", requestId);
  }
}
__name(sopiAdminJsonDocument, "sopiAdminJsonDocument");

function sopiDriveTitle(fileName) {
  return sopiSafeFileName(fileName)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^\s*\d+\s*[._-]\s*/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}
__name(sopiDriveTitle, "sopiDriveTitle");

async function sopiAdminDriveDocument(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 12 * 1024 * 1024);
    const driveFileId = requiredText(payload.driveFileId, "drive_file_id", 180);
    const fileName = sopiSafeFileName(requiredText(payload.fileName, "file_name", 240));
    const mimeType = cleanText(payload.mimeType || "application/octet-stream", 120).toLowerCase();
    const extension = sopiFileExtension(fileName);
    if (!SOPI_ALLOWED_EXTENSIONS.has(extension)) throw new Error("UNSUPPORTED_FILE");
    const bytes = sopiDecodeBase64(payload.base64, SOPI_MAX_DRIVE_BYTES);
    const conversion = await env.AI.toMarkdown([
      { name: fileName, blob: new Blob([bytes], { type: mimeType }) }
    ], { conversionOptions: { output: { format: "text" } } });
    const converted = sopiMarkdownText(conversion);
    if (!converted) throw new Error("FILE_CONVERSION_FAILED");

    const documentId = `drive:${driveFileId}`;
    const attachmentId = `drive:${driveFileId}`;
    const uploadedKey = `sopi/drive/${driveFileId}/${fileName}`;
    const title = sopiDriveTitle(payload.title || fileName) || fileName;
    const sourcePath = cleanText(payload.sourcePath, 500);
    const sourceUrl = cleanText(payload.sourceUrl, 600);
    const uploadedBy = cleanText(payload.uploadedBy, 180);
    const searchText = [title, fileName, sourcePath, converted].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    await env.FILES.put(uploadedKey, bytes, { httpMetadata: { contentType: mimeType } });
    await env.MASTER_DB.batch([
      env.MASTER_DB.prepare(
        `INSERT INTO sopi_documents(
           document_id, title, category, category_detail, effective_date, revision, is_legacy,
           yield_text, shelf_life, ingredients_json, steps_json, search_text, source_url,
           source_type, status, content_text, attachment_id, updated_at
         ) VALUES (?, ?, 'Drive SOP', ?, '', '', 0, '', '', '[]', '[]', ?, ?, 'DRIVE', 'ACTIVE', ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(document_id) DO UPDATE SET
           title = excluded.title, category = excluded.category, category_detail = excluded.category_detail,
           search_text = excluded.search_text, source_url = excluded.source_url, source_type = 'DRIVE',
           status = 'ACTIVE', content_text = excluded.content_text, attachment_id = excluded.attachment_id,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(documentId, title, sourcePath, searchText, sourceUrl, converted, attachmentId),
      env.MASTER_DB.prepare(
        `INSERT INTO sopi_attachments(attachment_id, document_id, file_name, mime_type, size_bytes, r2_key, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(attachment_id) DO UPDATE SET
           document_id = excluded.document_id, file_name = excluded.file_name, mime_type = excluded.mime_type,
           size_bytes = excluded.size_bytes, r2_key = excluded.r2_key, uploaded_by = excluded.uploaded_by,
           created_at = CURRENT_TIMESTAMP`
      ).bind(attachmentId, documentId, fileName, mimeType, bytes.byteLength, uploadedKey, uploadedBy)
    ]);
    return responseJson({ ok: true, data: { success: true, documentId, attachmentId, extractedCharacters: converted.length }, requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_DRIVE_DOCUMENT";
    const messages = {
      FILE_TOO_LARGE: "File Drive melebihi batas 8 MB.",
      UNSUPPORTED_FILE: "Format file Drive belum didukung.",
      FILE_CONVERSION_FAILED: "Isi file Drive tidak berhasil dibaca."
    };
    return apiError(code === "FILE_TOO_LARGE" || code === "PAYLOAD_TOO_LARGE" ? 413 : 400, code, messages[code] || "Dokumen Drive tidak dapat disinkronkan.", requestId);
  }
}
__name(sopiAdminDriveDocument, "sopiAdminDriveDocument");

async function sopiAdminSourceStatus(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 1e5);
    const documentIds = [...new Set((Array.isArray(payload.documentIds) ? payload.documentIds : [])
      .slice(0, 400).map((value) => cleanText(value, 180)).filter(Boolean))];
    if (!documentIds.length) return responseJson({ ok: true, data: { existingDocumentIds: [] }, requestId });
    const existingDocumentIds = [];
    for (let offset = 0; offset < documentIds.length; offset += 100) {
      const chunk = documentIds.slice(offset, offset + 100);
      const placeholders = chunk.map(() => "?").join(",");
      const result = await env.MASTER_DB.prepare(
        `SELECT document_id FROM sopi_documents WHERE document_id IN (${placeholders})`
      ).bind(...chunk).all();
      for (const row of result.results || []) existingDocumentIds.push(cleanText(row.document_id, 180));
    }
    return responseJson({ ok: true, data: { existingDocumentIds }, requestId });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "INVALID_SOURCE_STATUS", "Status sumber SOPi tidak dapat diperiksa.", requestId);
  }
}
__name(sopiAdminSourceStatus, "sopiAdminSourceStatus");

async function sopiFile(requestUrl, env, requestId) {
  const attachmentId = cleanText(requestUrl.searchParams.get("id"), 180);
  if (!attachmentId) return apiError(400, "INVALID_ATTACHMENT", "Lampiran tidak valid.", requestId);
  const row = await env.MASTER_DB.prepare(
    "SELECT file_name, mime_type, size_bytes, r2_key FROM sopi_attachments WHERE attachment_id = ? LIMIT 1"
  ).bind(attachmentId).first();
  if (!row) return apiError(404, "ATTACHMENT_NOT_FOUND", "Lampiran tidak ditemukan.", requestId);
  const object = await env.FILES.get(cleanText(row.r2_key, 700));
  if (!object) return apiError(404, "ATTACHMENT_NOT_FOUND", "File lampiran tidak ditemukan.", requestId);
  if (Number(row.size_bytes || 0) > SOPI_MAX_DRIVE_BYTES) return apiError(413, "FILE_TOO_LARGE", "Lampiran terlalu besar untuk diunduh.", requestId);
  return responseJson({
    ok: true,
    data: {
      fileName: cleanText(row.file_name, 240),
      mimeType: cleanText(row.mime_type, 120) || "application/octet-stream",
      base64: sopiEncodeBase64(await object.arrayBuffer())
    },
    requestId
  });
}
__name(sopiFile, "sopiFile");

async function sopiFileLink(requestUrl, env, requestId) {
  const attachmentId = cleanText(requestUrl.searchParams.get("id"), 180);
  if (!attachmentId) return apiError(400, "INVALID_ATTACHMENT", "Lampiran tidak valid.", requestId);
  const row = await env.MASTER_DB.prepare(
    "SELECT file_name, mime_type, size_bytes FROM sopi_attachments WHERE attachment_id = ? LIMIT 1"
  ).bind(attachmentId).first();
  if (!row) return apiError(404, "ATTACHMENT_NOT_FOUND", "Lampiran tidak ditemukan.", requestId);
  if (Number(row.size_bytes || 0) > SOPI_MAX_DRIVE_BYTES) return apiError(413, "FILE_TOO_LARGE", "Lampiran terlalu besar untuk dibuka.", requestId);
  const expires = Math.floor(Date.now() / 1e3) + 1800;
  const signature = await sopiFileSignature(env, attachmentId, expires);
  return responseJson({
    ok: true,
    data: {
      fileName: cleanText(row.file_name, 240),
      mimeType: cleanText(row.mime_type, 120) || "application/octet-stream",
      sizeBytes: Number(row.size_bytes || 0),
      url: `${requestUrl.origin}/v1/sopi/file-content?id=${encodeURIComponent(attachmentId)}&expires=${expires}&sig=${signature}`,
      expiresAt: new Date(expires * 1000).toISOString()
    },
    requestId
  });
}
__name(sopiFileLink, "sopiFileLink");

async function sopiFileContent(request, requestUrl, env, requestId) {
  const attachmentId = cleanText(requestUrl.searchParams.get("id"), 180);
  const expires = Number.parseInt(cleanText(requestUrl.searchParams.get("expires"), 20), 10);
  const signature = cleanText(requestUrl.searchParams.get("sig"), 128).toLowerCase();
  const now = Math.floor(Date.now() / 1e3);
  if (!attachmentId || !Number.isFinite(expires) || expires < now || expires > now + 1800 || !signature) {
    return apiError(403, "FILE_LINK_EXPIRED", "Tautan file sudah berakhir.", requestId);
  }
  const expected = await sopiFileSignature(env, attachmentId, expires);
  if (!await secureEqual(signature, expected)) return apiError(403, "INVALID_FILE_LINK", "Tautan file tidak valid.", requestId);
  const row = await env.MASTER_DB.prepare(
    "SELECT file_name, mime_type, size_bytes, r2_key FROM sopi_attachments WHERE attachment_id = ? LIMIT 1"
  ).bind(attachmentId).first();
  if (!row) return apiError(404, "ATTACHMENT_NOT_FOUND", "Lampiran tidak ditemukan.", requestId);
  const r2Key = cleanText(row.r2_key, 700);
  const object = request.method === "HEAD" ? await env.FILES.head(r2Key) : await env.FILES.get(r2Key, { range: request.headers });
  if (!object) return apiError(404, "ATTACHMENT_NOT_FOUND", "File lampiran tidak ditemukan.", requestId);
  const mimeType = cleanText(row.mime_type, 120) || object.httpMetadata?.contentType || "application/octet-stream";
  const headers = new Headers({
    "content-type": mimeType,
    "content-disposition": sopiContentDisposition(row.file_name, mimeType === "application/pdf" || mimeType.startsWith("image/")),
    "cache-control": "private, max-age=300",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  });
  if (object.httpEtag) headers.set("etag", object.httpEtag);
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  let status = 200;
  if (object.range) {
    const totalSize = Number(object.size || row.size_bytes || 0);
    let offset = Number(object.range.offset);
    let length = Number(object.range.length);
    if (!Number.isFinite(offset) && Number.isFinite(Number(object.range.suffix))) {
      length = Math.min(Number(object.range.suffix), totalSize);
      offset = Math.max(0, totalSize - length);
    }
    if (Number.isFinite(offset) && !Number.isFinite(length)) length = Math.max(0, totalSize - offset);
    if (Number.isFinite(offset) && Number.isFinite(length) && length > 0 && totalSize > 0) {
      headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${totalSize}`);
      status = 206;
    }
  }
  return new Response(object.body, { status, headers });
}
__name(sopiFileContent, "sopiFileContent");

async function sopiAdminImage(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 12 * 1024 * 1024);
    const documentId = requiredText(payload.documentId, "document_id", 180);
    const imageKind = cleanText(payload.kind, 20).toUpperCase();
    const stepIndex = imageKind === "STEP" ? Number.parseInt(String(payload.stepIndex), 10) : -1;
    if (!new Set(["FINAL", "STEP"]).has(imageKind) || (imageKind === "STEP" && (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > 59))) {
      throw new Error("INVALID_IMAGE_POSITION");
    }
    const document = await env.MASTER_DB.prepare("SELECT document_id FROM sopi_documents WHERE document_id = ? LIMIT 1").bind(documentId).first();
    if (!document) return apiError(404, "DOCUMENT_NOT_FOUND", "Dokumen SOP tidak ditemukan.", requestId);
    const decoded = sopiDecodeImageDataUrl(payload.dataUrl);
    const extension = decoded.mimeType === "image/jpeg" ? "jpg" : decoded.mimeType.split("/")[1];
    const imageId = `${documentId}:${imageKind}:${stepIndex}`;
    const uploadedKey = `sopi/images/${encodeURIComponent(documentId)}/${imageKind.toLowerCase()}-${stepIndex}.${extension}`;
    await env.FILES.put(uploadedKey, decoded.bytes, {
      httpMetadata: { contentType: decoded.mimeType, cacheControl: "private, max-age=900" }
    });
    await env.MASTER_DB.prepare(
      `INSERT INTO sopi_images(image_id, document_id, image_kind, step_index, mime_type, size_bytes, r2_key, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(document_id, image_kind, step_index) DO UPDATE SET
         image_id = excluded.image_id, mime_type = excluded.mime_type, size_bytes = excluded.size_bytes,
         r2_key = excluded.r2_key, updated_at = CURRENT_TIMESTAMP`
    ).bind(imageId, documentId, imageKind, stepIndex, decoded.mimeType, decoded.bytes.byteLength, uploadedKey).run();
    return responseJson({ ok: true, data: { success: true, imageId, sizeBytes: decoded.bytes.byteLength }, requestId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_IMAGE";
    return apiError(code === "IMAGE_TOO_LARGE" || code === "PAYLOAD_TOO_LARGE" ? 413 : 400, code,
      code === "IMAGE_TOO_LARGE" || code === "PAYLOAD_TOO_LARGE" ? "Gambar maksimal 8 MB." : "Gambar SOP tidak valid.", requestId);
  }
}
__name(sopiAdminImage, "sopiAdminImage");

async function sopiImage(requestUrl, env, requestId) {
  const imageId = cleanText(requestUrl.searchParams.get("id"), 240);
  const expires = Number.parseInt(cleanText(requestUrl.searchParams.get("expires"), 20), 10);
  const signature = cleanText(requestUrl.searchParams.get("sig"), 128).toLowerCase();
  if (!imageId || !Number.isFinite(expires) || expires < Math.floor(Date.now() / 1e3) || expires > Math.floor(Date.now() / 1e3) + 1800 || !signature) {
    return apiError(403, "IMAGE_LINK_EXPIRED", "Tautan gambar sudah berakhir.", requestId);
  }
  const expected = await sopiImageSignature(env, imageId, expires);
  if (!await secureEqual(signature, expected)) return apiError(403, "INVALID_IMAGE_LINK", "Tautan gambar tidak valid.", requestId);
  const row = await env.MASTER_DB.prepare("SELECT mime_type, r2_key FROM sopi_images WHERE image_id = ? LIMIT 1").bind(imageId).first();
  if (!row) return apiError(404, "IMAGE_NOT_FOUND", "Gambar SOP tidak ditemukan.", requestId);
  const object = await env.FILES.get(cleanText(row.r2_key, 700));
  if (!object) return apiError(404, "IMAGE_NOT_FOUND", "Gambar SOP tidak ditemukan.", requestId);
  const headers = new Headers({
    "content-type": cleanText(row.mime_type, 120) || "application/octet-stream",
    "cache-control": "private, max-age=900",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  });
  if (object.httpEtag) headers.set("etag", object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}
__name(sopiImage, "sopiImage");

async function sopiDocument(requestUrl, env, requestId) {
  const documentId = cleanText(requestUrl.searchParams.get("id"), 180);
  if (!documentId) return apiError(400, "INVALID_DOCUMENT", "Dokumen SOP tidak valid.", requestId);
  const row = await env.MASTER_DB.prepare(
    `SELECT d.document_id, d.title, d.category, d.category_detail, d.effective_date, d.revision,
            d.is_legacy, d.yield_text, d.shelf_life, d.ingredients_json, d.steps_json,
            d.content_text, d.attachment_id, d.source_type, d.status,
            a.file_name, a.mime_type
       FROM sopi_documents d
       LEFT JOIN sopi_attachments a ON a.attachment_id = d.attachment_id
      WHERE d.document_id = ? LIMIT 1`
  ).bind(documentId).first();
  if (!row) return apiError(404, "DOCUMENT_NOT_FOUND", "Dokumen SOP tidak ditemukan.", requestId);
  const imageRows = await env.MASTER_DB.prepare(
    "SELECT image_id, image_kind, step_index FROM sopi_images WHERE document_id = ? ORDER BY image_kind, step_index"
  ).bind(documentId).all();
  const images = await Promise.all((imageRows.results || []).map(async (image) => ({
    id: cleanText(image.image_id, 240),
    kind: cleanText(image.image_kind, 20),
    stepIndex: Number(image.step_index),
    url: await sopiImageUrl(requestUrl, env, cleanText(image.image_id, 240))
  })));
  const finalImage = images.find((image) => image.kind === "FINAL");
  const stepImages = new Map(images.filter((image) => image.kind === "STEP").map((image) => [image.stepIndex, image.url]));
  const steps = sopiParseJson(row.steps_json).slice(0, 60).map((step, index) => ({ ...step, imageUrl: stepImages.get(index) || "" }));
  return responseJson({
    ok: true,
    data: {
      id: cleanText(row.document_id, 180),
      title: cleanText(row.title, 240),
      category: cleanText(row.category, 100),
      categoryDetail: cleanText(row.category_detail, 100),
      effectiveDate: cleanText(row.effective_date, 20),
      revision: cleanText(row.revision, 40),
      isLegacy: Number(row.is_legacy || 0) === 1,
      yieldText: cleanText(row.yield_text, 300),
      shelfLife: cleanText(row.shelf_life, 300),
      ingredients: sopiParseJson(row.ingredients_json).slice(0, 80),
      steps,
      finalImageUrl: finalImage?.url || "",
      contentText: cleanText(row.content_text, 100000),
      sourceType: cleanText(row.source_type, 30),
      status: cleanText(row.status, 80),
      fileId: cleanText(row.attachment_id, 180),
      fileName: cleanText(row.file_name, 240),
      mimeType: cleanText(row.mime_type, 120)
    },
    requestId
  });
}
__name(sopiDocument, "sopiDocument");

async function sopiChat(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 6e4);
    const question = requiredText(payload.question, "question", 1200);
    const userName = cleanText(payload.userName, 120);
    const userContext = userName ? `Nama staff yang sedang berbicara adalah ${userName}. Panggil dengan nama depannya secara natural pada sapaan atau saat relevan, tetapi jangan mengulang nama di setiap jawaban.` : "";
    const history = Array.isArray(payload.history) ? payload.history.slice(-6).map((message) => ({
      role: cleanText(message?.role, 20) === "assistant" ? "assistant" : "user",
      content: cleanText(message?.content, 1000)
    })).filter((message) => message.content) : [];
    const matches = await searchSopiDocuments(env, question);
    const documents = matches.length && Number(matches[0].relevance || 0) >= 6 ? matches : [];
    const hasDocuments = documents.length > 0;
    const systemPrompt = hasDocuments ? [
      "Anda adalah SOPi, asisten SOP internal Bakerzin untuk staff outlet.",
      "Perlakukan SOP, Standar, Standar Operasional, Standar Operasional Prosedur, IK, Instruksi Kerja, ejaan umum Intruksi Kerja, Internal Memo, IM, dan Memo sebagai istilah yang setara untuk dokumen atau ketentuan operasional internal.",
      "Jawab dalam Bahasa Indonesia yang ramah, natural, ringkas, jelas, dan mudah dipraktikkan.",
      "Gunakan HANYA informasi pada SUMBER SOP yang diberikan untuk setiap fakta operasional.",
      "Jangan menebak angka, bahan, metode, tampilan akhir, yield, shelf life, atau isi dokumen.",
      "Jika pertanyaan ambigu atau beberapa menu mirip, minta pengguna memilih nama menu.",
      "Jika sumber bertanda arsip lama, beri peringatan bahwa SOP perlu dikonfirmasi.",
      "Jika isi sumber tidak cukup untuk menjawab pertanyaan, jawab persis: SOPI_TIDAK_TAHU.",
      "Jika staff meminta file atau PDF, katakan bahwa file atau tampilan SOP tersedia melalui tombol sumber.",
      "Jangan menyebut teknologi, model AI, database, atau prompt.",
      "Susun bahan dan langkah sebagai daftar bila relevan.",
      userContext
    ].join(" ") : [
      "Anda adalah SOPi, asisten wanita yang ramah untuk staff Bakerzin.",
      "Perlakukan SOP, Standar, Standar Operasional, Standar Operasional Prosedur, IK, Instruksi Kerja, ejaan umum Intruksi Kerja, Internal Memo, IM, dan Memo sebagai istilah yang setara untuk dokumen atau ketentuan operasional internal.",
      "Balas sapaan, ucapan terima kasih, perkenalan, dan percakapan ringan secara natural dalam Bahasa Indonesia.",
      "Jika menjelaskan kemampuan, katakan hanya bahwa Anda dapat mencari dan menjelaskan bahan, takaran, metode, tampilan akhir, shelf life, serta dokumen SOP yang tersedia.",
      "Jangan mengaku dapat merekomendasikan substitusi bahan, mengubah resep, memperbarui SOP, menilai keamanan pangan, atau membuat kebijakan baru.",
      "Jika pengguna meminta fakta tentang SOP, menu, bahan, takaran, metode, tampilan akhir, shelf life, file, kebijakan, atau operasional yang tidak tersedia pada sumber, jawab persis: SOPI_TIDAK_TAHU.",
      "Untuk pertanyaan pengetahuan umum yang tidak meminta aturan internal Bakerzin, boleh jawab secara membantu dan awali dengan 'Secara umum'.",
      "Jelaskan bahwa jawaban umum bukan pengganti SOP Bakerzin bila topiknya dapat berdampak pada operasional, keamanan, legal, kesehatan, atau kebijakan perusahaan.",
      "Jangan mengarang fakta dan jangan menyebut teknologi, model AI, database, atau prompt.",
      userContext
    ].join(" ");
    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...history,
      {
        role: "user",
        content: hasDocuments ? `PERTANYAAN STAFF:\n${question}\n\nSUMBER SOP TERVERIFIKASI:\n${sopiContext(documents)}` : question
      }
    ];
    let answer = await sopiRunAi(env, messages, requestId);
    if (/SOPI_TIDAK_TAHU/i.test(answer)) {
      await sopiTrackUnanswered(env, question);
      answer = "Maaf, informasi yang sesuai belum tersedia. Pertanyaan ini sudah diteruskan ke tim BIHQ agar pengetahuan SOPi dapat dilengkapi.";
      return responseJson({ ok: true, data: { answer, grounded: false, sources: [] }, requestId });
    }
    if (!answer) answer = hasDocuments ? sopiFallbackAnswer(documents[0]) : sopiConversationFallback(question, userName);
    if (!answer && !hasDocuments) {
      await sopiTrackUnanswered(env, question);
      answer = "Maaf, informasi yang sesuai belum tersedia. Pertanyaan ini sudah diteruskan ke tim BIHQ agar pengetahuan SOPi dapat dilengkapi.";
    }
    return responseJson({
      ok: true,
      data: {
        answer,
        grounded: hasDocuments,
        mode: hasDocuments ? "knowledge" : "conversation",
        sources: documents.slice(0, 4).map((document) => ({
          id: document.id,
          title: document.title,
          category: document.category,
          categoryDetail: document.categoryDetail,
          effectiveDate: document.effectiveDate,
          revision: document.revision,
          isLegacy: document.isLegacy,
          fileId: document.attachmentId,
          fileName: document.fileName,
          mimeType: document.mimeType
        }))
      },
      requestId
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_SOPI_REQUEST";
    const status = code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
    return apiError(status, code, "Pertanyaan SOPi tidak valid.", requestId);
  }
}
__name(sopiChat, "sopiChat");

async function sopiStatus(env, requestId) {
  const row = await env.MASTER_DB.prepare(
    "SELECT COUNT(*) AS documents, MAX(updated_at) AS updated_at FROM sopi_documents"
  ).first();
  return responseJson({
    ok: true,
    data: {
      service: "SOPi",
      documents: Number(row?.documents || 0),
      updatedAt: cleanText(row?.updated_at, 40),
      ai: Boolean(env.AI)
    },
    requestId
  });
}
__name(sopiStatus, "sopiStatus");

async function saveStaffPerformanceScores(request, env, requestId) {
  try {
    const payload = await readJsonWithLimit(request, 5e5);
    const date = staffPerformanceDate(payload.date, "date");
    const scores = limitedArray(payload.scores || [], "scores", 300);
    const statements = scores.map((score) => {
      const nik = requiredText(score.nik, "nik", 80);
      const indicatorId = requiredText(score.indId, "indicator_id", 100);
      return env.OPERATIONS_DB.prepare(
        `INSERT INTO staff_performance_scores(
           transaction_id, score_date, nik, indicator_id, achievement, final_score, note, migrated_from, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'CLOUDFLARE', CURRENT_TIMESTAMP)
         ON CONFLICT(score_date, nik, indicator_id) DO UPDATE SET
           achievement = excluded.achievement, final_score = excluded.final_score,
           note = excluded.note, migrated_from = 'CLOUDFLARE', updated_at = CURRENT_TIMESTAMP`
      ).bind(`${date}_${nik}_${indicatorId}`, date, nik, indicatorId, cleanText(score.achievement, 1000), Number.isFinite(Number(score.score)) ? Number(score.score) : 0, cleanText(score.note, 2000));
    });
    const writtenRows = await runStatementBatches(env.OPERATIONS_DB, statements);
    return responseJson({ ok: true, data: { success: true, writtenRows }, requestId });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "INVALID_SCORES", "Nilai staff tidak valid.", requestId);
  }
}
__name(saveStaffPerformanceScores, "saveStaffPerformanceScores");

/* ===================== END BERITA ACARA ADD-ON ===================== */

async function route(request, env) {
  const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") return health(env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/ba/payments/midtrans/webhook") return midtransWebhook(request, env, requestId);
  if (request.method === "GET" && url.pathname === "/v1/sopi/image") return sopiImage(url, env, requestId);
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/v1/sopi/file-content") return sopiFileContent(request, url, env, requestId);
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
  if (request.method === "POST" && url.pathname === "/v1/ba/approval-config") return saveBaApprovalConfig(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/ba/offload-existing") return offloadExistingBeritaAcaraPayloads(request, env, requestId);
  if (request.method === "GET" && url.pathname === "/v1/ba/migrate/status") return beritaAcaraMigrationStatus(env, requestId);
  if (request.method === "GET" && url.pathname === "/v1/ba/submissions") return listBeritaAcaraSubmissions(url, env, requestId);
  if (request.method === "GET" && url.pathname === "/v1/ba/submission") return getBeritaAcaraSubmission(url, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/ba/payments/midtrans/create") return createMidtransAssetPayment(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/ba/payments/midtrans/claim") return claimMidtransAssetPayment(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/staff-performance/migrate/master") return migrateStaffPerformanceMaster(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/staff-performance/migrate/scores") return migrateStaffPerformanceScores(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/staff-performance/staff") return saveStaffPerformanceStaff(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/staff-performance/staff/deactivate") return deactivateStaffPerformanceStaff(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/staff-performance/staff/sync") return syncStaffPerformanceStaff(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/staff-performance/scores") return saveStaffPerformanceScores(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/sopi/chat") return sopiChat(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/sopi/admin/answer") return sopiAdminAnswer(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/sopi/admin/question/delete") return sopiAdminDeleteQuestion(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/sopi/admin/knowledge") return sopiAdminKnowledge(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/sopi/admin/knowledge/update") return sopiAdminUpdateKnowledge(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/sopi/admin/knowledge/delete") return sopiAdminDeleteKnowledge(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/sopi/admin/json-document") return sopiAdminJsonDocument(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/sopi/admin/drive-document") return sopiAdminDriveDocument(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/sopi/admin/source-status") return sopiAdminSourceStatus(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/v1/sopi/admin/image") return sopiAdminImage(request, env, requestId);
  if (request.method === "GET" && url.pathname === "/v1/ba/payments/midtrans/status") return midtransAssetPaymentStatus(url, env, requestId);
  if (request.method !== "GET") return apiError(405, "METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", requestId);
  if (url.pathname === "/v1/meta/schema") return schemaMeta(env, requestId);
  if (url.pathname === "/v1/sync/status") return masterSyncStatus(env, requestId);
  if (url.pathname === "/v1/migrate/stock-movements/status") return stockMovementMigrationStatus(env, requestId);
  if (url.pathname === "/v1/staff-performance/migrate/status") return staffPerformanceMigrationStatus(url, env, requestId);
  if (url.pathname === "/v1/staff-performance/bootstrap") return staffPerformanceBootstrap(url, env, requestId);
  if (url.pathname === "/v1/staff-performance/leaderboard") return staffPerformanceLeaderboard(url, env, requestId);
  if (url.pathname === "/v1/staff-performance/daily-stats") return staffPerformanceDailyStats(url, env, requestId);
  if (url.pathname === "/v1/staff-performance/data") return staffPerformanceData(url, env, requestId);
  if (url.pathname === "/v1/sopi/status") return sopiStatus(env, requestId);
  if (url.pathname === "/v1/sopi/admin/bootstrap") return sopiAdminBootstrap(env, requestId);
  if (url.pathname === "/v1/sopi/document") return sopiDocument(url, env, requestId);
  if (url.pathname === "/v1/sopi/file-link") return sopiFileLink(url, env, requestId);
  if (url.pathname === "/v1/sopi/file") return sopiFile(url, env, requestId);
  if (url.pathname === "/v1/ba/approval-config") return getBaApprovalConfig(env, requestId);
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
  baReusableObjectKey,
  buildCurrentShowcaseSummary,
  buildShowcaseSummary,
  index_default as default,
  normalizeMidtransStatus,
  normalizeMovement,
  normalizeTransferEvent,
  sopiFallbackAnswer,
  sopiContentDisposition,
  sopiConversationFallback,
  sopiDriveTitle,
  sopiMarkdownText,
  sopiSafeFileName,
  sopiSearchTerms,
  verifyMidtransSignature
};
//# sourceMappingURL=index.js.map
