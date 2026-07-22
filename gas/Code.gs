/**
 * BAKERZIN INTERNAL HUB — Google Apps Script backend
 *
 * Persiapan sekali saja:
 * 1. Pastikan akun yang menjalankan Web App memiliki akses Edit ke spreadsheet.
 * 2. Untuk fitur form, aktifkan Advanced Google Service: BigQuery API.
 * 3. Deploy > New deployment > Web app.
 *    Execute as: Me | Who has access: sesuai kebijakan internal perusahaan.
 */

const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1PktH42uGDx64B4ZU4_UMYPnZWomNlXu5WYoIfpndrDw',
  EMP_SHEET: 'EMP_LIST',
  NEWS_SHEET: 'APP_NEWS',
  TASK_SHEET: 'APP_TASKS',
  STORE_CODE_SHEET: 'STORE CODE',
  STOCK_MASTER_SHEET: 'STOCK_ITEMS',
  STOCK_LOCATION_SHEET: 'STOCK_LOCATIONS',
  STOCK_CONVERSION_SHEET: 'STOCK_UNIT_CONVERSIONS',
  BQ_PROJECT_ID: 'berita-acara-digital',
  BQ_DATASET_ID: 'bakerzin_internal',
  BQ_LOCATION: 'asia-southeast2',
  SESSION_TTL_SECONDS: 21600,
  PASSWORD_MIN_LENGTH: 8,
  APP_TITLE: 'Bakerzin Internal Hub'
});

function doGet(e) {
  const requestedForm = normalizeHtmlFile_(e && e.parameter && e.parameter.form);
  if (requestedForm && isRegisteredFormFile_(requestedForm)) {
    try {
      const formTemplate = HtmlService.createTemplateFromFile(requestedForm);
      formTemplate.taskId = String((e.parameter && e.parameter.task) || '');
      formTemplate.formFile = requestedForm;
      return formTemplate.evaluate()
        .setTitle(CONFIG.APP_TITLE + ' — ' + requestedForm)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
    } catch (error) {
      return HtmlService.createHtmlOutput(
        '<div style="font:16px Arial;padding:40px;color:#172338">' +
        '<h2>Form belum dipasang</h2><p>File HTML <b>' + requestedForm +
        '</b> sudah terdaftar, tetapi belum tersedia di project GAS.</p><a href="?">Kembali ke Dashboard</a></div>'
      ).setTitle('Form belum tersedia');
    }
  }
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialRoute = '';
  return template.evaluate()
    .setTitle(CONFIG.APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Gateway JSON untuk antarmuka GitHub Pages. */
function doPost(e) {
  let request = {};
  try {
    const raw = e && e.parameter && e.parameter.payload || e && e.postData && e.postData.contents || '{}';
    request = JSON.parse(String(raw));
    const actions = apiActions_();
    const action = String(request.action || '');
    if (!Object.prototype.hasOwnProperty.call(actions, action)) {
      return htmlBridgeOutput_(request.requestId, { ok: false, error: 'Aksi API tidak diizinkan: ' + action });
    }
    const args = Array.isArray(request.args) ? request.args : [];
    return htmlBridgeOutput_(request.requestId, actions[action].apply(null, args));
  } catch (error) {
    return htmlBridgeOutput_(request.requestId, { ok: false, error: error && error.message ? error.message : String(error) });
  }
}

function apiActions_() {
  return Object.freeze({
    getPublicBootstrap: getPublicBootstrap,
    checkNik: checkNik,
    activateAccount: activateAccount,
    login: login,
    resumeSession: resumeSession,
    logout: logout,
    getAppData: getAppData,
    markTaskComplete: markTaskComplete,
    adminAddNews: adminAddNews,
    adminAddItem: adminAddItem,
    bootstrap: getStockCardBootstrap,
    data: getStockCardData,
    supplementary: getStockCardSupplementary,
    addLocation: addStockLocation,
    save: saveStockMovement,
    edit: updateStockMovement,
    adjust: adjustStockBalance,
    history: getStockHistory,
    verifyUsage: previewSalesUsageUpload,
    saveConversions: saveStockUnitConversions,
    getConversions: getStockUnitConversions,
    transferOptions: getStockTransferOptions,
    transferLocal: transferStockWithinOutlet,
    transferOutlet: createInterOutletStockTransfer,
    pendingTransfers: getPendingStockTransfers,
    acceptTransfer: acceptInterOutletStockTransfer,
    uploadUsage: uploadSalesUsage,
    exportCurrent: exportCurrentStockExcel,
    exportItem: exportStockCardItem,
    complete: markTaskComplete
  });
}

function htmlBridgeOutput_(requestId, response) {
  const message = JSON.stringify({
    bakerzinApi: true,
    requestId: String(requestId || ''),
    response: response
  }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><script>parent.postMessage(' + message + ',"*");<\/script>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Run once from the Apps Script editor after replacing appsscript.json. */
function authorizeProjectServices() {
  SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getName();
  DriveApp.getRootFolder().getName();
  BigQuery.Datasets.get(CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID);
  return true;
}

/** Public data; deliberately excludes employee records. */
function getPublicBootstrap() {
  return safe_(function () {
    return {
      appTitle: CONFIG.APP_TITLE,
      news: readNews_(true),
      passwordMinLength: CONFIG.PASSWORD_MIN_LENGTH
    };
  });
}

/** Step 1: check NIK and decide whether password creation or login is needed. */
function checkNik(nik) {
  return safe_(function () {
    const employee = findEmployee_(normalizeNik_(nik));
    assertEmployeeActive_(employee);
    return {
      nik: employee.nik,
      name: employee.name,
      outlet: employee.outlet,
      needsPassword: !employee.password
    };
  });
}

/** First activation. Lock prevents two simultaneous password writes. */
function activateAccount(nik, password, confirmPassword) {
  return safe_(function () {
    nik = normalizeNik_(nik);
    validateNewPassword_(password, confirmPassword);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const employee = findEmployee_(nik);
      assertEmployeeActive_(employee);
      if (employee.password) throw new Error('Akun ini sudah memiliki password. Silakan login.');
      employee.sheet.getRange(employee.row, 12).setValue(hashPassword_(password));
      SpreadsheetApp.flush();
      return createSession_(employee);
    } finally {
      lock.releaseLock();
    }
  });
}

function login(nik, password) {
  return safe_(function () {
    nik = normalizeNik_(nik);
    assertNotRateLimited_(nik);
    const employee = findEmployee_(nik);
    assertEmployeeActive_(employee);
    if (!employee.password) throw new Error('Akun belum diaktivasi. Buat password terlebih dahulu.');
    if (!verifyPassword_(password, employee.password)) {
      recordLoginFailure_(nik);
      throw new Error('Password tidak sesuai.');
    }
    clearLoginFailures_(nik);

    // Migrates a legacy plain-text password after a successful validation.
    if (String(employee.password).indexOf('v1$') !== 0) {
      employee.sheet.getRange(employee.row, 12).setValue(hashPassword_(password));
    }
    return createSession_(employee);
  });
}

function resumeSession(token) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    return sessionPayload_(employee, token);
  });
}

function logout(token) {
  return safe_(function () {
    if (token) CacheService.getScriptCache().remove(sessionKey_(token));
    return { loggedOut: true };
  });
}

function getAppData(token) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    return {
      user: userView_(employee),
      tasks: readTasksForEmployee_(employee),
      completions: readCompletionMap_(employee.outlet),
      news: readNews_(false),
      appUrl: ScriptApp.getService().getUrl()
    };
  });
}

function markTaskComplete(token, taskId, requestedOutlet) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    const task = findTask_(taskId);
    if (!task || !task.active || !taskApplies_(task, employee)) throw new Error('Task tidak ditemukan atau bukan untuk akun ini.');

    ensureBigQueryInfrastructure_();
    const allowedOutlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const completionOutlet = resolveStockOutlet_(employee, requestedOutlet || employee.outlet, allowedOutlets);
    const periodKey = currentPeriodKey_(task.frequency);
    if (readCompletionMap_(completionOutlet)[task.id + '|' + periodKey]) {
      return { taskId: task.id, periodKey: periodKey, outlet: completionOutlet, completed: true, alreadyCompleted: true };
    }
    insertAll_('task_completions', [{
      insertId: Utilities.getUuid(),
      json: {
        completion_id: Utilities.getUuid(),
        task_id: task.id,
        nik: employee.nik,
        outlet: completionOutlet,
        period_key: periodKey,
        completed_at: new Date().toISOString(),
        source: task.type
      }
    }]);
    return { taskId: task.id, periodKey: periodKey, outlet: completionOutlet, completed: true };
  });
}

/** Admin: create login-page news. */
function adminAddNews(token, payload) {
  return safe_(function () {
    const employee = requireAdmin_(token);
    payload = payload || {};
    const title = cleanText_(payload.title, 120);
    const content = cleanText_(payload.content, 1000);
    if (!title || !content) throw new Error('Judul dan isi berita wajib diisi.');

    const sheet = ensureSheet_(CONFIG.NEWS_SHEET,
      ['ID', 'TITLE', 'CONTENT', 'IMAGE_URL', 'LINK_URL', 'PUBLISHED_AT', 'ACTIVE', 'CREATED_BY']);
    sheet.appendRow([
      Utilities.getUuid(), title, content,
      safeUrl_(payload.imageUrl), safeUrl_(payload.linkUrl),
      new Date(), true, employee.nik
    ]);
    return { news: readNews_(false) };
  });
}

/**
 * Admin: registers a link or an independently developed HTML form.
 * BigQuery is created only when the first FORM is registered, as requested.
 */
function adminAddItem(token, payload) {
  return safe_(function () {
    const employee = requireAdmin_(token);
    payload = payload || {};
    const type = String(payload.type || '').toUpperCase();
    const frequency = String(payload.frequency || '').toUpperCase();
    if (['LINK', 'FORM'].indexOf(type) < 0) throw new Error('Tipe harus LINK atau FORM.');
    if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].indexOf(frequency) < 0) throw new Error('Periode tidak valid.');

    const title = cleanText_(payload.title, 140);
    if (!title) throw new Error('Nama task/form wajib diisi.');
    const target = type === 'LINK'
      ? safeUrl_(payload.target)
      : normalizeHtmlFile_(payload.target);
    if (!target) throw new Error(type === 'LINK' ? 'URL wajib diisi.' : 'Nama file HTML wajib diisi.');

    if (type === 'FORM') {
      ensureBigQueryInfrastructure_();
      if (target === 'StockCard') ensureStockCardInfrastructure_();
    }

    const sheet = ensureSheet_(CONFIG.TASK_SHEET,
      ['ID', 'TITLE', 'DESCRIPTION', 'TYPE', 'TARGET', 'FREQUENCY', 'AUDIENCE', 'DUE_LABEL', 'ACTIVE', 'CREATED_AT', 'CREATED_BY']);
    sheet.appendRow([
      Utilities.getUuid(), title, cleanText_(payload.description, 500), type, target,
      frequency, cleanAudience_(payload.audience), cleanText_(payload.dueLabel, 80),
      true, new Date(), employee.nik
    ]);
    return { tasks: readTasksForEmployee_(employee) };
  });
}

/** Generic save endpoint for separate HTML forms created later. */
function saveFormResponse(token, taskId, responseObject) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    const task = findTask_(taskId);
    if (!task || task.type !== 'FORM' || !taskApplies_(task, employee)) throw new Error('Form tidak valid untuk akun ini.');
    const serialized = JSON.stringify(responseObject || {});
    if (serialized.length > 900000) throw new Error('Data form terlalu besar.');

    ensureBigQueryInfrastructure_();
    const now = new Date().toISOString();
    insertAll_('form_responses', [{
      insertId: Utilities.getUuid(),
      json: {
        response_id: Utilities.getUuid(), task_id: task.id, form_file: task.target,
        nik: employee.nik, outlet: employee.outlet, period_key: currentPeriodKey_(task.frequency),
        submitted_at: now, response_json: serialized
      }
    }]);
    insertAll_('task_completions', [{
      insertId: Utilities.getUuid(),
      json: {
        completion_id: Utilities.getUuid(), task_id: task.id, nik: employee.nik,
        outlet: employee.outlet, period_key: currentPeriodKey_(task.frequency),
        completed_at: now, source: 'FORM'
      }
    }]);
    return { saved: true, taskId: task.id };
  });
}

