/**
 * Resumable, idempotent migration of stock_card_v2 to Cloudflare D1 history.
 *
 * The source remains authoritative during migration. No BigQuery rows are changed
 * or deleted. A BigQuery query job is created once per partition date, then its
 * result pages are copied in batches. Checkpoints are saved only after Cloudflare
 * confirms a batch, so retries are safe.
 */
var CLOUDFLARE_STOCK_CARD_MIGRATION_STATE_KEY = 'CF_STOCK_CARD_MIGRATION_STATE_V1';
var CLOUDFLARE_STOCK_CARD_MIGRATION_HANDLER = 'continueCloudflareStockCardMigration';
var CLOUDFLARE_STOCK_CARD_BATCH_SIZE = 500;
var CLOUDFLARE_STOCK_CARD_RUN_LIMIT_MS = 240000;

function startCloudflareStockCardMigration() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Proses migrasi sedang berjalan. Coba lagi sesaat lagi.');
  try {
    var bounds = cloudflareStockCardDateBounds_();
    var state = {
      status: 'RUNNING',
      currentDate: bounds.minDate,
      maxDate: bounds.maxDate,
      sourceRows: bounds.rowCount,
      copiedRows: 0,
      batches: 0,
      jobId: '',
      pageToken: '',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: ''
    };
    cloudflareSaveStockCardState_(state);
    cloudflareEnsureStockCardTrigger_();
  } finally {
    lock.releaseLock();
  }
  return continueCloudflareStockCardMigration();
}

