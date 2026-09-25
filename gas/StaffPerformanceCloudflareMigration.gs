/**
 * One-time migration for the legacy Daily Staff Performance Apps Script.
 *
 * Paste this file into the ORIGINAL Staff Performance Apps Script project,
 * enable the Advanced BigQuery service, set CLOUDFLARE_INVENTORY_API_KEY in
 * Script Properties, then run startStaffPerformanceCloudflareMigration().
 * Runtime application code must not call these migration functions.
 */
const STAFF_PERFORMANCE_MIGRATION = Object.freeze({
  PROJECT_ID: 'berita-acara-digital',
  DATASET_ID: 'staff_performance_db',
  TABLE_ID: 'Data_Performance',
  LOCATION: 'asia-southeast1',
  CONFIG_SHEET_ID: '19A_QtC62JP6uQcCkQu0yUKTV60kuy2MfXIXKz7aVDSU',
  WORKER_URL: 'https://bakerzin-inventory-api.operational-bi.workers.dev',
  BATCH_SIZE: 300,
  STATE_KEY: 'STAFF_PERFORMANCE_CF_MIGRATION_STATE',
  TRIGGER_HANDLER: 'continueStaffPerformanceCloudflareMigration'
});

function startStaffPerformanceCloudflareMigration() {
  deleteStaffPerformanceMigrationTriggers_();
  const sourceTable = '`' + STAFF_PERFORMANCE_MIGRATION.PROJECT_ID + '.' +
    STAFF_PERFORMANCE_MIGRATION.DATASET_ID + '.' + STAFF_PERFORMANCE_MIGRATION.TABLE_ID + '`';
  const totalRows = Number(runStaffPerformanceMigrationQuery_(
    'SELECT COUNT(*) AS total FROM (SELECT ID_Transaksi FROM ' + sourceTable +
      ' QUALIFY ROW_NUMBER() OVER (PARTITION BY ID_Transaksi ORDER BY Skor_Final DESC) = 1)'
  )[0].total || 0);
  const state = {
    jobId: 'staff-performance-' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + '-' + Utilities.getUuid().slice(0, 8),
    status: 'STARTING',
    offset: 0,
    totalRows: totalRows,
    masterMigrated: false,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastError: ''
  };
  saveStaffPerformanceMigrationState_(state);
  continueStaffPerformanceCloudflareMigration();
  return checkStaffPerformanceCloudflareMigrationProgress();
}