// ---------- Stock Card form ----------

function getStockCardBootstrap(token, requestedOutlet) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const outlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, outlets);
    const locations = readStockLocations_(outlet);
    const stockTask = readTasksForEmployee_(employee).filter(function (task) {
      return task.type === 'FORM' && task.target === 'StockCard' && task.frequency === 'DAILY';
    })[0] || null;
    return {
      user: userView_(employee),
      outlets: outlets,
      selectedOutlet: outlet,
      locations: locations,
      selectedLocation: locations[0] || 'Store',
      items: readStockItemsWithQty_(outlet, locations[0] || 'Store'),
      taskTable: CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card',
      appUrl: ScriptApp.getService().getUrl(),
      taskId: stockTask ? stockTask.id : '',
      taskCompleted: false,
      supplementaryPending: true
    };
  });
}

function getStockCardData(token, requestedOutlet, location) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const outlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, outlets);
    location = normalizeLocation_(location);
    const locations = readStockLocations_(outlet);
    if (locations.indexOf(location) < 0) throw new Error('Lokasi penyimpanan tidak ditemukan untuk outlet ini.');
    return {
      outlet: outlet, location: location, locations: locations, items: readStockItemsWithQty_(outlet, location),
      taskCompleted: null, supplementaryPending: true
    };
  });
}

function getStockCardSupplementary(token, requestedOutlet, taskId) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const allowed = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, allowed);
    taskId = cleanText_(taskId, 100);
    return {
      outlet: outlet,
      taskCompleted: taskId ? Boolean(readCompletionMap_(outlet)[taskId + '|' + currentPeriodKey_('DAILY')]) : false,
      pendingTransfers: readPendingStockTransfers_(outlet)
    };
  });
}

function addStockLocation(token, requestedOutlet, locationName) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const outlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, outlets);
    const location = normalizeLocation_(locationName);
    if (!location || location.length < 2) throw new Error('Nama penyimpanan minimal 2 karakter.');
    const existing = readStockLocations_(outlet);
    if (existing.map(function (v) { return v.toLowerCase(); }).indexOf(location.toLowerCase()) >= 0) {
      throw new Error('Penyimpanan tersebut sudah tersedia.');
    }
    const locationSheet = ensureSheet_(CONFIG.STOCK_LOCATION_SHEET, ['OUTLET', 'LOCATION', 'ACTIVE', 'CREATED_BY', 'CREATED_AT']);
    locationSheet.appendRow([outlet, location, true, employee.nik, new Date()]);
    return { outlet: outlet, location: location, locations: existing.concat([location]) };
  });
}

function getStockUnitConversions(token) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    const rows = readStockUnitConversions_();
    return Object.keys(rows).sort().map(function (key) {
      const row = rows[key];
      return {
        key: key, itemCode: row.itemCode, itemName: row.itemName,
        defaultUnit: row.toUnit, conversionUnit: row.fromUnit,
        defaultToConversion: 1 / row.factor, conversionToDefault: row.factor
      };
    });
  });
}

function getStockTransferOptions(token, requestedOutlet, sourceLocation) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const allowed = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, allowed);
    const locations = readStockLocations_(outlet);
    sourceLocation = normalizeLocation_(sourceLocation) || locations[0];
    if (locations.indexOf(sourceLocation) < 0) throw new Error('Lokasi sumber tidak valid.');
    const allOutlets = readActiveOutlets_();
    const outletLocations = {};
    allOutlets.forEach(function (code) { outletLocations[code] = readStockLocations_(code); });
    return {
      outlet: outlet, sourceLocation: sourceLocation, locations: locations,
      outlets: allOutlets, outletLocations: outletLocations,
      items: readStockItemsWithQty_(outlet, sourceLocation).filter(function (item) { return Number(item.qty) > 0.0000001; })
    };
  });
}

function transferStockWithinOutlet(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const allowed = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, payload.outlet, allowed);
    const fromLocation = normalizeLocation_(payload.fromLocation);
    const toLocation = normalizeLocation_(payload.toLocation);
    const locations = readStockLocations_(outlet);
    if (locations.indexOf(fromLocation) < 0 || locations.indexOf(toLocation) < 0) throw new Error('Lokasi transfer tidak valid.');
    if (fromLocation.toLowerCase() === toLocation.toLowerCase()) throw new Error('Lokasi asal dan tujuan transfer tidak boleh sama.');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const lines = validateTransferLines_(outlet, fromLocation, payload.items);
      const transferId = Utilities.getUuid(), now = new Date(), eventDate = todayIso_(), rows = [];
      lines.forEach(function (line) {
        allocateTransferLots_(outlet, fromLocation, line.item, line.qty).forEach(function (lot) {
          rows.push(stockTransferMovementRow_(transferId, outlet, fromLocation, line.item, 'OUT', lot.qty, 'Transfer Out', line.note, lot.expiryDate, employee, now, eventDate));
          rows.push(stockTransferMovementRow_(transferId, outlet, toLocation, line.item, 'IN', lot.qty, 'Transfer In', line.note, lot.expiryDate, employee, now, eventDate));
        });
      });
      insertAll_('stock_card', rows);
      return { transferred: true, transferId: transferId, outlet: outlet, fromLocation: fromLocation, toLocation: toLocation, itemCount: lines.length };
    } finally { lock.releaseLock(); }
  });
}

function createInterOutletStockTransfer(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const allowed = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const fromOutlet = resolveStockOutlet_(employee, payload.fromOutlet, allowed);
    const toOutlet = String(payload.toOutlet || '').trim().toUpperCase();
    const activeOutlets = readActiveOutlets_();
    if (activeOutlets.indexOf(toOutlet) < 0) throw new Error('Outlet tujuan tidak aktif atau tidak terdaftar.');
    if (fromOutlet === toOutlet) throw new Error('Outlet asal dan tujuan transfer tidak boleh sama.');
    const fromLocation = normalizeLocation_(payload.fromLocation);
    if (readStockLocations_(fromOutlet).indexOf(fromLocation) < 0) throw new Error('Lokasi sumber tidak valid.');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const lines = validateTransferLines_(fromOutlet, fromLocation, payload.items);
      const transferId = Utilities.getUuid(), now = new Date(), eventDate = todayIso_(), stockRows = [], pendingRows = [];
      lines.forEach(function (line) {
        allocateTransferLots_(fromOutlet, fromLocation, line.item, line.qty).forEach(function (lot) {
          stockRows.push(stockTransferMovementRow_(transferId, fromOutlet, fromLocation, line.item, 'OUT', lot.qty, 'Transfer Out', 'Ke ' + toOutlet + ' · ' + line.note, lot.expiryDate, employee, now, eventDate));
          const eventId = Utilities.getUuid();
          pendingRows.push({ insertId: eventId, json: {
            event_id: eventId, transfer_id: transferId, status: 'PENDING', from_outlet: fromOutlet, from_location: fromLocation,
            to_outlet: toOutlet, to_location: null, item_code: line.item.code, category: line.item.category,
            item_name: line.item.name, unit: line.item.unit, qty: lot.qty, note: line.note, expiry_date: lot.expiryDate || null,
            created_by: employee.nik, created_by_name: employee.name, created_at: now.getTime() / 1000
          }});
        });
      });
      insertAll_('stock_card', stockRows);
      insertAll_('stock_transfers', pendingRows);
      return { sent: true, transferId: transferId, fromOutlet: fromOutlet, toOutlet: toOutlet, itemCount: lines.length };
    } finally { lock.releaseLock(); }
  });
}

function getPendingStockTransfers(token, requestedOutlet) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const allowed = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, allowed);
    return readPendingStockTransfers_(outlet);
  });
}

function acceptInterOutletStockTransfer(token, transferId, requestedOutlet, receiveLocation) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const allowed = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, allowed);
    transferId = cleanText_(transferId, 100);
    receiveLocation = normalizeLocation_(receiveLocation);
    if (readStockLocations_(outlet).indexOf(receiveLocation) < 0) throw new Error('Pilih lokasi penerimaan yang valid.');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const transfers = readPendingStockTransfers_(outlet).filter(function (transfer) { return transfer.transferId === transferId; });
      if (!transfers.length) throw new Error('Transfer sudah diterima atau tidak ditemukan untuk outlet ini.');
      const transfer = transfers[0], now = new Date(), eventDate = todayIso_();
      const existsSql = 'SELECT COUNT(*) AS total FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` WHERE transfer_id = @transferId AND direction = \'IN\'';
      const existing = runNamedQuery_(existsSql, { transferId: transferId });
      if (!existing.length || Number(existing[0].total || 0) === 0) {
        const rows = transfer.items.map(function (line) {
          const item = { code: line.code, category: line.category, name: line.name, unit: line.unit };
          return stockTransferMovementRow_(transferId, outlet, receiveLocation, item, 'IN', line.qty, 'Transfer In', 'Dari ' + transfer.fromOutlet + ' · ' + line.note, line.expiryDate, employee, now, eventDate);
        });
        insertAll_('stock_card', rows);
      }
      const eventId = Utilities.getUuid();
      insertAll_('stock_transfers', [{ insertId: eventId, json: {
        event_id: eventId, transfer_id: transferId, status: 'ACCEPTED', from_outlet: transfer.fromOutlet, from_location: transfer.fromLocation,
        to_outlet: outlet, to_location: receiveLocation, created_by: transfer.createdBy, created_by_name: transfer.createdByName,
        created_at: now.getTime() / 1000, accepted_by: employee.nik, accepted_at: now.getTime() / 1000
      }}]);
      return { accepted: true, transferId: transferId, itemCount: transfer.items.length, location: receiveLocation };
    } finally { lock.releaseLock(); }
  });
}

function saveStockMovement(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const outlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, payload.outlet, outlets);
    const location = normalizeLocation_(payload.location);
    if (readStockLocations_(outlet).indexOf(location) < 0) throw new Error('Lokasi penyimpanan tidak valid.');

    const item = findStockMasterItem_(payload.itemCode || payload.itemName);
    const direction = String(payload.direction || '').toUpperCase();
    const movementType = cleanText_(payload.movementType, 60);
    const qty = Number(payload.qty);
    const expiryDate = normalizeDate_(payload.expiryDate, false);
    if (['IN', 'OUT'].indexOf(direction) < 0) throw new Error('Arah transaksi tidak valid.');
    if (!isFinite(qty) || qty <= 0) throw new Error('QTY harus lebih besar dari 0.');
    validateMovementType_(direction, movementType);

    const current = getCurrentStock_(outlet, location, item.code, item.name);
    if (movementType === 'Opening Stock' && Math.abs(current.qty) > 0.0000001) {
      throw new Error('Input stok awal hanya tersedia ketika Current QTY masih 0.');
    }
    if (direction === 'OUT' && qty > current.qty && movementType !== 'Terjual') {
      throw new Error('Stok tidak mencukupi. Current QTY: ' + formatQty_(current.qty));
    }

    const now = new Date();
    const eventDate = normalizeDate_(payload.eventDate, true);
    const info = cleanText_(payload.info, 300);
    const logicalId = Utilities.getUuid();
    const recordId = Utilities.getUuid();
    insertAll_('stock_card', [{ insertId: recordId, json: {
      record_id: recordId, logical_id: logicalId, version: 1, record_type: 'MOVEMENT', outlet: outlet, location: location,
      item_code: item.code, category: item.category, item_name: item.name, unit: item.unit, direction: direction, qty: qty,
      movement_type: movementType, info: info, expiry_date: expiryDate || null,
      event_date: eventDate, created_at: now.getTime() / 1000, created_by: employee.nik
    }}]);
    const nextQty = direction === 'IN' ? current.qty + qty : current.qty - qty;
    return {
      saved: true, outlet: outlet, location: location, itemCode: item.code, itemName: item.name, currentQty: nextQty,
      movement: { recordId: recordId, logicalId: logicalId, version: 1, date: eventDate, direction: direction, qty: qty, movementType: movementType, info: info, expiryDate: expiryDate, createdBy: employee.nik, createdByUser: employee.name + ' · ' + employee.nik, createdAt: now.toISOString() }
    };
  });
}

