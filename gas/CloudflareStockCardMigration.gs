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
  throw new Error('Migrasi BigQuery telah dihentikan. Gunakan ekspor data yang sudah tersedia untuk impor Cloudflare.');
}

function cloudflareReadStockCardPage_(state) {
  throw new Error('Migrasi BigQuery telah dihentikan. Gunakan ekspor data yang sudah tersedia untuk impor Cloudflare.');
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