function continueCloudflareStockCardMigration() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { skipped: true, reason: 'already-running' };
  var started = Date.now();
  try {
    var state = cloudflareLoadStockCardState_();
    if (!state || state.status === 'COMPLETED' || state.status === 'PAUSED') {
      if (state && state.status === 'COMPLETED') cloudflareDeleteStockCardTriggers_();
      return state || { status: 'NOT_STARTED' };
    }
    state.status = 'RUNNING';
    state.lastError = '';

    while (Date.now() - started < CLOUDFLARE_STOCK_CARD_RUN_LIMIT_MS) {
      if (state.currentDate > state.maxDate) {
        state.status = 'COMPLETED';
        state.completedAt = new Date().toISOString();
        cloudflareSaveStockCardState_(state);
        cloudflareDeleteStockCardTriggers_();
        console.log(JSON.stringify({ event: 'CLOUDFLARE_STOCK_CARD_MIGRATION_COMPLETED', state: state }));
        return state;
      }

      var page = cloudflareReadStockCardPage_(state);
      if (page.rows.length) {
        cloudflareSendStockCardBatch_(state, page.rows);
        state.copiedRows += page.rows.length;
        state.batches += 1;
      }

      if (page.nextPageToken) {
        state.jobId = page.jobId;
        state.pageToken = page.nextPageToken;
      } else {
        state.currentDate = cloudflareNextIsoDate_(state.currentDate);
        state.jobId = '';
        state.pageToken = '';
      }
      state.updatedAt = new Date().toISOString();
      cloudflareSaveStockCardState_(state);
    }
    cloudflareEnsureStockCardTrigger_();
    return state;
  } catch (error) {
    var failed = cloudflareLoadStockCardState_() || {};
    failed.status = 'ERROR';
    failed.lastError = String(error && error.message ? error.message : error).slice(0, 1000);
    failed.updatedAt = new Date().toISOString();
    cloudflareSaveStockCardState_(failed);
    cloudflareEnsureStockCardTrigger_();
    console.error(JSON.stringify({ event: 'CLOUDFLARE_STOCK_CARD_MIGRATION_FAILED', state: failed }));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function getCloudflareStockCardMigrationStatus() {
  return cloudflareLoadStockCardState_() || { status: 'NOT_STARTED' };
}

function retryCloudflareStockCardMigration() {
  var state = cloudflareLoadStockCardState_();
  if (!state) throw new Error('Migrasi belum pernah dimulai. Jalankan startCloudflareStockCardMigration.');
  state.status = 'RUNNING';
  state.lastError = '';
  cloudflareSaveStockCardState_(state);
  cloudflareEnsureStockCardTrigger_();
  return continueCloudflareStockCardMigration();
}

function stopCloudflareStockCardMigration() {
  var state = cloudflareLoadStockCardState_() || {};
  state.status = 'PAUSED';
  state.updatedAt = new Date().toISOString();
  cloudflareSaveStockCardState_(state);
  cloudflareDeleteStockCardTriggers_();
  return state;
}

function cloudflareStockCardDateBounds_() {
  var sql = 'SELECT CAST(MIN(event_date) AS STRING) min_date, ' +
    'CAST(MAX(event_date) AS STRING) max_date, COUNT(*) row_count ' +
    'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card_v2` ' +
    "WHERE event_date >= DATE '2026-01-01' AND event_date < DATE '2027-01-01'";
  var result = BigQuery.Jobs.query({
    query: sql, useLegacySql: false, location: CONFIG.BQ_LOCATION, maxResults: 1
  }, CONFIG.BQ_PROJECT_ID);
  var jobId = result.jobReference.jobId;
  while (!result.jobComplete) {
    Utilities.sleep(500);
    result = BigQuery.Jobs.getQueryResults(CONFIG.BQ_PROJECT_ID, jobId, {
      location: CONFIG.BQ_LOCATION, maxResults: 1
    });
  }
  if (!result.rows || !result.rows.length || !result.rows[0].f[0].v) {
    throw new Error('Tidak ada data stock_card_v2 tahun 2026 untuk dimigrasikan.');
  }
  return {
    minDate: String(result.rows[0].f[0].v),
    maxDate: String(result.rows[0].f[1].v),
    rowCount: Number(result.rows[0].f[2].v || 0)
  };
}

function cloudflareReadStockCardPage_(state) {
  var result;
  var jobId = String(state.jobId || '');
  if (!jobId) {
    var sql = 'SELECT record_id, logical_id, version, record_type, outlet, location, ' +
      'item_code, category, item_name, unit, direction, qty, movement_type, info, ' +
      'CAST(event_date AS STRING) event_date, CAST(source_arrival_date AS STRING) arrival_date, ' +
      'CAST(production_date AS STRING) production_date, CAST(expiry_date AS STRING) expiry_date, ' +
      'supplier, transfer_id, source_file, source_hash, source_row, created_by, ' +
      "FORMAT_TIMESTAMP('%FT%T%Ez', created_at) created_at " +
      'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card_v2` ' +
      "WHERE event_date = DATE '" + state.currentDate + "' ORDER BY record_id";
    result = BigQuery.Jobs.query({
      query: sql,
      useLegacySql: false,
      location: CONFIG.BQ_LOCATION,
      maxResults: CLOUDFLARE_STOCK_CARD_BATCH_SIZE,
      useQueryCache: true
    }, CONFIG.BQ_PROJECT_ID);
    jobId = result.jobReference.jobId;
    while (!result.jobComplete) {
      Utilities.sleep(500);
      result = BigQuery.Jobs.getQueryResults(CONFIG.BQ_PROJECT_ID, jobId, {
        location: CONFIG.BQ_LOCATION,
        maxResults: CLOUDFLARE_STOCK_CARD_BATCH_SIZE
      });
    }
  } else {
    result = BigQuery.Jobs.getQueryResults(CONFIG.BQ_PROJECT_ID, jobId, {
      location: CONFIG.BQ_LOCATION,
      maxResults: CLOUDFLARE_STOCK_CARD_BATCH_SIZE,
      pageToken: state.pageToken
    });
  }
  return {
    jobId: jobId,
    nextPageToken: String(result.pageToken || ''),
    rows: (result.rows || []).map(cloudflareMapStockCardRow_)
  };
}

function cloudflareMapStockCardRow_(row) {
  var f = row.f;
  function value(index) { return f[index] && f[index].v !== null ? f[index].v : ''; }
  return {
    recordId: value(0), logicalId: value(1), version: Number(value(2) || 1),
    recordType: value(3) || 'MOVEMENT', outletCode: value(4), locationCode: value(5),
    itemCode: value(6), category: value(7), itemName: value(8), unit: value(9),
    direction: value(10) || 'NONE', quantity: Number(value(11) || 0),
    movementType: value(12) || 'UNKNOWN', info: value(13), eventDate: value(14),
    arrivalDate: value(15), productionDate: value(16), expiryDate: value(17),
    supplier: value(18), transferId: value(19), sourceFile: value(20),
    sourceHash: value(21), sourceRow: value(22) === '' ? null : Number(value(22)),
    createdBy: value(23) || 'BIGQUERY_MIGRATION', createdAt: value(24)
  };
}

function cloudflareSendStockCardBatch_(state, rows) {
  var properties = PropertiesService.getScriptProperties();
  var url = String(properties.getProperty('CLOUDFLARE_INVENTORY_URL') ||
    'https://bakerzin-inventory-api.operational-bi.workers.dev').replace(/\/+$/, '');
  var apiKey = String(properties.getProperty('CLOUDFLARE_INVENTORY_API_KEY') || '').trim();
  if (!apiKey) throw new Error('CLOUDFLARE_INVENTORY_API_KEY belum tersedia.');
  var response = UrlFetchApp.fetch(url + '/v1/migrate/stock-movements', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey },
    payload: JSON.stringify({
      batchId: 'SC-' + state.currentDate + '-' + Utilities.getUuid(),
      checkpoint: { eventDate: state.currentDate, pageToken: state.pageToken || '' },
      rows: rows
    }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('Batch riwayat gagal (' + response.getResponseCode() + '): ' +
      response.getContentText().slice(0, 700));
  }
}

function cloudflareNextIsoDate_(isoDate) {
  var parts = isoDate.split('-').map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}

function cloudflareLoadStockCardState_() {
  var raw = PropertiesService.getScriptProperties().getProperty(CLOUDFLARE_STOCK_CARD_MIGRATION_STATE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function cloudflareSaveStockCardState_(state) {
  PropertiesService.getScriptProperties().setProperty(
    CLOUDFLARE_STOCK_CARD_MIGRATION_STATE_KEY,
    JSON.stringify(state)
  );
}

function cloudflareEnsureStockCardTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === CLOUDFLARE_STOCK_CARD_MIGRATION_HANDLER;
  });
  if (!exists) {
    ScriptApp.newTrigger(CLOUDFLARE_STOCK_CARD_MIGRATION_HANDLER).timeBased().everyMinutes(5).create();
  }
}

function cloudflareDeleteStockCardTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === CLOUDFLARE_STOCK_CARD_MIGRATION_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