function updateStockMovement(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const outlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, payload.outlet, outlets);
    const location = normalizeLocation_(payload.location);
    if (readStockLocations_(outlet).indexOf(location) < 0) throw new Error('Lokasi penyimpanan tidak valid.');
    const item = findStockMasterItem_(payload.itemCode || payload.itemName);
    const logicalId = cleanText_(payload.logicalId, 100);
    if (!logicalId) throw new Error('Transaksi yang akan diedit tidak ditemukan. Muat ulang Stock Card lalu coba lagi.');

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const previousRows = readLatestStockHistory_(outlet, location, item, logicalId);
      if (!previousRows.length) throw new Error('Transaksi tidak ditemukan atau sudah berubah. Muat ulang Stock Card lalu coba lagi.');
      const previous = previousRows[0];
      let direction = String(payload.direction || '').toUpperCase();
      let movementType = cleanText_(payload.movementType, 60);
      const qty = Number(payload.qty);
      if (previous.movementType === 'Opening Stock') {
        direction = 'IN';
        movementType = 'Opening Stock';
      }
      if (['IN', 'OUT'].indexOf(direction) < 0) throw new Error('Arah transaksi tidak valid.');
      if (!isFinite(qty) || qty <= 0) throw new Error('QTY harus lebih besar dari 0.');
      validateMovementType_(direction, movementType);

      const current = getCurrentStock_(outlet, location, item.code, item.name);
      const previousEffect = previous.direction === 'IN' ? previous.qty : -previous.qty;
      const nextEffect = direction === 'IN' ? qty : -qty;
      const nextQty = current.qty - previousEffect + nextEffect;
      if (nextQty < -0.0000001 && movementType !== 'Terjual') throw new Error('Perubahan ini membuat stok menjadi minus. Current QTY setelah transaksi lain: ' + formatQty_(current.qty));

      const now = new Date();
      const recordId = Utilities.getUuid();
      const version = Number(previous.version || 1) + 1;
      const eventDate = normalizeDate_(payload.eventDate, true);
      const expiryDate = normalizeDate_(payload.expiryDate, false);
      if (movementType === 'Stock Adjustment' && !expiryDate) throw new Error('Expiry Date wajib diisi untuk Stock Adjustment Masuk maupun Keluar.');
      const info = cleanText_(payload.info, 300);
      insertAll_('stock_card', [{ insertId: recordId, json: {
        record_id: recordId, logical_id: logicalId, version: version, record_type: 'MOVEMENT', outlet: outlet, location: location,
        item_code: item.code, category: item.category, item_name: item.name, unit: item.unit, direction: direction, qty: qty,
        movement_type: movementType, info: info, expiry_date: expiryDate || null,
        event_date: eventDate, created_at: now.getTime() / 1000, created_by: employee.nik
      }}]);
      return {
        saved: true, edited: true, outlet: outlet, location: location, itemCode: item.code, itemName: item.name, currentQty: nextQty,
        movement: { recordId: recordId, logicalId: logicalId, version: version, date: eventDate, direction: direction, qty: qty, movementType: movementType, info: info, expiryDate: expiryDate, createdBy: employee.nik, createdByUser: employee.name + ' · ' + employee.nik, createdAt: now.toISOString() }
      };
    } finally {
      lock.releaseLock();
    }
  });
}

function adjustStockBalance(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const item = findStockMasterItem_(payload.itemCode || payload.itemName);
    const targetQty = Number(payload.targetQty);
    const info = cleanText_(payload.info, 300);
    const expiryDate = normalizeDate_(payload.expiryDate, false);
    if (!isFinite(targetQty) || targetQty < 0) throw new Error('Hasil stock fisik harus 0 atau lebih.');
    if (info.length < 3) throw new Error('Catatan penyesuaian wajib diisi agar perubahan dapat diaudit.');
    if (!expiryDate) throw new Error('Expiry Date wajib diisi untuk Stock Adjustment Masuk maupun Keluar.');

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const current = getCurrentStock_(context.outlet, context.location, item.code, item.name);
      if (Math.abs(targetQty - current.qty) < 0.0000001) {
        throw new Error('Hasil stock fisik sama dengan Current QTY; tidak ada penyesuaian yang perlu dicatat.');
      }
      const direction = targetQty > current.qty ? 'IN' : 'OUT';
      const adjustmentQty = Math.abs(targetQty - current.qty);
      const now = new Date();
      const logicalId = Utilities.getUuid();
      const recordId = Utilities.getUuid();
      const eventDate = normalizeDate_(payload.eventDate, true);
      insertAll_('stock_card', [{ insertId: recordId, json: {
        record_id: recordId, logical_id: logicalId, version: 1, record_type: 'MOVEMENT',
        outlet: context.outlet, location: context.location, item_code: item.code, category: item.category,
        item_name: item.name, unit: item.unit, direction: direction, qty: adjustmentQty,
        movement_type: 'Stock Adjustment', info: info, expiry_date: expiryDate, event_date: eventDate,
        created_at: now.getTime() / 1000, created_by: context.employee.nik
      }}]);
      return {
        saved: true, adjusted: true, itemCode: item.code, currentQty: targetQty,
        movement: {
          recordId: recordId, logicalId: logicalId, version: 1, date: eventDate, direction: direction, qty: adjustmentQty,
          movementType: 'Stock Adjustment', info: info, expiryDate: expiryDate, createdBy: context.employee.nik,
          createdByUser: context.employee.name + ' · ' + context.employee.nik, createdAt: now.toISOString()
        }
      };
    } finally {
      lock.releaseLock();
    }
  });
}

/**
 * Reads and validates an ESB Sales Material Usage Report before the user can
 * press Upload. The file is parsed in memory; it is never stored in Drive.
 */
function previewSalesUsageUpload(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const prepared = prepareSalesUsageImport_(context, payload, true);
    if (prepared.requiresConversion) {
      return {
        verified: false, requiresConversion: true, fileName: prepared.fileName,
        outlet: prepared.outlet, outletName: prepared.outletName, location: context.location,
        transactionDate: prepared.transactionDate, itemCount: prepared.sourceItemCount,
        zeroRowsSkipped: prepared.zeroRowsSkipped, newItemCount: prepared.newItemCount,
        conversions: prepared.conversionRequests
      };
    }
    return {
      verified: true,
      fileName: prepared.fileName,
      outlet: prepared.outlet,
      outletName: prepared.outletName,
      location: context.location,
      transactionDate: prepared.transactionDate,
      itemCount: prepared.items.length,
      zeroRowsSkipped: prepared.zeroRowsSkipped,
      newItemCount: prepared.newItemCount,
      negativeItemCount: prepared.negativeItemCount,
      conversionCount: prepared.conversionCount
    };
  });
}

/** Saves verified unit factors so the same ESB/master pair is reused later. */
function saveStockUnitConversions(token, payload) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    payload = payload || {};
    const conversions = Array.isArray(payload.conversions) ? payload.conversions : [];
    if (!conversions.length) throw new Error('Belum ada data konversi unit yang dapat disimpan.');

    const normalized = conversions.map(function (entry) {
      const itemCode = cleanText_(entry.itemCode, 80).toUpperCase();
      const itemName = cleanText_(entry.itemName, 180);
      const fromUnit = normalizeUnit_(entry.fromUnit);
      const toUnit = normalizeUnit_(entry.toUnit);
      const factor = Number(entry.factor);
      if (!itemCode || !itemName || !fromUnit || !toUnit) throw new Error('Kode, nama item, dan pasangan unit wajib dilengkapi.');
      if (fromUnit === toUnit) throw new Error(itemCode + ' · ' + itemName + ': unit asal dan unit tujuan tidak boleh sama.');
      if (!isFinite(factor) || factor <= 0) throw new Error(itemCode + ' · ' + itemName + ': faktor konversi wajib lebih besar dari 0.');
      return { key: stockConversionKey_(itemCode, fromUnit, toUnit), itemCode: itemCode, itemName: itemName, fromUnit: fromUnit, toUnit: toUnit, factor: factor };
    });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sheet = ensureStockConversionSheet_();
      const existing = {};
      if (sheet.getLastRow() >= 2) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues().forEach(function (row, index) {
          const key = stockConversionKey_(row[0], row[2], row[3]);
          if (key) existing[key] = index + 2;
        });
      }
      const now = new Date(), additions = [];
      normalized.forEach(function (entry) {
        const values = [entry.itemCode, entry.itemName, entry.fromUnit, entry.toUnit, entry.factor, true, employee.nik, now];
        if (existing[entry.key]) sheet.getRange(existing[entry.key], 1, 1, 8).setValues([values]);
        else additions.push(values);
      });
      if (additions.length) sheet.getRange(sheet.getLastRow() + 1, 1, additions.length, 8).setValues(additions);
      SpreadsheetApp.flush();
      return { saved: true, count: normalized.length, sheetName: CONFIG.STOCK_CONVERSION_SHEET };
    } finally {
      lock.releaseLock();
    }
  });
}

/** Imports a verified ESB usage report as append-only Terjual movements. */
function uploadSalesUsage(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // Repeat every verification on the server immediately before writing.
      const prepared = prepareSalesUsageImport_(context, payload, false);
      appendOrActivateStockMasterItems_(prepared.masterChanges);
      const now = new Date();
      const rows = prepared.items.map(function (usage) {
        const logicalId = Utilities.getUuid();
        const recordId = Utilities.getUuid();
        return { insertId: recordId, json: {
          record_id: recordId, logical_id: logicalId, version: 1, record_type: 'MOVEMENT',
          outlet: context.outlet, location: context.location, item_code: usage.item.code,
          category: usage.item.category, item_name: usage.item.name, unit: usage.item.unit,
          direction: 'OUT', qty: usage.qty, movement_type: 'Terjual',
          info: cleanText_('ESB Usage Penjualan · ' + prepared.fileName + ' · Baris ' + usage.sourceRow +
            (usage.converted ? ' · Konversi ' + formatQty_(usage.originalQty) + ' ' + usage.originalUnit + ' = ' + formatQty_(usage.qty) + ' ' + usage.item.unit : ''), 500),
          expiry_date: null, event_date: prepared.transactionDate,
          created_at: now.getTime() / 1000, created_by: context.employee.nik,
          source_file: prepared.fileName, source_hash: prepared.sourceHash, source_row: usage.sourceRow
        }};
      });
      // One request keeps one report together and avoids a retry leaving a half-imported file.
      insertAll_('stock_card', rows);
      return {
        uploaded: true, outlet: context.outlet, location: context.location,
        transactionDate: prepared.transactionDate, itemCount: rows.length,
        zeroRowsSkipped: prepared.zeroRowsSkipped, newItemCount: prepared.newItemCount,
        negativeItemCount: prepared.negativeItemCount, conversionCount: prepared.conversionCount
      };
    } finally {
      lock.releaseLock();
    }
  });
}