function continueStaffPerformanceCloudflareMigration() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return checkStaffPerformanceCloudflareMigrationProgress();
  try {
    const state = readStaffPerformanceMigrationState_();
    if (!state || !state.jobId) throw new Error('Migrasi belum dimulai. Jalankan startStaffPerformanceCloudflareMigration().');
    if (state.status === 'COMPLETED') return checkStaffPerformanceCloudflareMigrationProgress();
    state.status = 'PROCESSING';
    state.lastError = '';
    saveStaffPerformanceMigrationState_(state);

    if (!state.masterMigrated) {
      migrateStaffPerformanceMaster_(state);
      state.masterMigrated = true;
      state.updatedAt = new Date().toISOString();
      saveStaffPerformanceMigrationState_(state);
    }

    const started = Date.now();
    while (state.offset < state.totalRows && Date.now() - started < 240000) {
      const rows = readStaffPerformanceScoreBatch_(state.offset, STAFF_PERFORMANCE_MIGRATION.BATCH_SIZE);
      if (!rows.length) throw new Error('BigQuery mengembalikan batch kosong sebelum checkpoint selesai. Offset: ' + state.offset);
      const checkpoint = state.offset + rows.length;
      staffPerformanceMigrationRequest_('POST', '/v1/staff-performance/migrate/scores', {
        jobId: state.jobId,
        batchId: 'scores-' + state.offset + '-' + checkpoint,
        totalRows: state.totalRows,
        checkpoint: checkpoint,
        rows: rows
      });
      state.offset = checkpoint;
      state.updatedAt = new Date().toISOString();
      saveStaffPerformanceMigrationState_(state);
    }

    if (state.offset >= state.totalRows) {
      if (state.totalRows === 0) {
        staffPerformanceMigrationRequest_('POST', '/v1/staff-performance/migrate/scores', {
          jobId: state.jobId, batchId: 'scores-empty', totalRows: 0, checkpoint: 0, rows: []
        });
      }
      state.status = 'COMPLETED';
      state.completedAt = new Date().toISOString();
      state.updatedAt = state.completedAt;
      saveStaffPerformanceMigrationState_(state);
      deleteStaffPerformanceMigrationTriggers_();
    } else {
      scheduleStaffPerformanceMigrationContinuation_();
    }
    return checkStaffPerformanceCloudflareMigrationProgress();
  } catch (error) {
    const state = readStaffPerformanceMigrationState_() || {};
    state.status = 'ERROR';
    state.lastError = String(error && error.message || error);
    state.updatedAt = new Date().toISOString();
    saveStaffPerformanceMigrationState_(state);
    deleteStaffPerformanceMigrationTriggers_();
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function checkStaffPerformanceCloudflareMigrationProgress() {
  const state = readStaffPerformanceMigrationState_();
  if (!state || !state.jobId) {
    const empty = { status: 'NOT_STARTED', message: 'Jalankan startStaffPerformanceCloudflareMigration().' };
    Logger.log(JSON.stringify(empty, null, 2));
    return empty;
  }
  let cloudflare = null;
  try {
    cloudflare = staffPerformanceMigrationRequest_('GET', '/v1/staff-performance/migrate/status?job_id=' + encodeURIComponent(state.jobId));
  } catch (error) {
    cloudflare = { ok: false, error: String(error && error.message || error) };
  }
  const total = Number(state.totalRows || 0), processed = Number(state.offset || 0);
  const result = {
    jobId: state.jobId,
    status: state.status,
    progressPercent: total ? Math.min(100, Math.round(processed * 10000 / total) / 100) : (state.status === 'COMPLETED' ? 100 : 0),
    processedRows: processed,
    totalRows: total,
    masterMigrated: Boolean(state.masterMigrated),
    startedAt: state.startedAt || '',
    updatedAt: state.updatedAt || '',
    completedAt: state.completedAt || '',
    lastError: state.lastError || '',
    cloudflare: cloudflare && cloudflare.data ? cloudflare.data : cloudflare
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function retryStaffPerformanceCloudflareMigration() {
  const state = readStaffPerformanceMigrationState_();
  if (!state || !state.jobId) throw new Error('Migrasi belum pernah dimulai.');
  state.status = 'PROCESSING';
  state.lastError = '';
  state.updatedAt = new Date().toISOString();
  saveStaffPerformanceMigrationState_(state);
  return continueStaffPerformanceCloudflareMigration();
}

function migrateStaffPerformanceMaster_(state) {
  const source = SpreadsheetApp.getActiveSpreadsheet();
  const staffSheet = source.getSheetByName('Data_Staff');
  const indicatorSheet = source.getSheetByName('Config_Indicators');
  if (!staffSheet || !indicatorSheet) throw new Error('Sheet Data_Staff atau Config_Indicators tidak ditemukan. Jalankan dari project Staff Performance lama.');

  const staff = staffPerformanceRows_(staffSheet).map(function (row) {
    return { nik: text_(row[0]), name: text_(row[1]), position: text_(row[2]), outletCode: text_(row[3]).toUpperCase(), status: text_(row[4]) || 'Active' };
  }).filter(function (row) { return row.nik && row.name && row.position && row.outletCode; });

  const indicators = staffPerformanceRows_(indicatorSheet).map(function (row) {
    return {
      indicatorId: text_(row[0]), outletCode: text_(row[1]).toUpperCase(), category: text_(row[2]) || 'General',
      indicatorName: text_(row[3]), weight: row[4], target: text_(row[5]), thresholdA: text_(row[6]),
      thresholdB: text_(row[7]), thresholdC: text_(row[8]), thresholdD: text_(row[9]), status: text_(row[10]) || 'Active'
    };
  }).filter(function (row) { return row.indicatorId && row.indicatorName; });

  const configSheet = SpreadsheetApp.openById(STAFF_PERFORMANCE_MIGRATION.CONFIG_SHEET_ID).getSheetByName('Config_Outlets');
  if (!configSheet) throw new Error('Config_Outlets tidak ditemukan.');
  const outlets = staffPerformanceRows_(configSheet).map(function (row) {
    return { outletCode: text_(row[0]).toUpperCase(), outletName: text_(row[1]) || text_(row[0]), role: text_(row[2]) || 'OUTLET', active: true };
  }).filter(function (row) { return row.outletCode; });

  staffPerformanceMigrationRequest_('POST', '/v1/staff-performance/migrate/master', {
    jobId: state.jobId, batchId: 'master-v1', totalRows: state.totalRows,
    outlets: outlets, staff: staff, indicators: indicators
  });
}

function readStaffPerformanceScoreBatch_(offset, limit) {
  const table = '`' + STAFF_PERFORMANCE_MIGRATION.PROJECT_ID + '.' + STAFF_PERFORMANCE_MIGRATION.DATASET_ID + '.' + STAFF_PERFORMANCE_MIGRATION.TABLE_ID + '`';
  const sql = 'SELECT ID_Transaksi, Tanggal, NIK, ID_Indikator, Pencapaian, Skor_Final, Note FROM ' + table +
    ' QUALIFY ROW_NUMBER() OVER (PARTITION BY ID_Transaksi ORDER BY Skor_Final DESC) = 1' +
    ' ORDER BY Tanggal, ID_Transaksi, NIK, ID_Indikator LIMIT ' + Number(limit) + ' OFFSET ' + Number(offset);
  return runStaffPerformanceMigrationQuery_(sql).map(function (row) {
    return {
      transactionId: text_(row.ID_Transaksi), scoreDate: dateText_(row.Tanggal), nik: text_(row.NIK),
      indicatorId: text_(row.ID_Indikator), achievement: text_(row.Pencapaian),
      finalScore: Number(row.Skor_Final || 0), note: text_(row.Note)
    };
  });
}

function runStaffPerformanceMigrationQuery_(sql) {
  let result = BigQuery.Jobs.query({ query: sql, useLegacySql: false, location: STAFF_PERFORMANCE_MIGRATION.LOCATION, useQueryCache: false }, STAFF_PERFORMANCE_MIGRATION.PROJECT_ID);
  const jobId = result.jobReference.jobId;
  let waitMs = 500;
  while (!result.jobComplete) {
    Utilities.sleep(waitMs);
    waitMs = Math.min(waitMs * 2, 5000);
    result = BigQuery.Jobs.getQueryResults(STAFF_PERFORMANCE_MIGRATION.PROJECT_ID, jobId, { location: STAFF_PERFORMANCE_MIGRATION.LOCATION });
  }
  const fields = result.schema && result.schema.fields || [];
  return (result.rows || []).map(function (row) {
    const object = {};
    row.f.forEach(function (cell, index) { object[fields[index].name] = cell.v; });
    return object;
  });
}

function staffPerformanceMigrationRequest_(method, path, payload) {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = text_(properties.getProperty('CLOUDFLARE_INVENTORY_API_KEY'));
  const baseUrl = text_(properties.getProperty('CLOUDFLARE_INVENTORY_URL') || STAFF_PERFORMANCE_MIGRATION.WORKER_URL).replace(/\/+$/, '');
  if (!apiKey) throw new Error('Script Property CLOUDFLARE_INVENTORY_API_KEY belum diisi.');
  const options = { method: String(method || 'GET').toLowerCase(), headers: { 'x-api-key': apiKey }, muteHttpExceptions: true };
  if (payload !== undefined) { options.contentType = 'application/json'; options.payload = JSON.stringify(payload); }
  const response = UrlFetchApp.fetch(baseUrl + path, options);
  const status = response.getResponseCode();
  let body = {};
  try { body = JSON.parse(response.getContentText() || '{}'); } catch (ignore) {}
  if (status < 200 || status >= 300 || body.ok !== true) {
    const message = body && body.error && (body.error.message || body.error.code) || ('HTTP ' + status);
    throw new Error('Cloudflare migration gagal: ' + message + (body.requestId ? ' (Ref: ' + body.requestId + ')' : ''));
  }
  return body;
}

function staffPerformanceRows_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

function text_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function dateText_(value) {
  if (value && typeof value === 'object' && value.value) value = value.value;
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
  return text_(value).slice(0, 10);
}

function readStaffPerformanceMigrationState_() {
  const raw = PropertiesService.getScriptProperties().getProperty(STAFF_PERFORMANCE_MIGRATION.STATE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveStaffPerformanceMigrationState_(state) {
  PropertiesService.getScriptProperties().setProperty(STAFF_PERFORMANCE_MIGRATION.STATE_KEY, JSON.stringify(state));
}

function scheduleStaffPerformanceMigrationContinuation_() {
  deleteStaffPerformanceMigrationTriggers_();
  ScriptApp.newTrigger(STAFF_PERFORMANCE_MIGRATION.TRIGGER_HANDLER).timeBased().after(60 * 1000).create();
}

function deleteStaffPerformanceMigrationTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === STAFF_PERFORMANCE_MIGRATION.TRIGGER_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
}