function prepareSalesUsageImport_(context, payload, allowPendingConversions) {
  const fileName = cleanText_(payload.fileName, 180);
  const base64 = String(payload.base64 || '').replace(/^data:[^,]+,/, '').trim();
  const report = parseSalesUsageReport_(base64, fileName);
  const outletMap = readStoreCodeMap_();
  const outletKey = normalizeStoreName_(report.outletName);
  const reportOutlet = outletMap[outletKey] || '';
  if (!reportOutlet) {
    throw new Error('Outlet "' + report.outletName + '" pada cell B6 belum terdaftar di sheet STORE CODE.');
  }
  if (reportOutlet !== context.outlet) {
    throw new Error('File ini milik ' + report.outletName + ' (' + reportOutlet + '), bukan outlet yang sedang dipilih (' + context.outlet + ').');
  }

  const sourceHash = digest_(base64);
  if (salesUsageAlreadyImported_(context.outlet, report.transactionDate, sourceHash)) {
    throw new Error('Usage Penjualan tanggal ' + report.transactionDate + ' sudah pernah di-upload untuk outlet ' + context.outlet + '.');
  }

  const master = readStockMaster_(true);
  const masterMap = {};
  master.forEach(function (item) { masterMap[item.code.toUpperCase()] = item; });
  const currentMap = readCurrentStockCodeQtyMap_(context.outlet, context.location);
  const providedConversions = payload.conversions && typeof payload.conversions === 'object' ? payload.conversions : {};
  const savedConversions = readStockUnitConversions_();
  const conversionMap = {}, conversionRequests = [], usageTotals = {}, items = [], masterChangeMap = {};
  report.rows.forEach(function (row) {
    let item = masterMap[row.code];
    if (!item) {
      item = { code: row.code, category: row.category || 'Uncategorized', name: row.name || row.code, unit: row.unit, active: false };
      masterMap[row.code] = item;
      masterChangeMap[row.code] = item;
    } else if (!item.active) {
      masterChangeMap[row.code] = item;
    }
    const esbUnit = normalizeUnit_(row.unit), masterUnit = normalizeUnit_(item.unit);
    let factor = 1, converted = false;
    if (masterUnit !== esbUnit) {
      converted = true;
      const conversionKey = stockConversionKey_(row.code, esbUnit, masterUnit);
      if (!conversionMap[conversionKey]) {
        conversionMap[conversionKey] = {
          key: conversionKey, itemCode: row.code, itemName: item.name,
          fromUnit: row.unit || '-', toUnit: item.unit || '-'
        };
        conversionRequests.push(conversionMap[conversionKey]);
      }
      factor = Number(providedConversions[conversionKey]);
      if ((!isFinite(factor) || factor <= 0) && savedConversions[conversionKey]) factor = Number(savedConversions[conversionKey].factor);
      if (!isFinite(factor) || factor <= 0) factor = 0;
    }
    if (converted && !factor) return;
    const convertedQty = converted ? convertSalesUsageQty_(row.qty, factor) : row.qty;
    usageTotals[row.code] = Number(usageTotals[row.code] || 0) + convertedQty;
    items.push({ item: item, qty: convertedQty, originalQty: row.qty, originalUnit: row.unit, converted: converted, conversionFactor: factor, sourceRow: row.sourceRow });
  });
  const missingConversions = conversionRequests.filter(function (request) {
    const factor = Number(providedConversions[request.key]);
    const savedFactor = savedConversions[request.key] && Number(savedConversions[request.key].factor);
    return (!isFinite(factor) || factor <= 0) && (!isFinite(savedFactor) || savedFactor <= 0);
  });
  const baseResult = {
    fileName: fileName, sourceHash: sourceHash, outlet: reportOutlet, outletName: report.outletName,
    transactionDate: report.transactionDate, zeroRowsSkipped: report.zeroRowsSkipped,
    sourceItemCount: report.rows.length, newItemCount: Object.keys(masterChangeMap).length
  };
  if (missingConversions.length) {
    if (!allowPendingConversions) throw new Error('Lengkapi seluruh konversi unit sebelum melanjutkan upload.');
    baseResult.requiresConversion = true;
    baseResult.conversionRequests = missingConversions;
    return baseResult;
  }
  let negativeItemCount = 0;
  Object.keys(usageTotals).forEach(function (code) {
    const available = Number(currentMap[code] || 0), required = Number(usageTotals[code] || 0);
    if (available - required < -0.0000001) negativeItemCount++;
  });
  if (!items.length) throw new Error('Tidak ada QTY penjualan lebih dari 0 pada file ini.');
  baseResult.requiresConversion = false;
  baseResult.items = items;
  baseResult.masterChanges = Object.keys(masterChangeMap).map(function (code) { return masterChangeMap[code]; });
  baseResult.negativeItemCount = negativeItemCount;
  baseResult.conversionCount = conversionRequests.length;
  return baseResult;
}

function appendOrActivateStockMasterItems_(items) {
  if (!items || !items.length) return;
  const sheet = ensureStockMasterSheet_();
  const existing = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(function (row, index) {
      const code = String(row[0] || '').trim().toUpperCase();
      if (code) existing[code] = index + 2;
    });
  }
  const additions = [];
  items.forEach(function (item) {
    const row = existing[item.code];
    if (row) sheet.getRange(row, 5).setValue(true);
    else additions.push([item.code, item.category || 'Uncategorized', item.name || item.code, item.unit || '', true]);
  });
  if (additions.length) sheet.getRange(sheet.getLastRow() + 1, 1, additions.length, 5).setValues(additions);
  SpreadsheetApp.flush();
}

function convertSalesUsageQty_(qty, factor) {
  qty = Number(qty);
  factor = Number(factor);
  if (!isFinite(qty) || qty < 0 || !isFinite(factor) || factor <= 0) throw new Error('Faktor konversi unit tidak valid.');
  const result = qty * factor;
  if (!isFinite(result) || result <= 0) throw new Error('Hasil konversi QTY tidak valid.');
  return result;
}

function parseSalesUsageReport_(base64, fileName) {
  if (!/\.xlsx$/i.test(fileName || '')) throw new Error('Pilih file Excel ESB dengan format .xlsx.');
  if (!base64) throw new Error('Data file tidak ditemukan. Pilih kembali file Usage Penjualan.');
  let bytes;
  try { bytes = Utilities.base64Decode(base64); }
  catch (error) { throw new Error('File tidak dapat dibaca. Pastikan file berasal dari ESB dan berformat .xlsx.'); }
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('Ukuran file harus lebih dari 0 dan maksimal 5 MB.');
  if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error('File bukan workbook Excel .xlsx yang valid.');
  let files;
  try {
    // Apps Script Utilities.unzip validates the Blob MIME/name. XLSX is a ZIP
    // container, so present it as an actual ZIP package instead of Excel MIME.
    files = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', 'usage-report.zip'));
  } catch (error) {
    const detail = cleanText_(error && error.message ? error.message : String(error || ''), 180);
    throw new Error('File terdeteksi sebagai .xlsx, tetapi paket internal Excel gagal dibuka (tahap 1/4, kode XLSX-01). ' +
      'Penyebab yang mungkin: download belum selesai, file berubah setelah diunduh, atau file bukan hasil langsung dari ESB.' +
      (detail ? ' Detail server: ' + detail + '.' : '') + ' Download ulang dari ESB lalu upload file tanpa membukanya atau menyimpan ulang.');
  }
  const fileMap = {}, worksheetNames = [];
  let expandedSize = 0;
  files.forEach(function (file) {
    const name = String(file.getName() || '').replace(/^\/+/, '');
    const fileBytes = file.getBytes();
    expandedSize += fileBytes.length;
    if (expandedSize > 25 * 1024 * 1024) throw new Error('Isi workbook terlalu besar untuk diproses.');
    fileMap[name] = file;
    if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) worksheetNames.push(name);
  });
  worksheetNames.sort();
  if (!worksheetNames.length) throw new Error('Paket Excel berhasil dibuka, tetapi worksheet report tidak ditemukan (tahap 2/4, kode XLSX-02). Pastikan menu ESB yang dipilih adalah Sales Material Usage Report.');
  const sharedStrings = fileMap['xl/sharedStrings.xml'] ? parseSharedStringsXml_(fileMap['xl/sharedStrings.xml'].getDataAsString('UTF-8')) : [];
  const cells = parseWorksheetCellsXml_(fileMap[worksheetNames[0]].getDataAsString('UTF-8'), sharedStrings);
  if (normalizeHeader_(cells.B10) !== 'PRODUCT' || normalizeHeader_(cells.C10) !== 'PRODUCT CODE' || normalizeHeader_(cells.E10) !== 'UNIT' || normalizeHeader_(cells.F10) !== 'QTY') {
    throw new Error('Worksheet ditemukan, tetapi format report tidak sesuai (tahap 3/4, kode XLSX-03). ' +
      'Baris 10 seharusnya berisi B10=Product, C10=Product Code, E10=Unit, F10=Qty. ' +
      'File ini berisi B10=' + (cleanText_(cells.B10, 40) || 'kosong') + ', C10=' + (cleanText_(cells.C10, 40) || 'kosong') +
      ', E10=' + (cleanText_(cells.E10, 40) || 'kosong') + ', F10=' + (cleanText_(cells.F10, 40) || 'kosong') + '.');
  }
  const outletName = cleanText_(cells.B6, 160);
  if (!outletName) throw new Error('Cell B6 (Branch/Outlet) kosong.');
  const transactionDate = parseSingleEsbPeriod_(cells.B5);
  const rowNumbers = Object.keys(cells).map(function (address) {
    const match = /^C(\d+)$/.exec(address);
    return match ? Number(match[1]) : 0;
  }).filter(function (row) { return row >= 11; }).sort(function (a, b) { return a - b; });
  if (rowNumbers.length > 5000) throw new Error('Jumlah baris report melebihi batas 5.000 item.');
  const rows = [], seenRows = {}, invalidQty = [];
  let zeroRowsSkipped = 0;
  rowNumbers.forEach(function (rowNumber) {
    if (seenRows[rowNumber]) return;
    seenRows[rowNumber] = true;
    const code = String(cells['C' + rowNumber] || '').trim().toUpperCase();
    if (!code) return;
    const rawQty = String(cells['F' + rowNumber] == null ? '' : cells['F' + rowNumber]).trim();
    const qty = Number(rawQty.indexOf(',') >= 0 && rawQty.indexOf('.') < 0 ? rawQty.replace(',', '.') : rawQty);
    if (!isFinite(qty) || qty < 0) { invalidQty.push(code + ' baris ' + rowNumber); return; }
    if (qty <= 0.0000001) { zeroRowsSkipped++; return; }
    rows.push({
      sourceRow: rowNumber, code: code, name: cleanText_(cells['B' + rowNumber], 180),
      category: cleanText_(cells['D' + rowNumber], 100), unit: cleanText_(cells['E' + rowNumber], 30).toUpperCase(), qty: qty
    });
  });
  if (invalidQty.length) throw new Error('QTY tidak valid pada: ' + invalidQty.slice(0, 8).join(', ') + '.');
  return { outletName: outletName, transactionDate: transactionDate, rows: rows, zeroRowsSkipped: zeroRowsSkipped };
}

function parseSingleEsbPeriod_(value) {
  const match = /^\s*(\d{2})-(\d{2})-(\d{4})\s*-\s*(\d{2})-(\d{2})-(\d{4})\s*$/.exec(String(value || ''));
  if (!match) throw new Error('Cell B5 harus berformat satu periode tanggal, contoh 18-07-2026 - 18-07-2026.');
  const start = match[3] + '-' + match[2] + '-' + match[1];
  const end = match[6] + '-' + match[5] + '-' + match[4];
  normalizeDate_(start, false);
  normalizeDate_(end, false);
  const startDate = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  const endDate = new Date(Date.UTC(Number(match[6]), Number(match[5]) - 1, Number(match[4])));
  if (startDate.getUTCFullYear() !== Number(match[3]) || startDate.getUTCMonth() + 1 !== Number(match[2]) || startDate.getUTCDate() !== Number(match[1]) ||
      endDate.getUTCFullYear() !== Number(match[6]) || endDate.getUTCMonth() + 1 !== Number(match[5]) || endDate.getUTCDate() !== Number(match[4])) {
    throw new Error('Tanggal pada cell B5 tidak valid.');
  }
  if (start !== end) throw new Error('Periode pada cell B5 harus tepat satu tanggal. File ini berisi ' + String(value).trim() + '.');
  return start;
}

function parseSharedStringsXml_(xml) {
  const values = [];
  String(xml || '').replace(/<si\b[^>]*>([\s\S]*?)<\/si>/gi, function (_, body) {
    let value = '';
    body.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/gi, function (__, text) { value += decodeXmlText_(text); return ''; });
    values.push(value);
    return '';
  });
  return values;
}

function parseWorksheetCellsXml_(xml, sharedStrings) {
  const cells = {};
  String(xml || '').replace(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi, function (_, attrs, body) {
    const ref = /\br="([A-Z]+\d+)"/i.exec(attrs);
    if (!ref) return '';
    const typeMatch = /\bt="([^"]+)"/i.exec(attrs);
    const type = typeMatch ? typeMatch[1] : '';
    let value = '';
    if (type === 'inlineStr') {
      body.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/gi, function (__, text) { value += decodeXmlText_(text); return ''; });
    } else {
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body);
      if (raw) value = type === 's' ? (sharedStrings[Number(raw[1])] || '') : decodeXmlText_(raw[1]);
    }
    cells[ref[1].toUpperCase()] = value;
    return '';
  });
  return cells;
}

function decodeXmlText_(value) {
  return String(value || '').replace(/&#(x?[0-9a-f]+);|&(amp|lt|gt|quot|apos);/gi, function (match, numeric, named) {
    if (numeric) return String.fromCharCode(parseInt(numeric.replace(/^x/i, ''), /^x/i.test(numeric) ? 16 : 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[String(named).toLowerCase()] || match;
  });
}

function readStoreCodeMap_() {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.STORE_CODE_SHEET);
  if (!sheet || sheet.getLastRow() < 1) throw new Error('Sheet STORE CODE belum tersedia atau masih kosong. Isi nama outlet di kolom A dan kode outlet di kolom B.');
  const rows = sheet.getRange(1, 1, sheet.getLastRow(), 2).getDisplayValues();
  const map = {};
  rows.forEach(function (row) {
    const name = normalizeStoreName_(row[0]), code = String(row[1] || '').trim().toUpperCase();
    if (name && code) map[name] = code;
  });
  return map;
}

function salesUsageAlreadyImported_(outlet, transactionDate, sourceHash) {
  const sql = 'SELECT COUNT(*) AS total FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
    'WHERE record_type = \'MOVEMENT\' AND outlet = @outlet AND movement_type = \'Terjual\' AND source_file IS NOT NULL ' +
    'AND (source_hash = @sourceHash OR event_date = CAST(@transactionDate AS DATE))';
  const rows = runNamedQuery_(sql, { outlet: outlet, transactionDate: transactionDate, sourceHash: sourceHash });
  return rows.length && Number(rows[0].total || 0) > 0;
}

function normalizeStoreName_(value) { return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase(); }
function normalizeHeader_(value) { return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase(); }
function normalizeUnit_(value) { return String(value || '').trim().replace(/\s+/g, '').toUpperCase(); }

function getStockHistory(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const outlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, payload.outlet, outlets);
    const location = normalizeLocation_(payload.location);
    const item = findStockMasterItem_(payload.itemCode || payload.itemName);
    const rows = readLatestStockHistory_(outlet, location, item);
    const employeeNames = readEmployeeNameMap_();
    rows.forEach(function (row) { row.createdByUser = (employeeNames[row.createdBy] || row.createdBy || 'User tidak diketahui') + (employeeNames[row.createdBy] && row.createdBy ? ' · ' + row.createdBy : ''); });
    const current = getCurrentStock_(outlet, location, item.code, item.name);
    return {
      item: item, outlet: outlet, location: location, currentQty: current.qty,
      history: rows
    };
  });
}

function exportCurrentStockExcel(token, requestedOutlet, requestedLocation) {
  return safe_(function () {
    const context = resolveStockContext_(token, requestedOutlet, requestedLocation);
    const items = readStockItemsWithQty_(context.outlet, context.location).filter(function (item) { return Math.abs(Number(item.qty)) > 0.0000001; }).sort(function (a, b) {
      const aNegative = Number(a.qty) < 0, bNegative = Number(b.qty) < 0;
      if (aNegative !== bNegative) return aNegative ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    const title = 'Stok Saat Ini';
    const rows = items.map(function (item) { return [item.code, item.category, item.name, item.unit, Number(item.qty)]; });
    return buildStockExport_(title, context.outlet, context.location, '', ['Kode Item', 'Category', 'Nama Item', 'Unit', 'QTY'], rows, 'xlsx');
  });
}

function exportStockCardItem(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const item = findStockMasterItem_(payload.itemCode || payload.itemName);
    const month = String(payload.month || '').trim();
    const format = String(payload.format || '').toLowerCase();
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Pilih bulan laporan terlebih dahulu.');
    if (['xlsx', 'pdf'].indexOf(format) < 0) throw new Error('Format export tidak valid.');
    const history = readLatestStockHistory_(context.outlet, context.location, item);
    const employeeNames = readEmployeeNameMap_();
    history.forEach(function (row) { row.createdByUser = (employeeNames[row.createdBy] || row.createdBy || 'User tidak diketahui') + (employeeNames[row.createdBy] && row.createdBy ? ' · ' + row.createdBy : ''); });
    const current = getCurrentStock_(context.outlet, context.location, item.code, item.name);
    const fifoSnapshots = calculateFifoSnapshots_(history);
    const grouped = addBalancesToGroupedHistory_(groupStockHistoryByDate_(history), current.qty).filter(function (day) { return String(day.date).slice(0, 7) === month; });
    const rows = grouped.map(function (day) {
      return [day.date, day.inQty || '', stockMovementInfo_(day.inMovements), day.outQty || '', stockMovementInfo_(day.outMovements), day.balance, fifoDetailText_(fifoSnapshots[day.date] || [], item.unit)];
    });
    return buildStockExport_('Stock Card · ' + item.code + ' · ' + item.name, context.outlet, context.location, month, ['Tanggal', 'Masuk', 'Info Masuk', 'Keluar', 'Info Keluar', 'Balance', 'Detail Expired FIFO'], rows, format);
  });
}

function ensureStockCardInfrastructure_() {
  const infrastructureCache = CacheService.getScriptCache();
  if (infrastructureCache.get('stock-card-infrastructure-v4') === 'ready') return;
  ensureStockMasterSheet_();
  ensureSheet_(CONFIG.STOCK_LOCATION_SHEET, ['OUTLET', 'LOCATION', 'ACTIVE', 'CREATED_BY', 'CREATED_AT']);
  ensureStockConversionSheet_();
  try {
    BigQuery.Datasets.get(CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID);
  } catch (error) {
    if (!/not found|Not found|404/.test(String(error))) throw new Error('BigQuery belum dapat diakses. Aktifkan Advanced Service BigQuery API. Detail: ' + error.message);
    BigQuery.Datasets.insert({
      datasetReference: { projectId: CONFIG.BQ_PROJECT_ID, datasetId: CONFIG.BQ_DATASET_ID },
      location: CONFIG.BQ_LOCATION,
      description: 'Dataset general untuk seluruh form Bakerzin Internal Hub'
    }, CONFIG.BQ_PROJECT_ID);
  }
  ensureBigQueryTable_('stock_card', [
    bqField_('record_id', 'STRING', 'REQUIRED'), bqField_('record_type', 'STRING', 'REQUIRED'),
    bqField_('outlet', 'STRING', 'REQUIRED'), bqField_('location', 'STRING', 'REQUIRED'),
    bqField_('item_code', 'STRING'), bqField_('category', 'STRING'), bqField_('item_name', 'STRING'), bqField_('unit', 'STRING'),
    bqField_('logical_id', 'STRING'), bqField_('version', 'INTEGER'),
    bqField_('direction', 'STRING'), bqField_('qty', 'FLOAT'), bqField_('movement_type', 'STRING'),
    bqField_('info', 'STRING'), bqField_('expiry_date', 'DATE'), bqField_('event_date', 'DATE', 'REQUIRED'),
    bqField_('created_at', 'TIMESTAMP', 'REQUIRED'), bqField_('created_by', 'STRING', 'REQUIRED')
  ], 'created_at');
  ensureBigQueryFields_('stock_card', [
    bqField_('item_code', 'STRING'), bqField_('logical_id', 'STRING'), bqField_('version', 'INTEGER'),
    bqField_('source_file', 'STRING'), bqField_('source_hash', 'STRING'), bqField_('source_row', 'INTEGER'), bqField_('transfer_id', 'STRING')
  ]);
  ensureBigQueryTable_('stock_transfers', [
    bqField_('event_id', 'STRING', 'REQUIRED'), bqField_('transfer_id', 'STRING', 'REQUIRED'), bqField_('status', 'STRING', 'REQUIRED'),
    bqField_('from_outlet', 'STRING'), bqField_('from_location', 'STRING'), bqField_('to_outlet', 'STRING'), bqField_('to_location', 'STRING'),
    bqField_('item_code', 'STRING'), bqField_('category', 'STRING'), bqField_('item_name', 'STRING'), bqField_('unit', 'STRING'),
    bqField_('qty', 'FLOAT'), bqField_('note', 'STRING'), bqField_('expiry_date', 'DATE'),
    bqField_('created_by', 'STRING'), bqField_('created_by_name', 'STRING'), bqField_('created_at', 'TIMESTAMP', 'REQUIRED'),
    bqField_('accepted_by', 'STRING'), bqField_('accepted_at', 'TIMESTAMP')
  ], 'created_at');
  infrastructureCache.put('stock-card-infrastructure-v4', 'ready', 21600);
}

function validateTransferLines_(outlet, location, rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new Error('Tambahkan minimal satu item untuk ditransfer.');
  const master = {}, requested = {};
  readStockMaster_().forEach(function (item) { master[item.code] = item; });
  rawItems.forEach(function (raw) {
    const code = String(raw.itemCode || raw.code || '').trim().toUpperCase();
    const qty = Number(raw.qty);
    if (!master[code]) throw new Error('Item ' + code + ' tidak ditemukan atau tidak aktif.');
    if (!isFinite(qty) || qty <= 0) throw new Error(code + ' · ' + master[code].name + ': QTY transfer wajib lebih besar dari 0.');
    if (!requested[code]) requested[code] = { item: master[code], qty: 0, note: cleanText_(raw.note, 300) };
    requested[code].qty += qty;
    if (raw.note) requested[code].note = cleanText_(raw.note, 300);
  });
  const current = readCurrentStockCodeQtyMap_(outlet, location);
  return Object.keys(requested).map(function (code) {
    const line = requested[code], available = Number(current[code] || 0);
    if (available <= 0) throw new Error(code + ' · ' + line.item.name + ': stok 0 atau minus tidak dapat ditransfer.');
    if (line.qty > available + 0.0000001) throw new Error(code + ' · ' + line.item.name + ': QTY transfer ' + formatQty_(line.qty) + ' melebihi stok tersedia ' + formatQty_(available) + ' ' + line.item.unit + '.');
    return line;
  });
}

function allocateTransferLots_(outlet, location, item, qty) {
  const history = readLatestStockHistory_(outlet, location, item).slice().reverse();
  const snapshots = calculateFifoSnapshots_(history), dates = Object.keys(snapshots).sort();
  const lots = dates.length ? snapshots[dates[dates.length - 1]].map(function (lot) { return { qty: Number(lot.qty), expiryDate: lot.expiryDate || '' }; }) : [];
  let remaining = qty;
  const allocated = [];
  lots.forEach(function (lot) {
    if (remaining <= 0.0000001) return;
    const taken = Math.min(lot.qty, remaining);
    if (taken > 0.0000001) allocated.push({ qty: taken, expiryDate: lot.expiryDate });
    remaining -= taken;
  });
  if (remaining > 0.0000001) allocated.push({ qty: remaining, expiryDate: '' });
  return allocated;
}

function stockTransferMovementRow_(transferId, outlet, location, item, direction, qty, movementType, note, expiryDate, employee, now, eventDate) {
  const recordId = Utilities.getUuid();
  return { insertId: recordId, json: {
    record_id: recordId, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT', transfer_id: transferId,
    outlet: outlet, location: location, item_code: item.code, category: item.category, item_name: item.name, unit: item.unit,
    direction: direction, qty: qty, movement_type: movementType, info: cleanText_(note, 300), expiry_date: expiryDate || null,
    event_date: eventDate, created_at: now.getTime() / 1000, created_by: employee.nik
  }};
}

function readPendingStockTransfers_(outlet) {
  const sql = 'SELECT p.transfer_id, p.from_outlet, p.from_location, p.to_outlet, p.to_location, p.item_code, p.category, p.item_name, p.unit, p.qty, p.note, p.expiry_date, p.created_by, p.created_by_name, p.created_at ' +
    'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_transfers` p WHERE p.status = \'PENDING\' AND p.to_outlet = @outlet ' +
    'AND NOT EXISTS (SELECT 1 FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_transfers` a WHERE a.transfer_id = p.transfer_id AND a.status = \'ACCEPTED\') ORDER BY p.created_at DESC, p.item_name';
  const grouped = {};
  runNamedQuery_(sql, { outlet: outlet }).forEach(function (row) {
    const id = String(row.transfer_id || '');
    if (!grouped[id]) grouped[id] = {
      transferId: id, fromOutlet: String(row.from_outlet || ''), fromLocation: String(row.from_location || ''),
      toOutlet: String(row.to_outlet || ''), toLocation: String(row.to_location || ''), createdBy: String(row.created_by || ''),
      createdByName: String(row.created_by_name || row.created_by || ''), createdAt: String(row.created_at || ''), items: []
    };
    grouped[id].items.push({ code: String(row.item_code || ''), category: String(row.category || ''), name: String(row.item_name || ''), unit: String(row.unit || ''), qty: Number(row.qty || 0), note: String(row.note || ''), expiryDate: String(row.expiry_date || '') });
  });
  return Object.keys(grouped).map(function (id) { return grouped[id]; });
}

function ensureStockConversionSheet_() {
  return ensureSheet_(CONFIG.STOCK_CONVERSION_SHEET, ['ITEM_CODE', 'ITEM_NAME', 'FROM_UNIT', 'TO_UNIT', 'FACTOR', 'ACTIVE', 'UPDATED_BY', 'UPDATED_AT']);
}

function stockConversionKey_(itemCode, fromUnit, toUnit) {
  const code = String(itemCode || '').trim().toUpperCase();
  const from = normalizeUnit_(fromUnit);
  const to = normalizeUnit_(toUnit);
  return code && from && to ? code + '|' + from + '|' + to : '';
}

function readStockUnitConversions_() {
  const sheet = ensureStockConversionSheet_();
  if (sheet.getLastRow() < 2) return {};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  const map = {};
  rows.forEach(function (row) {
    const factor = Number(row[4]);
    const active = row[5] === '' || truthy_(row[5]);
    const key = stockConversionKey_(row[0], row[2], row[3]);
    if (key && active && isFinite(factor) && factor > 0) {
      map[key] = { itemCode: String(row[0] || '').trim().toUpperCase(), itemName: String(row[1] || '').trim(), fromUnit: normalizeUnit_(row[2]), toUnit: normalizeUnit_(row[3]), factor: factor };
    }
  });
  return map;
}

function ensureStockMasterSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.STOCK_MASTER_SHEET);
  if (!sheet) return ensureSheet_(CONFIG.STOCK_MASTER_SHEET, ['ITEM_CODE', 'CATEGORY', 'ITEM_NAME', 'UNIT', 'ACTIVE']);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (v) { return String(v || '').trim().toUpperCase(); });
  if (headers.indexOf('ITEM_CODE') < 0) {
    const categoryColumn = headers.indexOf('CATEGORY');
    sheet.insertColumnBefore(categoryColumn >= 0 ? categoryColumn + 1 : 1);
  }
  sheet.getRange(1, 1, 1, 5).setValues([['ITEM_CODE', 'CATEGORY', 'ITEM_NAME', 'UNIT', 'ACTIVE']])
    .setFontWeight('bold').setBackground('#9f172b').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  return sheet;
}

function readStockMaster_(includeInactive) {
  const sheet = ensureStockMasterSheet_();
  if (sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues();
  return rows.filter(function (r) {
    return String(r[0] || '').trim() && String(r[2] || '').trim() && (includeInactive || String(r[4] || '').trim() === '' || truthy_(r[4]));
  }).map(function (r) {
    return { code: String(r[0]).trim().toUpperCase(), category: String(r[1] || 'Uncategorized').trim(), name: String(r[2]).trim(), unit: String(r[3] || '').trim(), active: String(r[4] || '').trim() === '' || truthy_(r[4]) };
  }).sort(function (a, b) { return a.category.localeCompare(b.category) || a.name.localeCompare(b.name); });
}

function findStockMasterItem_(itemKey) {
  const wanted = String(itemKey || '').trim().toLowerCase();
  const items = readStockMaster_();
  for (let i = 0; i < items.length; i++) if (items[i].code.toLowerCase() === wanted || items[i].name.toLowerCase() === wanted) return items[i];
  throw new Error('Item tidak ditemukan atau tidak aktif pada sheet STOCK_ITEMS.');
}

function readStockItemsWithQty_(outlet, location) {
  const master = readStockMaster_();
  if (!master.length) return [];
  const sql = latestStockMovementCte_() + ' SELECT item_code, item_name, SUM(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END) AS current_qty ' +
    'FROM latest WHERE outlet = @outlet AND location = @location GROUP BY item_code, item_name';
  const rows = runNamedQuery_(sql, { outlet: outlet, location: location });
  const codeQty = {}, legacyNameQty = {};
  rows.forEach(function (r) {
    if (String(r.item_code || '').trim()) codeQty[String(r.item_code).toLowerCase()] = Number(r.current_qty || 0);
    else legacyNameQty[String(r.item_name).toLowerCase()] = Number(r.current_qty || 0);
  });
  return master.map(function (item) {
    return { code: item.code, category: item.category, name: item.name, unit: item.unit, qty: (codeQty[item.code.toLowerCase()] || 0) + (legacyNameQty[item.name.toLowerCase()] || 0) };
  });
}

function readCurrentStockCodeQtyMap_(outlet, location) {
  const sql = latestStockMovementCte_() + ' SELECT item_code, SUM(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END) AS current_qty ' +
    'FROM latest WHERE outlet = @outlet AND location = @location AND item_code IS NOT NULL AND item_code != \'\' GROUP BY item_code';
  const map = {};
  runNamedQuery_(sql, { outlet: outlet, location: location }).forEach(function (row) {
    map[String(row.item_code || '').trim().toUpperCase()] = Number(row.current_qty || 0);
  });
  return map;
}

function getCurrentStock_(outlet, location, itemCode, itemName) {
  const sql = latestStockMovementCte_() + ' SELECT COUNT(*) AS movement_count, COALESCE(SUM(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END), 0) AS current_qty ' +
    'FROM latest WHERE outlet = @outlet AND location = @location ' +
    'AND ((item_code = @code) OR ((item_code IS NULL OR item_code = \'\') AND item_name = @item))';
  const rows = runNamedQuery_(sql, { outlet: outlet, location: location, code: itemCode, item: itemName });
  return { count: rows.length ? Number(rows[0].movement_count || 0) : 0, qty: rows.length ? Number(rows[0].current_qty || 0) : 0 };
}

function latestStockMovementCte_() {
  return 'WITH latest AS (SELECT * FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
    'WHERE record_type = \'MOVEMENT\' QUALIFY ROW_NUMBER() OVER (' +
    'PARTITION BY COALESCE(NULLIF(logical_id, \'\'), record_id) ORDER BY COALESCE(version, 1) DESC, created_at DESC) = 1)';
}

function readLatestStockHistory_(outlet, location, item, onlyLogicalId) {
  let sql = latestStockMovementCte_() + ' SELECT record_id, COALESCE(NULLIF(logical_id, \'\'), record_id) AS logical_id, COALESCE(version, 1) AS version, ' +
    'event_date, direction, qty, movement_type, info, expiry_date, created_by, created_at FROM latest ' +
    'WHERE outlet = @outlet AND location = @location AND ((item_code = @code) OR ((item_code IS NULL OR item_code = \'\') AND item_name = @item)) ';
  const params = { outlet: outlet, location: location, code: item.code, item: item.name };
  if (onlyLogicalId) {
    sql += 'AND COALESCE(NULLIF(logical_id, \'\'), record_id) = @logicalId ';
    params.logicalId = onlyLogicalId;
  }
  sql += 'ORDER BY event_date DESC, created_at DESC LIMIT 500';
  return runNamedQuery_(sql, params).map(function (r) {
    return {
      recordId: String(r.record_id || ''), logicalId: String(r.logical_id || r.record_id || ''), version: Number(r.version || 1),
      date: String(r.event_date || ''), direction: String(r.direction || ''), qty: Number(r.qty || 0),
      movementType: String(r.movement_type || ''), info: String(r.info || ''), expiryDate: String(r.expiry_date || ''),
      createdBy: String(r.created_by || ''), createdAt: String(r.created_at || '')
    };
  });
}

function resolveStockContext_(token, requestedOutlet, requestedLocation) {
  const session = requireSession_(token);
  const employee = findEmployee_(session.nik);
  assertEmployeeActive_(employee);
  ensureStockCardInfrastructure_();
  const outlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
  const outlet = resolveStockOutlet_(employee, requestedOutlet, outlets);
  const location = normalizeLocation_(requestedLocation);
  if (readStockLocations_(outlet).indexOf(location) < 0) throw new Error('Lokasi penyimpanan tidak valid.');
  return { employee: employee, outlet: outlet, location: location };
}

function groupStockHistoryByDate_(history) {
  const map = {}, order = [];
  history.forEach(function (movement) {
    const date = String(movement.date || '').slice(0, 10);
    if (!map[date]) {
      map[date] = { date: date, inQty: 0, outQty: 0, inMovements: [], outMovements: [] };
      order.push(date);
    }
    if (movement.direction === 'IN') {
      map[date].inQty += Number(movement.qty || 0);
      map[date].inMovements.push(movement);
    } else if (movement.direction === 'OUT') {
      map[date].outQty += Number(movement.qty || 0);
      map[date].outMovements.push(movement);
    }
  });
  return order.map(function (date) { return map[date]; });
}

function addBalancesToGroupedHistory_(groups, currentQty) {
  let running = Number(currentQty || 0);
  return groups.map(function (day) {
    day.balance = running;
    running -= Number(day.inQty || 0) - Number(day.outQty || 0);
    return day;
  });
}

function calculateFifoSnapshots_(history) {
  const movements = history.slice().sort(function (a, b) {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
    if (dateCompare) return dateCompare;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
  const lots = [], snapshots = {};
  movements.forEach(function (movement) {
    const qty = Number(movement.qty || 0);
    if (movement.direction === 'IN') {
      lots.push({ qty: qty, expiryDate: String(movement.expiryDate || ''), sourceDate: String(movement.date || '') });
    } else if (movement.direction === 'OUT') {
      let remaining = qty;
      for (let i = 0; i < lots.length && remaining > 0.0000001; i++) {
        const taken = Math.min(lots[i].qty, remaining);
        lots[i].qty -= taken;
        remaining -= taken;
      }
    }
    snapshots[String(movement.date || '')] = lots.filter(function (lot) { return lot.qty > 0.0000001; }).map(function (lot) {
      return { qty: lot.qty, expiryDate: lot.expiryDate, sourceDate: lot.sourceDate };
    });
  });
  return snapshots;
}

function fifoDetailText_(lots, unit) {
  if (!lots.length) return 'Stok habis';
  return lots.map(function (lot) {
    return formatQty_(lot.qty) + ' ' + (unit || '') + ' · ' + (lot.expiryDate ? 'Exp: ' + lot.expiryDate : 'Exp belum dilengkapi — edit transaksi masuk');
  }).join('\n');
}

function stockMovementInfo_(movements) {
  return movements.map(function (movement) {
    let text = (movement.movementType || '-') + ': ' + formatQty_(movement.qty);
    if (movement.expiryDate) text += ' | Exp: ' + movement.expiryDate;
    if (movement.info) text += ' | ' + movement.info;
    return text;
  }).join('\n');
}

function buildStockExport_(title, outlet, location, period, headers, rows, format) {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
  const safeBase = cleanExportName_((title + '_' + outlet + '_' + location + (period ? '_' + period : '')).replace(/ · /g, '_'));
  const meta = 'Outlet: ' + outlet + '  |  Penyimpanan: ' + location + (period ? '  |  Periode: ' + period : '  |  Per ' + stamp);
  const blob = format === 'pdf'
    ? buildStockPdfBlob_(safeBase + '.pdf', title, meta, headers, rows)
    : buildStockXlsxBlob_(safeBase + '.xlsx', title, meta, headers, rows);
  return { fileName: blob.getName(), mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function buildStockXlsxBlob_(fileName, title, meta, headers, rows) {
  try {
    // Buat paket XLSX secara langsung. Jangan membuat Google Sheet sementara lalu
    // mengonversinya lewat Drive: jalur konversi tersebut tidak lagi didukung.
    return buildStockXlsxPackage_(fileName, title, meta, headers, rows);
  } catch (error) {
    throw new Error('File Excel gagal dibuat: ' + error.message);
  }
}

function buildStockXlsxPackage_(fileName, title, meta, headers, rows) {
  const allRows = [[title], [meta], [], headers].concat(rows.length ? rows : [['Tidak ada data pada periode ini.']]);
  const numericHeaders = {};
  headers.forEach(function (header, index) { if (['QTY', 'Masuk', 'Keluar', 'Balance'].indexOf(header) >= 0) numericHeaders[index] = true; });
  const sheetRows = allRows.map(function (row, rowIndex) {
    const cells = [];
    for (let col = 0; col < headers.length; col++) {
      const value = row[col] === undefined || row[col] === null ? '' : row[col];
      const ref = xlsxColumn_(col + 1) + (rowIndex + 1);
      let style = rowIndex === 0 ? 1 : rowIndex === 1 ? 2 : rowIndex === 3 ? 3 : 4;
      if (rowIndex >= 4 && numericHeaders[col] && value !== '' && isFinite(Number(value))) {
        style = 5;
        cells.push('<c r="' + ref + '" s="' + style + '"><v>' + Number(value) + '</v></c>');
      } else {
        cells.push('<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape_(String(value)) + '</t></is></c>');
      }
    }
    return '<row r="' + (rowIndex + 1) + '"' + (rowIndex === 0 ? ' ht="26" customHeight="1"' : '') + '>' + cells.join('') + '</row>';
  }).join('');
  const lastColumn = xlsxColumn_(headers.length);
  const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<cols>' + headers.map(function (_, index) { const width = index === 2 || index === 4 ? 34 : index === 0 ? 18 : 20; return '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>'; }).join('') + '</cols>' +
    '<sheetData>' + sheetRows + '</sheetData><mergeCells count="2"><mergeCell ref="A1:' + lastColumn + '1"/><mergeCell ref="A2:' + lastColumn + '2"/></mergeCells><autoFilter ref="A4:' + lastColumn + '4"/></worksheet>';
  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="16"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7F1D32"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF9F172B"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border/><border><bottom style="thin"><color rgb="FFE5E7EB"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const files = [
    Utilities.newBlob('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>', 'application/xml', '[Content_Types].xml'),
    Utilities.newBlob('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>', 'application/xml', '_rels/.rels'),
    Utilities.newBlob('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Stock Card" sheetId="1" r:id="rId1"/></sheets></workbook>', 'application/xml', 'xl/workbook.xml'),
    Utilities.newBlob('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>', 'application/xml', 'xl/_rels/workbook.xml.rels'),
    Utilities.newBlob(sheetXml, 'application/xml', 'xl/worksheets/sheet1.xml'),
    Utilities.newBlob(stylesXml, 'application/xml', 'xl/styles.xml')
  ];
  return Utilities.zip(files, fileName).setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').setName(fileName);
}

function buildStockPdfBlob_(fileName, title, meta, headers, rows) {
  const pageWidth = 842, pageHeight = 595, left = 34, top = 548;
  const widths = headers.length === 7 ? [66, 42, 172, 42, 188, 62, 202] : headers.length === 6 ? [78, 52, 228, 52, 280, 84] : [82, 58, 260, 58, 280];
  const x = [left];
  widths.forEach(function (width) { x.push(x[x.length - 1] + width); });
  const pages = [];
  let commands = [], y = top;
  function textLine(text, px, py, size, bold, color) { commands.push((color || '0.18 0.15 0.16') + ' rg BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + px + ' ' + py + ' Td (' + pdfEscape_(text) + ') Tj ET'); }
  function line(x1, y1, x2, y2) { commands.push('0.86 0.84 0.85 RG ' + x1 + ' ' + y1 + ' m ' + x2 + ' ' + y2 + ' l S'); }
  function pageHeader() {
    commands.push('0.50 0.11 0.20 rg ' + left + ' 526 ' + (pageWidth - left * 2) + ' 34 re f');
    textLine(title, left + 12, 539, 15, true, '1 1 1'); textLine(meta, left, 510, 9, false); y = 486;
    commands.push('0.62 0.09 0.17 rg ' + left + ' ' + (y - 22) + ' ' + (pageWidth - left * 2) + ' 22 re f');
    headers.forEach(function (header, index) { textLine(header, x[index] + 5, y - 15, 8, true, '1 1 1'); });
    y -= 22;
  }
  function finishPage() { pages.push(commands.join('\n')); commands = []; }
  pageHeader();
  const reportRows = rows.length ? rows : [['Tidak ada data pada periode ini.', '', '', '', '']];
  reportRows.forEach(function (row) {
    const wrapped = row.map(function (value, index) { return wrapPdfText_(String(value === undefined || value === null ? '' : value), index === 2 || index === 4 ? 34 : index === 6 ? 34 : 12); });
    const lineCount = Math.max.apply(null, wrapped.map(function (lines) { return lines.length; }));
    const rowHeight = Math.max(24, lineCount * 11 + 8);
    if (y - rowHeight < 35) { finishPage(); pageHeader(); }
    line(left, y, pageWidth - left, y);
    for (let col = 0; col < widths.length; col++) {
      wrapped[col].forEach(function (part, lineIndex) { textLine(part, x[col] + 5, y - 14 - lineIndex * 11, 8, false); });
      line(x[col], y, x[col], y - rowHeight);
    }
    line(x[x.length - 1], y, x[x.length - 1], y - rowHeight); line(left, y - rowHeight, pageWidth - left, y - rowHeight); y -= rowHeight;
  });
  finishPage();
  const objects = [''];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const pageRefs = [];
  const fontNormalId = 3, fontBoldId = 4;
  objects[fontNormalId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[fontBoldId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach(function (content, index) {
    const pageId = 5 + index * 2, contentId = pageId + 1;
    pageRefs.push(pageId + ' 0 R');
    objects[pageId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight + '] /Resources << /Font << /F1 ' + fontNormalId + ' 0 R /F2 ' + fontBoldId + ' 0 R >> >> /Contents ' + contentId + ' 0 R >>';
    objects[contentId] = '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream';
  });
  objects[2] = '<< /Type /Pages /Kids [' + pageRefs.join(' ') + '] /Count ' + pages.length + ' >>';
  let pdf = '%PDF-1.4\n', offsets = [0];
  for (let i = 1; i < objects.length; i++) { offsets[i] = pdf.length; pdf += i + ' 0 obj\n' + objects[i] + '\nendobj\n'; }
  const xref = pdf.length;
  pdf += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let j = 1; j < objects.length; j++) pdf += String(offsets[j]).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return Utilities.newBlob(pdf, 'application/pdf', fileName);
}

function wrapPdfText_(value, maxLength) {
  value = pdfAscii_(value).replace(/\s+/g, ' ').trim();
  if (!value) return [''];
  const words = value.split(' '), lines = []; let line = '';
  words.forEach(function (word) {
    while (word.length > maxLength) { if (line) { lines.push(line); line = ''; } lines.push(word.slice(0, maxLength)); word = word.slice(maxLength); }
    if (!line) line = word; else if ((line + ' ' + word).length <= maxLength) line += ' ' + word; else { lines.push(line); line = word; }
  });
  if (line) lines.push(line);
  return lines;
}

function pdfEscape_(value) { return pdfAscii_(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function pdfAscii_(value) { return String(value || '').replace(/[^\x20-\x7E]/g, '-'); }
function xmlEscape_(value) { return String(value || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }); }
function xlsxColumn_(number) { let name = ''; while (number > 0) { const remainder = (number - 1) % 26; name = String.fromCharCode(65 + remainder) + name; number = Math.floor((number - 1) / 26); } return name; }

function cleanExportName_(value) {
  return String(value || 'Stock_Card').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 120) || 'Stock_Card';
}

function readStockLocations_(outlet) {
  const locations = ['Store', 'Gudang'];
  const sheet = ensureSheet_(CONFIG.STOCK_LOCATION_SHEET, ['OUTLET', 'LOCATION', 'ACTIVE', 'CREATED_BY', 'CREATED_AT']);
  if (sheet.getLastRow() < 2) return locations;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
  rows.forEach(function (r) {
    if (String(r[0] || '').trim().toUpperCase() !== outlet || (String(r[2] || '').trim() && !truthy_(r[2]))) return;
    const name = normalizeLocation_(r[1]);
    if (name && locations.map(function (v) { return v.toLowerCase(); }).indexOf(name.toLowerCase()) < 0) locations.push(name);
  });
  return locations.slice(0, 2).concat(locations.slice(2).sort());
}

function readActiveOutlets_() {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.EMP_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return ['BIHQ'];
  const rows = sheet.getRange(2, 3, sheet.getLastRow() - 1, 7).getDisplayValues();
  const map = {};
  rows.forEach(function (r) {
    const outlet = String(r[0] || '').trim().toUpperCase();
    const status = String(r[6] || '').trim().toLowerCase();
    if (outlet && status !== 'resign') map[outlet] = true;
  });
  return Object.keys(map).sort();
}

function resolveStockOutlet_(employee, requestedOutlet, allowedOutlets) {
  if (employee.outlet !== 'BIHQ') return employee.outlet;
  const outlet = String(requestedOutlet || employee.outlet || '').trim().toUpperCase();
  if (allowedOutlets.indexOf(outlet) < 0) throw new Error('Outlet tidak valid atau tidak aktif.');
  return outlet;
}

function normalizeLocation_(value) {
  return cleanText_(value, 60).replace(/\s+/g, ' ').trim();
}

function validateMovementType_(direction, type) {
  const allowedIn = ['Opening Stock', 'Supplier In', 'Vendor In', 'Transfer In', 'Stock Adjustment', 'Others'];
  const allowedOut = ['Terjual', 'Waste', 'Transfer Out', 'Stock Adjustment', 'Others'];
  const allowed = direction === 'IN' ? allowedIn : allowedOut;
  if (allowed.indexOf(type) < 0) throw new Error('Jenis transaksi tidak valid.');
}

function normalizeDate_(value, useToday) {
  value = String(value || '').trim();
  if (!value && useToday) return todayIso_();
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Format tanggal harus YYYY-MM-DD.');
  const parsed = new Date(value + 'T00:00:00Z');
  if (isNaN(parsed.getTime())) throw new Error('Tanggal tidak valid.');
  return value;
}

function todayIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
}

function formatQty_(qty) {
  return Number(qty || 0).toFixed(3).replace(/\.000$/, '').replace(/(\.\d*?)0+$/, '$1');
}

// ---------- Employee, session, and password helpers ----------

function readEmployeeNameMap_() {
  const map = {};
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.EMP_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return map;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues();
  rows.forEach(function (row) {
    const nik = normalizeNik_(row[0]);
    if (nik) map[nik] = String(row[1] || '').trim() || nik;
  });
  return map;
}

function findEmployee_(nik) {
  if (!nik) throw new Error('NIK wajib diisi.');
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.EMP_SHEET);
  if (!sheet) throw new Error('Sheet EMP_LIST tidak ditemukan.');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Data karyawan belum tersedia.');
  const values = sheet.getRange(2, 1, lastRow - 1, Math.max(12, sheet.getLastColumn())).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    if (normalizeNik_(values[i][0]) === nik) {
      return {
        sheet: sheet, row: i + 2, nik: nik,
        name: String(values[i][1] || '').trim() || nik,
        outlet: String(values[i][2] || '').trim().toUpperCase(),
        status: String(values[i][8] || '').trim().toLowerCase(),
        password: String(values[i][11] || '')
      };
    }
  }
  throw new Error('NIK tidak terdaftar.');
}

function assertEmployeeActive_(employee) {
  if (employee.status === 'resign') throw new Error('Akun tidak aktif karena status karyawan Resign.');
}

function normalizeNik_(nik) {
  return String(nik || '').trim().toUpperCase().replace(/\s+/g, '');
}

function validateNewPassword_(password, confirmPassword) {
  password = String(password || '');
  if (password !== String(confirmPassword || '')) throw new Error('Konfirmasi password tidak sama.');
  if (password.length < CONFIG.PASSWORD_MIN_LENGTH) throw new Error('Password minimal ' + CONFIG.PASSWORD_MIN_LENGTH + ' karakter.');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error('Password harus mengandung huruf dan angka.');
}

function hashPassword_(password) {
  const salt = Utilities.getUuid().replace(/-/g, '');
  return 'v1$' + salt + '$' + digest_(salt + String(password));
}

function verifyPassword_(password, stored) {
  stored = String(stored || '');
  if (stored.indexOf('v1$') !== 0) return constantTimeEqual_(String(password || ''), stored);
  const parts = stored.split('$');
  return parts.length === 3 && constantTimeEqual_(digest_(parts[1] + String(password || '')), parts[2]);
}

function digest_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function constantTimeEqual_(a, b) {
  a = String(a); b = String(b);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) mismatch |= (a.charCodeAt(i % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(i % Math.max(1, b.length)) || 0);
  return mismatch === 0;
}

function createSession_(employee) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  const session = { nik: employee.nik, issuedAt: Date.now() };
  CacheService.getScriptCache().put(sessionKey_(token), JSON.stringify(session), CONFIG.SESSION_TTL_SECONDS);
  return sessionPayload_(employee, token);
}

function sessionPayload_(employee, token) {
  return { token: token, expiresIn: CONFIG.SESSION_TTL_SECONDS, user: userView_(employee) };
}

function userView_(employee) {
  return { nik: employee.nik, name: employee.name, outlet: employee.outlet, isAdmin: employee.outlet === 'BIHQ' };
}

function requireSession_(token) {
  const raw = token && CacheService.getScriptCache().get(sessionKey_(token));
  if (!raw) throw new Error('Sesi berakhir. Silakan login kembali.');
  CacheService.getScriptCache().put(sessionKey_(token), raw, CONFIG.SESSION_TTL_SECONDS);
  return JSON.parse(raw);
}

function requireAdmin_(token) {
  const session = requireSession_(token);
  const employee = findEmployee_(session.nik);
  assertEmployeeActive_(employee);
  if (employee.outlet !== 'BIHQ') throw new Error('Fitur ini hanya dapat diakses oleh admin BIHQ.');
  return employee;
}

function sessionKey_(token) { return 'session:' + String(token); }

function assertNotRateLimited_(nik) {
  const attempts = Number(CacheService.getScriptCache().get('loginfail:' + nik) || 0);
  if (attempts >= 5) throw new Error('Terlalu banyak percobaan login. Tunggu 10 menit lalu coba kembali.');
}

function recordLoginFailure_(nik) {
  const cache = CacheService.getScriptCache();
  const key = 'loginfail:' + nik;
  const attempts = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(attempts), 600);
}

function clearLoginFailures_(nik) { CacheService.getScriptCache().remove('loginfail:' + nik); }

// ---------- News and task helpers ----------

function readNews_(publicOnly) {
  const sheet = ensureSheet_(CONFIG.NEWS_SHEET,
    ['ID', 'TITLE', 'CONTENT', 'IMAGE_URL', 'LINK_URL', 'PUBLISHED_AT', 'ACTIVE', 'CREATED_BY']);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues()
    .filter(function (r) { return truthy_(r[6]); })
    .map(function (r) {
      const item = { id: String(r[0]), title: String(r[1]), content: String(r[2]), imageUrl: String(r[3] || ''), linkUrl: String(r[4] || ''), publishedAt: dateIso_(r[5]) };
      if (!publicOnly) item.createdBy = String(r[7] || '');
      return item;
    }).sort(function (a, b) { return b.publishedAt.localeCompare(a.publishedAt); }).slice(0, 20);
}

function readTasksForEmployee_(employee) {
  const sheet = ensureSheet_(CONFIG.TASK_SHEET,
    ['ID', 'TITLE', 'DESCRIPTION', 'TYPE', 'TARGET', 'FREQUENCY', 'AUDIENCE', 'DUE_LABEL', 'ACTIVE', 'CREATED_AT', 'CREATED_BY']);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues().map(taskFromRow_)
    .filter(function (task) { return task.active && taskApplies_(task, employee); });
}

function taskFromRow_(r) {
  const frequency = String(r[5]).toUpperCase();
  return {
    id: String(r[0]), title: String(r[1]), description: String(r[2] || ''), type: String(r[3]).toUpperCase(),
    target: String(r[4] || ''), frequency: frequency, periodKey: currentPeriodKey_(frequency), audience: String(r[6] || 'ALL').toUpperCase(),
    dueLabel: String(r[7] || ''), active: truthy_(r[8]), createdAt: dateIso_(r[9])
  };
}

function isRegisteredFormFile_(fileName) {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.TASK_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return false;
  const rows = sheet.getRange(2, 4, sheet.getLastRow() - 1, 6).getDisplayValues();
  return rows.some(function (r) {
    return String(r[0]).toUpperCase() === 'FORM' && String(r[1]) === fileName && truthy_(r[5]);
  });
}

function findTask_(taskId) {
  const sheet = ensureSheet_(CONFIG.TASK_SHEET,
    ['ID', 'TITLE', 'DESCRIPTION', 'TYPE', 'TARGET', 'FREQUENCY', 'AUDIENCE', 'DUE_LABEL', 'ACTIVE', 'CREATED_AT', 'CREATED_BY']);
  if (sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  for (let i = 0; i < rows.length; i++) if (String(rows[i][0]) === String(taskId)) return taskFromRow_(rows[i]);
  return null;
}

function taskApplies_(task, employee) {
  const audience = String(task.audience || 'ALL').toUpperCase().split(',').map(function (v) { return v.trim(); });
  return audience.indexOf('ALL') >= 0 || audience.indexOf(employee.outlet) >= 0 || audience.indexOf(employee.nik) >= 0;
}

function cleanAudience_(value) {
  const cleaned = String(value || 'ALL').toUpperCase().split(',').map(function (v) { return v.trim().replace(/[^A-Z0-9_-]/g, ''); }).filter(Boolean);
  return cleaned.length ? cleaned.join(',') : 'ALL';
}

function normalizeHtmlFile_(value) {
  return String(value || '').trim().replace(/\.html$/i, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
}

// ---------- BigQuery: initialized only on first form creation ----------

function ensureBigQueryInfrastructure_() {
  try {
    BigQuery.Datasets.get(CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID);
  } catch (error) {
    if (!/not found|Not found|404/.test(String(error))) throw new Error('BigQuery belum dapat diakses. Aktifkan Advanced Service BigQuery API. Detail: ' + error.message);
    BigQuery.Datasets.insert({
      datasetReference: { projectId: CONFIG.BQ_PROJECT_ID, datasetId: CONFIG.BQ_DATASET_ID },
      location: CONFIG.BQ_LOCATION,
      description: 'Data form dan penyelesaian task Bakerzin Internal Hub'
    }, CONFIG.BQ_PROJECT_ID);
  }
  ensureBigQueryTable_('form_responses', [
    field_('response_id'), field_('task_id'), field_('form_file'), field_('nik'), field_('outlet'), field_('period_key'),
    { name: 'submitted_at', type: 'TIMESTAMP', mode: 'REQUIRED' }, { name: 'response_json', type: 'STRING', mode: 'NULLABLE' }
  ]);
  ensureBigQueryTable_('task_completions', [
    field_('completion_id'), field_('task_id'), field_('nik'), field_('outlet'), field_('period_key'),
    { name: 'completed_at', type: 'TIMESTAMP', mode: 'REQUIRED' }, field_('source')
  ]);
}

function ensureBigQueryTable_(tableId, fields, partitionField) {
  try {
    BigQuery.Tables.get(CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID, tableId);
  } catch (error) {
    if (!/not found|Not found|404/.test(String(error))) throw error;
    const table = {
      tableReference: { projectId: CONFIG.BQ_PROJECT_ID, datasetId: CONFIG.BQ_DATASET_ID, tableId: tableId },
      schema: { fields: fields }
    };
    const field = partitionField || (tableId === 'form_responses' ? 'submitted_at' : tableId === 'task_completions' ? 'completed_at' : '');
    if (field) table.timePartitioning = { type: 'DAY', field: field };
    BigQuery.Tables.insert(table, CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID);
  }
}

function ensureBigQueryField_(tableId, field) {
  ensureBigQueryFields_(tableId, [field]);
}

function ensureBigQueryFields_(tableId, requestedFields) {
  const table = BigQuery.Tables.get(CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID, tableId);
  const fields = table.schema && table.schema.fields ? table.schema.fields : [];
  const existing = {};
  fields.forEach(function (field) { existing[field.name] = true; });
  let changed = false;
  requestedFields.forEach(function (field) {
    if (existing[field.name]) return;
    fields.push(field);
    existing[field.name] = true;
    changed = true;
  });
  if (!changed) return;
  BigQuery.Tables.patch({ schema: { fields: fields } }, CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID, tableId);
}

function field_(name) { return { name: name, type: 'STRING', mode: 'REQUIRED' }; }

function bqField_(name, type, mode) {
  return { name: name, type: type || 'STRING', mode: mode || 'NULLABLE' };
}

function insertAll_(tableId, rows) {
  const result = BigQuery.Tabledata.insertAll({ rows: rows, skipInvalidRows: false, ignoreUnknownValues: false },
    CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID, tableId);
  if (result.insertErrors && result.insertErrors.length) throw new Error('BigQuery menolak data: ' + JSON.stringify(result.insertErrors));
}

function runNamedQuery_(query, params) {
  const queryParameters = Object.keys(params || {}).map(function (name) {
    return { name: name, parameterType: { type: 'STRING' }, parameterValue: { value: String(params[name]) } };
  });
  const request = {
    query: query, useLegacySql: false, location: CONFIG.BQ_LOCATION,
    parameterMode: 'NAMED', queryParameters: queryParameters, maxResults: 10000
  };
  let result = BigQuery.Jobs.query(request, CONFIG.BQ_PROJECT_ID);
  let attempts = 0;
  while (!result.jobComplete && attempts < 20) {
    Utilities.sleep(150);
    result = BigQuery.Jobs.getQueryResults(CONFIG.BQ_PROJECT_ID, result.jobReference.jobId, {
      location: CONFIG.BQ_LOCATION, maxResults: 10000
    });
    attempts++;
  }
  if (!result.jobComplete) throw new Error('Query BigQuery melewati batas waktu. Silakan coba kembali.');
  const fields = result.schema && result.schema.fields ? result.schema.fields.map(function (f) { return f.name; }) : [];
  return (result.rows || []).map(function (row) {
    const object = {};
    row.f.forEach(function (cell, i) { object[fields[i]] = cell.v; });
    return object;
  });
}

function readCompletionMap_(outlet) {
  const map = {};
  try {
    const query = 'SELECT task_id, period_key, MAX(completed_at) AS completed_at ' +
      'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.task_completions` ' +
      'WHERE outlet = @outlet GROUP BY task_id, period_key';
    const request = {
      query: query, useLegacySql: false, location: CONFIG.BQ_LOCATION,
      parameterMode: 'NAMED', queryParameters: [{ name: 'outlet', parameterType: { type: 'STRING' }, parameterValue: { value: outlet } }]
    };
    let result = BigQuery.Jobs.query(request, CONFIG.BQ_PROJECT_ID);
    if (!result.jobComplete) return map;
    (result.rows || []).forEach(function (row) {
      const values = row.f.map(function (cell) { return cell.v; });
      map[values[0] + '|' + values[1]] = values[2];
    });
  } catch (error) {
    // Dataset legitimately does not exist before the first form is registered.
    if (!/not found|Not found|404/.test(String(error))) console.error(error);
  }
  return map;
}

function currentPeriodKey_(frequency) {
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const now = new Date();
  if (frequency === 'DAILY') return Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  if (frequency === 'MONTHLY') return Utilities.formatDate(now, tz, 'yyyy-MM');
  if (frequency === 'YEARLY') return Utilities.formatDate(now, tz, 'yyyy');
  const dayNames = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const day = dayNames[Utilities.formatDate(now, tz, 'EEE')] || 1;
  const monday = new Date(now.getTime() - (day - 1) * 86400000);
  return Utilities.formatDate(monday, tz, 'yyyy-MM-dd');
}

// ---------- General helpers ----------

function getSpreadsheet_() { return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }

function ensureSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#9f172b').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function safe_(fn) {
  try { return { ok: true, data: fn() }; }
  catch (error) { console.error(error && error.stack ? error.stack : error); return { ok: false, error: error.message || 'Terjadi kesalahan.' }; }
}

function cleanText_(value, max) { return String(value || '').trim().replace(/[<>]/g, '').slice(0, max); }

function safeUrl_(value) {
  value = String(value || '').trim();
  if (!value) return '';
  if (!/^https:\/\//i.test(value)) throw new Error('URL harus menggunakan https://');
  return value.slice(0, 1000);
}

function truthy_(value) { return value === true || String(value).toLowerCase() === 'true' || String(value) === '1'; }

function dateIso_(value) {
  const date = value instanceof Date ? value : new Date(value || 0);
  return isNaN(date.getTime()) ? '' : date.toISOString();
}
