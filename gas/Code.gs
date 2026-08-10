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
  PAGE_SHEET: 'APP_PAGES',
  SUBPAGE_VISIBILITY_SHEET: 'APP_PAGE_VISIBILITY',
  SESSION_SHEET: 'APP_SESSIONS',
  STORE_CODE_SHEET: 'STORE CODE',
  STOCK_MASTER_SHEET: 'STOCK_ITEMS',
  STOCK_LOCATION_SHEET: 'STOCK_LOCATIONS',
  STOCK_CONVERSION_SHEET: 'STOCK_UNIT_CONVERSIONS',
  STOCK_DEFAULT_UNIT_LOG_SHEET: 'STOCK_DEFAULT_UNIT_LOG',
  WIP_RECIPE_SHEET: 'WIP_RECIPES',
  STOCK_VISIBILITY_SHEET: 'STOCK_ITEM_VISIBILITY',
  STOCK_NO_EXPIRY_CATEGORY_SHEET: 'STOCK_NO_EXPIRY_CATEGORIES',
  SHOWCASE_SHEET: 'MENU_SHOWCASE',
  BQ_PROJECT_ID: 'berita-acara-digital',
  BQ_DATASET_ID: 'bakerzin_internal',
  BQ_LOCATION: 'asia-southeast2',
  SESSION_TTL_SECONDS: 21600,
  PASSWORD_MIN_LENGTH: 8,
  APP_TITLE: 'Bakerzin Internal Hub'
});

function stockCardTableId_() {
  const configured = String(PropertiesService.getScriptProperties().getProperty('STOCK_CARD_TABLE_ID') || 'stock_card').trim();
  return /^[A-Za-z0-9_]+$/.test(configured) ? configured : 'stock_card';
}

function stockCardTable_() {
  return '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.' + stockCardTableId_() + '`';
}

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
    outletProgress: getOutletProgress,
    markTaskComplete: markTaskComplete,
    adminAddNews: adminAddNews,
    adminUpdateNews: adminUpdateNews,
    adminDeleteNews: adminDeleteNews,
    adminAddItem: adminAddItem,
    adminAddPage: adminAddPage,
    adminPageVisibility: getAdminPageVisibility,
    adminSavePageVisibility: saveAdminPageVisibility,
    bootstrap: getStockCardBootstrap,
    data: getStockCardData,
    supplementary: getStockCardSupplementary,
    expiryAlerts: getStockExpiryAlerts,
    uploadMonitoring: getStockUploadMonitoring,
    verifyBihqBatch: previewBihqBatchUpload,
    uploadBihqBatch: uploadBihqBatch,
    addLocation: addStockLocation,
    setItemHidden: setStockItemHidden,
    save: saveStockMovement,
    edit: updateStockMovement,
    adjust: adjustStockBalance,
    completeExpiry: completeStockExpiryLots,
    expiryTemplate: downloadMissingExpiryTemplate,
    expiryUpload: uploadMissingExpiryExcel,
    expiryUploadStatus: getMissingExpiryUploadStatus,
    history: getStockHistory,
    verifyUsage: previewSalesUsageUpload,
    verifyGoodsReceipt: previewGoodsReceiptUpload,
    verifyGoodsDelivery: previewGoodsDeliveryUpload,
    verifyStockPosition: previewStockPositionUpload,
    saveConversions: saveStockUnitConversions,
    getConversions: getStockUnitConversions,
    defaultUnitOptions: getStockDefaultUnitOptions,
    changeDefaultUnit: changeStockItemDefaultUnit,
    wipOptions: getWipProductionOptions,
    wipTemplate: downloadWipProductionTemplate,
    wipUploadPreview: previewWipProductionUpload,
    wipProduce: processWipProduction,
    wipProduction: getWipProductionDetail,
    wipCancel: cancelWipProduction,
    transferOptions: getStockTransferOptions,
    transferLocal: transferStockWithinOutlet,
    transferOutlet: createInterOutletStockTransfer,
    pendingTransfers: getPendingStockTransfers,
    transferHistory: getStockTransferHistory,
    acceptTransfer: acceptInterOutletStockTransfer,
    rejectTransfer: rejectInterOutletStockTransfer,
    exportTransferReceipt: exportTransferReceipt,
    uploadUsage: uploadSalesUsage,
    uploadGoodsReceipt: uploadGoodsReceipt,
    uploadGoodsDelivery: uploadGoodsDelivery,
    uploadStockPosition: uploadStockPosition,
    exportCurrent: exportCurrentStockExcel,
    exportItem: exportStockCardItem,
    showcaseLogBootstrap: getShowcaseLogBootstrap,
    showcaseLogMonitoring: getShowcaseLogMonitoring,
    saveShowcaseLog: saveShowcaseLog,
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
    '<!doctype html><meta charset="utf-8"><script>top.postMessage(' + message + ',"*");<\/script>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Run once from the Apps Script editor after replacing appsscript.json. */
function authorizeProjectServices() {
  SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getName();
  DriveApp.getRootFolder().getName();
  BigQuery.Datasets.get(CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID);
  // Memaksa layar otorisasi meminta scope script.external_request yang
  // dibutuhkan untuk mengambil hasil export XLSX dari Google Sheets.
  UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest', {
    method: 'get',
    muteHttpExceptions: true
  });
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
    if (token) {
      deactivatePersistentSession_(token);
      CacheService.getScriptCache().remove(sessionKey_(token));
    }
    return { loggedOut: true };
  });
}

function getAppData(token, requestedOutlet) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    const allowedOutlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const preferredOutlet = String(requestedOutlet || '').trim().toUpperCase();
    const completionOutlet = employee.outlet === 'BIHQ'
      ? (allowedOutlets.indexOf(preferredOutlet) >= 0 ? preferredOutlet : (allowedOutlets[0] || employee.outlet))
      : employee.outlet;
    const tasks = readTasksForEmployee_(employee);
    const completions = mergeStockUploadCompletions_(readCompletionMap_(completionOutlet), tasks, completionOutlet);
    return {
      user: userView_(employee),
      tasks: tasks,
      pages: readPagesForEmployee_(employee),
      completions: completions,
      completionOutlet: completionOutlet,
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
    if (!task || !task.active || !taskApplies_(task, employee) || !taskVisibleForEmployeePosition_(task, employee)) throw new Error('Task tidak ditemukan atau bukan untuk akun ini.');

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
    const newsId = Utilities.getUuid();
    const linkUrl = safeUrl_(payload.linkUrl);
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const sheet = ensureNewsSheet_();
      const imageUrl = resolveNewsImage_(payload, '', newsId);
      sheet.appendRow([newsId, title, content, imageUrl, linkUrl, new Date(), true, employee.nik]);
      return { news: readNews_(false), newsId: newsId };
    } finally { lock.releaseLock(); }
  });
}

/** Admin: edit an existing login-page news item without changing its original publication date. */
function adminUpdateNews(token, payload) {
  return safe_(function () {
    requireAdmin_(token);
    payload = payload || {};
    const id = String(payload.id || '').trim();
    const title = cleanText_(payload.title, 120);
    const content = cleanText_(payload.content, 1000);
    if (!id) throw new Error('Berita yang akan diedit tidak ditemukan.');
    if (!title || !content) throw new Error('Judul dan isi berita wajib diisi.');
    const linkUrl = safeUrl_(payload.linkUrl);

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const sheet = ensureNewsSheet_();
      const row = findNewsRow_(sheet, id);
      if (!row) throw new Error('Berita tidak ditemukan atau sudah dihapus.');
      const current = sheet.getRange(row, 1, 1, 8).getValues()[0];
      if (!truthy_(current[6])) throw new Error('Berita tidak ditemukan atau sudah dihapus.');
      const imageUrl = resolveNewsImage_(payload, String(current[3] || ''), id);
      sheet.getRange(row, 2, 1, 4).setValues([[title, content, imageUrl, linkUrl]]);
      return { news: readNews_(false), newsId: id };
    } finally { lock.releaseLock(); }
  });
}

/** Admin: soft-delete a news item so publication history remains auditable in the sheet. */
function adminDeleteNews(token, newsId) {
  return safe_(function () {
    requireAdmin_(token);
    const id = String(newsId || '').trim();
    if (!id) throw new Error('Berita yang akan dihapus tidak ditemukan.');
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const sheet = ensureNewsSheet_();
      const row = findNewsRow_(sheet, id);
      if (!row || !truthy_(sheet.getRange(row, 7).getValue())) throw new Error('Berita tidak ditemukan atau sudah dihapus.');
      sheet.getRange(row, 7).setValue(false);
      return { news: readNews_(false), deletedId: id };
    } finally { lock.releaseLock(); }
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

    const icon = cleanTaskIcon_(payload.icon, type, target);
    const pageId = cleanText_(payload.pageId, 100);
    if (pageId && !readNavigationPages_().some(function (page) { return page.id === pageId; })) {
      throw new Error('Halaman tujuan tidak ditemukan atau sudah tidak aktif.');
    }
    const sheet = ensureTaskSheet_();
    sheet.appendRow([
      Utilities.getUuid(), title, cleanText_(payload.description, 500), type, target,
      frequency, cleanAudience_(payload.audience), cleanText_(payload.dueLabel, 80),
      true, new Date(), employee.nik, icon, pageId
    ]);
    return { tasks: readTasksForEmployee_(employee) };
  });
}

/** Admin: creates an informational page rendered directly inside the app. */
function adminAddPage(token, payload) {
  return safe_(function () {
    const employee = requireAdmin_(token);
    payload = payload || {};
    const title = cleanText_(payload.title, 140);
    if (!title) throw new Error('Nama halaman wajib diisi.');
    const existing = readNavigationPages_();
    if (existing.some(function (page) { return page.title.toLowerCase() === title.toLowerCase(); })) {
      throw new Error('Nama halaman sudah digunakan.');
    }
    const icon = cleanTaskIcon_(payload.icon || 'description', 'PAGE', '');
    const sheet = ensurePageSheet_();
    sheet.appendRow([Utilities.getUuid(), title, icon, true, new Date(), employee.nik]);
    return { pages: readPagesForEmployee_(employee) };
  });
}

function getAdminPageVisibility(token) {
  return safe_(function () {
    requireAdmin_(token);
    const subpages = readAllActiveTasks_(), positions = readEmployeePositions_(), state = readSubpageVisibilityState_();
    const checked = {};
    subpages.forEach(function (task) {
      checked[task.id] = {};
      positions.forEach(function (entry) {
        checked[task.id][entry.position] = !state.configured[task.id] || Boolean(state.allowed[task.id + '|' + entry.position]);
      });
    });
    return { matrixSource: 'APP_TASKS', subpages: subpages, positions: positions, checked: checked };
  });
}

function saveAdminPageVisibility(token, payload) {
  return safe_(function () {
    const employee = requireAdmin_(token), subpages = readAllActiveTasks_(), positions = readEmployeePositions_();
    payload = payload || {};
    const selected = payload.selected && typeof payload.selected === 'object' ? payload.selected : {};
    const positionIds = {}; positions.forEach(function (entry) { positionIds[entry.position] = true; });
    const rows = [];
    subpages.forEach(function (task) {
      const enabledPositions = Array.isArray(selected[task.id]) ? selected[task.id] : [];
      const enabledMap = {};
      enabledPositions.forEach(function (position) { position = normalizeEmployeePosition_(position); if (positionIds[position]) enabledMap[position] = true; });
      positions.forEach(function (entry) {
        rows.push([task.id, entry.position, Boolean(enabledMap[entry.position]), new Date(), employee.nik]);
      });
    });
    const lock = acquireStockWriteLock_();
    try {
      const sheet = ensureSubpageVisibilitySheet_();
      if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).clearContent();
      if (rows.length) sheet.getRange(2, 1, rows.length, 5).setValues(rows);
      SpreadsheetApp.flush();
    } finally { lock.releaseLock(); }
    return { saved: true, subpageCount: subpages.length, positionCount: positions.length };
  });
}

/** Generic save endpoint for separate HTML forms created later. */
function saveFormResponse(token, taskId, responseObject) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    const task = findTask_(taskId);
    if (!task || task.type !== 'FORM' || !taskApplies_(task, employee) || !taskVisibleForEmployeePosition_(task, employee)) throw new Error('Form tidak valid untuk akun ini.');
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
    ensureStockCardReadInfrastructure_();
    const isBihq = employee.outlet === 'BIHQ';
    const outlets = isBihq ? readActiveOutlets_() : [employee.outlet];
    const requested = String(requestedOutlet || '').trim().toUpperCase();
    const outlet = isBihq && !requested ? '' : resolveStockOutlet_(employee, requested, outlets);
    const locations = outlet ? readStockLocations_(outlet) : [];
    const navigationTasks = readTasksForEmployee_(employee);
    const stockTask = navigationTasks.filter(function (task) {
      return task.type === 'FORM' && task.target === 'StockCard' && task.frequency === 'DAILY';
    })[0] || null;
    return {
      user: userView_(employee),
      outlets: outlets,
      selectedOutlet: outlet,
      locations: locations,
      selectedLocation: outlet ? (locations[0] || 'Store') : '',
      items: outlet ? readStockItemsWithQtyCached_(outlet, locations[0] || 'Store') : [],
      expiryAlerts: { missingExpiry: [], nearExpiry: [] },
      taskTable: CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.' + stockCardTableId_(),
      appUrl: ScriptApp.getService().getUrl(),
      taskId: stockTask ? stockTask.id : '',
      taskCompleted: false,
      navigationTasks: navigationTasks,
      navigationPages: readPagesForEmployee_(employee),
      completions: {},
      uploadProgress: null,
      supplementaryPending: true
    };
  });
}

function getStockCardData(token, requestedOutlet, location) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardReadInfrastructure_();
    const outlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, outlets);
    location = normalizeLocation_(location);
    const locations = readStockLocations_(outlet);
    if (locations.indexOf(location) < 0) throw new Error('Lokasi penyimpanan tidak ditemukan untuk outlet ini.');
    return {
      outlet: outlet, location: location, locations: locations, items: readStockItemsWithQtyCached_(outlet, location),
      expiryAlerts: { missingExpiry: [], nearExpiry: [] },
      taskCompleted: false, uploadProgress: null, supplementaryPending: true
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
    const navigationTasks = readTasksForEmployee_(employee);
    const completions = mergeStockUploadCompletions_(readCompletionMap_(outlet), navigationTasks, outlet);
    return {
      outlet: outlet,
      taskCompleted: taskId ? Boolean(completions[taskId + '|' + currentPeriodKey_('DAILY')]) : false,
      uploadProgress: readStockUploadProgress_(outlet),
      pendingTransfers: readPendingStockTransfers_(outlet),
      completions: completions
    };
  });
}

function getStockExpiryAlerts(token, requestedOutlet, location) {
  return safe_(function () {
    const context = resolveStockContext_(token, requestedOutlet, location);
    return { outlet: context.outlet, location: context.location, alerts: readStockExpiryAlerts_(context.outlet, context.location) };
  });
}

// ---------- Showcase Log daily form ----------

function getShowcaseLogBootstrap(token, requestedOutlet, requestedDate) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardReadInfrastructure_();
    const outlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, outlets);
    const eventDate = normalizeDate_(requestedDate, true);
    if (eventDate > todayIso_()) throw new Error('Tanggal Showcase Log tidak boleh melebihi hari ini.');
    const totals = readShowcaseLogTotals_(outlet, eventDate);
    const items = readShowcaseItems_().map(function (item) {
      const day = totals[item.name.toLowerCase()] || {};
      return {
        code: item.code, category: item.category, name: item.name, unit: item.unit,
        previousBalance: Number(day.previousBalance || 0), balance: Number(day.balance || 0),
        totalIn: Number(day.totalIn || 0), totalSold: Number(day.totalSold || 0), totalWaste: Number(day.totalWaste || 0),
        inUsers: day.inUsers || '', soldUsers: day.soldUsers || '', wasteUsers: day.wasteUsers || ''
      };
    }).sort(function (a, b) {
      return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    });
    const task = findShowcaseLogTask_();
    const tasks = readTasksForEmployee_(employee);
    const completions = readCompletionMap_(outlet);
    return {
      user: userView_(employee), outlets: outlets, selectedOutlet: outlet, eventDate: eventDate,
      items: items, progress: readShowcaseLogProgress_(outlet, eventDate), taskId: task ? task.id : '',
      tasks: tasks, pages: readPagesForEmployee_(employee), completions: completions,
      appUrl: ScriptApp.getService().getUrl()
    };
  });
}

function saveShowcaseLog(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const outlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, payload.outlet, outlets);
    const eventDate = normalizeDate_(payload.eventDate, true);
    if (eventDate > todayIso_()) throw new Error('Tanggal Showcase Log tidak boleh melebihi hari ini.');
    const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];
    if (!rawEntries.length || rawEntries.length > 500) throw new Error('Belum ada input Showcase Log yang dapat disimpan.');
    const showcaseItems = readShowcaseItems_();
    const itemMap = {};
    showcaseItems.forEach(function (item) { itemMap[item.code.toUpperCase()] = item; });
    const lock = acquireStockScopeLock_('showcase|' + outlet, 15000);
    try {
    const existingTotals = readShowcaseLogTotals_(outlet, eventDate);
    const entries = rawEntries.map(function (raw) {
      const item = itemMap[String(raw.itemCode || '').trim().toUpperCase()];
      if (!item) throw new Error('Item Showcase tidak ditemukan atau kode item sudah berubah. Muat ulang halaman.');
      const hasInInput = Boolean(raw.hasInInput || raw.hasInTotal), hasSoldInput = Boolean(raw.hasSoldInput || raw.hasSoldTotal), hasWasteInput = Boolean(raw.hasWasteInput || raw.hasWasteTotal);
      const values = [raw.inQty, raw.soldQty, raw.wasteQty].map(function (value) {
        if (value === '' || value === null || value === undefined) return 0;
        const qty = Number(value);
        if (!isFinite(qty) || qty < 0) throw new Error(item.name + ': QTY wajib berupa angka 0 atau lebih.');
        return Math.round(qty * 1000000) / 1000000;
      });
      const day = existingTotals[item.name.toLowerCase()] || { totalIn: 0, totalSold: 0, totalWaste: 0 };
      const targetValues = [[raw.hasInTotal, raw.inTotal, day.totalIn, 'In'], [raw.hasSoldTotal, raw.soldTotal, day.totalSold, 'Sold'], [raw.hasWasteTotal, raw.wasteTotal, day.totalWaste, 'Waste']].map(function (definition) {
        if (!definition[0]) return null;
        const target = Number(definition[1]);
        if (!isFinite(target) || target < 0) throw new Error(item.name + ': Total ' + definition[3] + ' wajib berupa angka 0 atau lebih.');
        return Math.round((target - Number(definition[2] || 0)) * 1000000) / 1000000;
      });
      return {
        item: item,
        inQty: raw.hasInTotal ? targetValues[0] : (hasInInput ? values[0] : 0),
        soldQty: raw.hasSoldTotal ? targetValues[1] : (hasSoldInput ? values[1] : 0),
        wasteQty: raw.hasWasteTotal ? targetValues[2] : (hasWasteInput ? values[2] : 0),
        hasInInput: hasInInput, hasSoldInput: hasSoldInput, hasWasteInput: hasWasteInput
      };
    }).filter(function (entry) { return entry.hasInInput || entry.hasSoldInput || entry.hasWasteInput; });
    if (!entries.length) throw new Error('Isi minimal satu kolom In, Sold, atau Waste sebelum menyimpan.');

      const productNeeds = {}, mappings = {};
      entries.forEach(function (entry) {
        const selectedDay = existingTotals[entry.item.name.toLowerCase()] || { balance: 0 };
        const current = Number(selectedDay.balance || 0);
        if (current + entry.inQty - entry.soldQty - entry.wasteQty < -0.0000001) {
          throw new Error(entry.item.name + ': total Sold dan Waste melebihi Balance pada tanggal yang dipilih setelah In.');
        }
        if (!entry.inQty) return;
        const mapping = resolveShowcaseProductMapping_(entry.item);
        mappings[entry.item.code] = mapping;
        if (entry.inQty < 0) return;
        if (!productNeeds[mapping.product.code]) productNeeds[mapping.product.code] = { product: mapping.product, qty: 0 };
        productNeeds[mapping.product.code].qty += entry.inQty * mapping.productPerMenu;
      });
      const productPools = {};
      const productItems = Object.keys(productNeeds).map(function (code) { return productNeeds[code].product; });
      const storeLotsByCode = readRemainingStockLotsBatch_(outlet, 'Store', productItems);
      Object.keys(productNeeds).forEach(function (code) {
        const need = productNeeds[code], required = Math.round(need.qty * 1000000) / 1000000;
        productPools[code] = allocateTransferLotsFromAvailable_(storeLotsByCode[need.product.code] || [], required).map(function (lot) {
          return { qty: Number(lot.qty), productionDate: lot.productionDate || '', expiryDate: lot.expiryDate || '', sourceDate: lot.sourceDate || '' };
        });
      });

      const progress = readShowcaseLogProgress_(outlet, eventDate);
      const selectedProgress = progress.days.filter(function (day) { return day.date === eventDate; })[0] || {};
      const now = new Date(), rows = [];
      entries.forEach(function (entry, entryIndex) {
        if (entry.inQty > 0) {
          const mapping = mappings[entry.item.code];
          const requiredProductQty = Math.round(entry.inQty * mapping.productPerMenu * 1000000) / 1000000;
          const productLots = takeShowcaseProductLots_(productPools[mapping.product.code], requiredProductQty);
          const transferId = Utilities.getUuid();
          let assignedMenuQty = 0;
          productLots.forEach(function (lot, lotIndex) {
            const storeInfo = 'Transfer To Showcase · Dari Store · Keluar utk Produk: ' + entry.item.name + ' · ' + formatQty_(entry.inQty) + ' ' + entry.item.unit;
            const storeRow = stockTransferMovementRow_(transferId, outlet, 'Store', mapping.product, 'OUT', lot.qty, 'Transfer Out', storeInfo, lot.expiryDate, employee, now, eventDate, lot.productionDate);
            storeRow.json.source_file = 'SHOWCASE_LOG';
            storeRow.json.source_row = entryIndex + 1;
            storeRow.json.created_at = now.getTime() / 1000 + rows.length / 1000000;
            rows.push(storeRow);
            const remainingMenuQty = Math.max(0, entry.inQty - assignedMenuQty);
            const menuLotQty = lotIndex === productLots.length - 1
              ? Math.round(remainingMenuQty * 1000000) / 1000000
              : Math.min(remainingMenuQty, Math.round((lot.qty / mapping.productPerMenu) * 1000000) / 1000000);
            assignedMenuQty += menuLotQty;
            if (menuLotQty <= 0.0000001) return;
            const showcaseInfo = 'Transfer From Store · Ke Showcase · Product ' + mapping.product.name + ' ' + formatQty_(lot.qty) + ' ' + mapping.product.unit;
            const showcaseRow = stockTransferMovementRow_(transferId, outlet, 'Showcase', entry.item, 'IN', menuLotQty, 'Transfer In', showcaseInfo, lot.expiryDate, employee, now, eventDate, lot.productionDate);
            showcaseRow.json.source_arrival_date = lot.sourceDate || null;
            showcaseRow.json.source_file = 'SHOWCASE_LOG';
            showcaseRow.json.source_row = entryIndex + 1;
            showcaseRow.json.created_at = now.getTime() / 1000 + rows.length / 1000000;
            rows.push(showcaseRow);
          });
        }
        if (entry.inQty < 0) {
          const mapping = mappings[entry.item.code], correctionQty = Math.abs(entry.inQty);
          const menuLots = allocateTransferLots_(outlet, 'Showcase', entry.item, correctionQty);
          menuLots.forEach(function (lot) {
            const transferId = Utilities.getUuid(), productQty = Math.round(Number(lot.qty) * mapping.productPerMenu * 1000000) / 1000000;
            const showcaseInfo = 'Koreksi Total In · Transfer To Store · Dari Showcase';
            const showcaseRow = stockTransferMovementRow_(transferId, outlet, 'Showcase', entry.item, 'OUT', lot.qty, 'Transfer In', showcaseInfo, lot.expiryDate, employee, now, eventDate, lot.productionDate);
            showcaseRow.json.source_file = 'SHOWCASE_LOG'; showcaseRow.json.source_row = entryIndex + 1;
            showcaseRow.json.created_at = now.getTime() / 1000 + rows.length / 1000000; rows.push(showcaseRow);
            const storeInfo = 'Koreksi Total In Showcase · Transfer From Showcase · Ke Store · ' + entry.item.name;
            const storeRow = stockTransferMovementRow_(transferId, outlet, 'Store', mapping.product, 'IN', productQty, 'Transfer Out', storeInfo, lot.expiryDate, employee, now, eventDate, lot.productionDate);
            storeRow.json.source_arrival_date = lot.sourceDate || null; storeRow.json.source_file = 'SHOWCASE_LOG'; storeRow.json.source_row = entryIndex + 1;
            storeRow.json.created_at = now.getTime() / 1000 + rows.length / 1000000; rows.push(storeRow);
          });
        }
        [['soldQty', 'Terjual'], ['wasteQty', 'Waste']].forEach(function (definition) {
          const qty = Number(entry[definition[0]] || 0);
          if (Math.abs(qty) <= 0.0000001) return;
          const direction = qty > 0 ? 'OUT' : 'IN';
          const movement = stockTransferMovementRow_(Utilities.getUuid(), outlet, 'Showcase', entry.item, direction, Math.abs(qty), definition[1], 'Koreksi Total Showcase Log', '', employee, now, eventDate);
          movement.json.source_file = 'SHOWCASE_LOG';
          movement.json.source_row = entryIndex + 1;
          movement.json.created_at = now.getTime() / 1000 + rows.length / 1000000;
          rows.push(movement);
        });
      });
      const submittedIn = entries.some(function (entry) { return entry.hasInInput; });
      const submittedSold = entries.some(function (entry) { return entry.hasSoldInput; });
      const submittedWaste = entries.some(function (entry) { return entry.hasWasteInput; });
      [[submittedIn, 'Showcase Log In'], [submittedSold, 'Showcase Log Sold'], [submittedWaste, 'Showcase Log Waste']].forEach(function (activity) {
        if (!activity[0]) return;
        const markerId = Utilities.getUuid();
        rows.push({ insertId: markerId, json: {
          record_id: markerId, logical_id: markerId, version: 1, record_type: 'LOG',
          outlet: outlet, location: 'Showcase', direction: null, qty: 0, movement_type: activity[1], info: '',
          expiry_date: null, event_date: eventDate, created_at: now.getTime() / 1000 + rows.length / 1000000,
          created_by: employee.nik, source_file: 'SHOWCASE_LOG', source_row: 0
        }});
      });
      insertStockCardRows_(rows);
      const hasIn = Boolean(selectedProgress.stockIn || submittedIn);
      const hasSold = Boolean(selectedProgress.sold || submittedSold);
      const hasWaste = Boolean(selectedProgress.waste || submittedWaste);
      if (hasIn && hasSold && hasWaste) markShowcaseLogTaskComplete_(employee, outlet, eventDate);
      progress.days.forEach(function (day) {
        if (day.date !== eventDate) return;
        day.stockIn = hasIn; day.sold = hasSold; day.waste = hasWaste; day.complete = hasIn && hasSold && hasWaste;
      });
      return {
        saved: true, outlet: outlet, eventDate: eventDate,
        movementCount: rows.filter(function (row) { return row.json.record_type === 'MOVEMENT'; }).length,
        entries: entries.map(function (entry) { return { itemCode: entry.item.code, inQty: entry.inQty, soldQty: entry.soldQty, wasteQty: entry.wasteQty }; }),
        progress: progress, completed: hasIn && hasSold && hasWaste
      };
    } finally {
      lock.releaseLock();
    }
  });
}

function resolveShowcaseProductMapping_(showcaseItem) {
  const product = findStockMasterItem_(showcaseItem.productName);
  const fromUnit = normalizeUnit_(showcaseItem.productUnit), toUnit = normalizeUnit_(product.unit);
  const factor = resolveUnitConversionFactor_(product.code, fromUnit, toUnit, {}, readStockUnitConversions_());
  if (!factor) {
    throw new Error(showcaseItem.name + ': konversi ' + showcaseItem.productUnit + ' ke ' + product.unit + ' untuk Product ' + product.name + ' belum tersedia.');
  }
  const productPerMenu = Number(showcaseItem.productQty) * factor;
  if (!isFinite(productPerMenu) || productPerMenu <= 0) throw new Error(showcaseItem.name + ': QTY Product pada MENU_SHOWCASE tidak valid.');
  return { product: product, factor: factor, productPerMenu: productPerMenu };
}

function takeShowcaseProductLots_(pool, qty) {
  let remaining = Number(qty), taken = [];
  for (let i = 0; i < pool.length && remaining > 0.0000001; i++) {
    if (pool[i].qty <= 0.0000001) continue;
    const amount = Math.min(pool[i].qty, remaining);
    if (amount > 0.0000001) taken.push({ qty: amount, productionDate: pool[i].productionDate, expiryDate: pool[i].expiryDate, sourceDate: pool[i].sourceDate });
    pool[i].qty -= amount;
    remaining -= amount;
  }
  if (remaining > 0.0000001) throw new Error('Lot FIFO Store berubah saat Showcase Log diproses. Muat ulang lalu coba lagi.');
  return taken;
}

function readShowcaseLogTotals_(outlet, eventDate) {
  const sql = 'WITH latest AS (SELECT * FROM ' + stockCardTable_() + ' WHERE record_type = \'MOVEMENT\' ' +
    'AND outlet = @outlet AND location = \'Showcase\' AND event_date <= CAST(@eventDate AS DATE) ' +
    'QUALIFY ROW_NUMBER() OVER (PARTITION BY COALESCE(NULLIF(logical_id, \'\'), record_id) ' +
    'ORDER BY COALESCE(version, 1) DESC, created_at DESC) = 1) ' +
    'SELECT item_name, direction, movement_type, created_by, source_file, ' +
    'SUM(CASE WHEN event_date = CAST(@eventDate AS DATE) THEN ' +
    '(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END) ELSE 0 END) AS signed_qty, ' +
    'SUM(CASE WHEN event_date < CAST(@eventDate AS DATE) THEN ' +
    '(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END) ELSE 0 END) AS previous_balance_component, ' +
    'SUM(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END) AS balance_component ' +
    'FROM latest GROUP BY item_name, direction, movement_type, created_by, source_file';
  const map = {};
  const employeeNames = readEmployeeNameMap_();
  runNamedQuery_(sql, { outlet: outlet, eventDate: eventDate }, { useQueryCache: false }).forEach(function (row) {
    const key = String(row.item_name || '').trim().toLowerCase();
    if (!map[key]) map[key] = { previousBalance: 0, balance: 0, totalIn: 0, totalSold: 0, totalWaste: 0, inActors: {}, soldActors: {}, wasteActors: {} };
    const item = map[key], signedQty = Number(row.signed_qty || 0), nik = String(row.created_by || ''), name = employeeNames[nik] || 'User tidak diketahui';
    item.previousBalance += Number(row.previous_balance_component || 0);
    item.balance += Number(row.balance_component || 0);
    const sourceFile = String(row.source_file || ''), actor = name + ' | ' + (sourceFile && sourceFile !== 'SHOWCASE_LOG' ? 'Generated By Upload' : 'Manual Input');
    if (row.movement_type === 'Transfer In' && Math.abs(signedQty) > 0.0000001) { item.totalIn += signedQty; item.inActors[actor] = true; }
    if (row.movement_type === 'Terjual' && Math.abs(signedQty) > 0.0000001) { item.totalSold -= signedQty; item.soldActors[actor] = true; }
    if (row.movement_type === 'Waste' && Math.abs(signedQty) > 0.0000001) { item.totalWaste -= signedQty; item.wasteActors[actor] = true; }
  });
  Object.keys(map).forEach(function (key) {
    map[key].inUsers = Object.keys(map[key].inActors).join(', ');
    map[key].soldUsers = Object.keys(map[key].soldActors).join(', ');
    map[key].wasteUsers = Object.keys(map[key].wasteActors).join(', ');
    delete map[key].inActors; delete map[key].soldActors; delete map[key].wasteActors;
  });
  return map;
}

function readShowcaseLogProgress_(outlet, anchorDate) {
  const anchor = new Date(anchorDate + 'T00:00:00Z');
  const year = anchor.getUTCFullYear(), month = anchor.getUTCMonth();
  const startDate = Utilities.formatDate(new Date(Date.UTC(year, month, 1)), 'UTC', 'yyyy-MM-dd');
  const endDate = Utilities.formatDate(new Date(Date.UTC(year, month + 1, 0)), 'UTC', 'yyyy-MM-dd');
  const sql = 'SELECT CAST(event_date AS STRING) AS event_date, ' +
    'MAX(IF(movement_type = \'Showcase Log In\', 1, 0)) AS stock_in, ' +
    'MAX(IF(movement_type = \'Showcase Log Sold\', 1, 0)) AS sold, ' +
    'MAX(IF(movement_type = \'Showcase Log Waste\', 1, 0)) AS waste ' +
    'FROM ' + stockCardTable_() + ' ' +
    'WHERE record_type = \'LOG\' AND outlet = @outlet AND location = \'Showcase\' ' +
    'AND event_date BETWEEN CAST(@startDate AS DATE) AND CAST(@endDate AS DATE) GROUP BY event_date';
  const status = {};
  runNamedQuery_(sql, { outlet: outlet, startDate: startDate, endDate: endDate }, { useQueryCache: false }).forEach(function (row) {
    status[String(row.event_date)] = { stockIn: Number(row.stock_in || 0) > 0, sold: Number(row.sold || 0) > 0, waste: Number(row.waste || 0) > 0 };
  });
  const today = todayIso_(), days = [], lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let day = 1; day <= lastDay; day++) {
    const date = Utilities.formatDate(new Date(Date.UTC(year, month, day)), 'UTC', 'yyyy-MM-dd');
    const value = status[date] || { stockIn: false, sold: false, waste: false };
    days.push({ day: day, date: date, stockIn: value.stockIn, sold: value.sold, waste: value.waste, complete: value.stockIn && value.sold && value.waste, future: date > today });
  }
  return { today: today, selectedDate: anchorDate, month: startDate.slice(0, 7), days: days };
}

function getShowcaseLogMonitoring(token, monthKey) {
  return safe_(function () {
    const employee = requireAdmin_(token);
    monthKey = /^\d{4}-\d{2}$/.test(String(monthKey || '')) ? String(monthKey) : todayIso_().slice(0, 7);
    const parts = monthKey.split('-'), lastDay = new Date(Date.UTC(Number(parts[0]), Number(parts[1]), 0)).getUTCDate();
    const startDate = monthKey + '-01', endDate = monthKey + '-' + String(lastDay).padStart(2, '0');
    const outlets = readActiveOutlets_().filter(function (outlet) { return outlet !== 'BIHQ'; });
    const sql = 'SELECT outlet, CAST(event_date AS STRING) AS event_date, ' +
      'MAX(IF(movement_type = \'Showcase Log In\', 1, 0)) AS stock_in, ' +
      'MAX(IF(movement_type = \'Showcase Log Sold\', 1, 0)) AS sold, ' +
      'MAX(IF(movement_type = \'Showcase Log Waste\', 1, 0)) AS waste ' +
      'FROM ' + stockCardTable_() + ' ' +
      'WHERE record_type = \'LOG\' AND location = \'Showcase\' ' +
      'AND event_date BETWEEN CAST(@startDate AS DATE) AND CAST(@endDate AS DATE) GROUP BY outlet, event_date';
    const map = {};
    runNamedQuery_(sql, { startDate: startDate, endDate: endDate }, { useQueryCache: false }).forEach(function (row) {
      map[String(row.outlet || '').toUpperCase() + '|' + String(row.event_date || '').slice(0, 10)] = {
        stockIn: Number(row.stock_in || 0) > 0, sold: Number(row.sold || 0) > 0, waste: Number(row.waste || 0) > 0
      };
    });
    const rows = [], today = todayIso_();
    outlets.forEach(function (outlet) {
      for (let day = 1; day <= lastDay; day++) {
        const date = monthKey + '-' + String(day).padStart(2, '0');
        if (date > today) continue;
        const state = map[outlet + '|' + date] || {};
        rows.push({ outlet: outlet, date: date, stockIn: Boolean(state.stockIn), sold: Boolean(state.sold), waste: Boolean(state.waste) });
      }
    });
    return { monthKey: monthKey, today: today, outlets: outlets, rows: rows, generatedAt: new Date().toISOString(), requestedBy: employee.nik };
  });
}

function findShowcaseLogTask_() {
  const sheet = ensureTaskSheet_();
  if (sheet.getLastRow() < 2) return null;
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues().map(taskFromRow_).filter(function (task) {
    if (!task.active) return false;
    return task.type === 'FORM' && String(task.target || '').toLowerCase() === 'showcaselog' && task.frequency === 'DAILY';
  })[0] || null;
}

function markShowcaseLogTaskComplete_(employee, outlet, eventDate) {
  const task = findShowcaseLogTask_();
  if (!task) return false;
  ensureBigQueryInfrastructure_();
  if (readCompletionMap_(outlet)[task.id + '|' + eventDate]) return true;
  insertAll_('task_completions', [{ insertId: Utilities.getUuid(), json: {
    completion_id: Utilities.getUuid(), task_id: task.id, nik: employee.nik, outlet: outlet,
    period_key: eventDate, completed_at: new Date().toISOString(), source: 'SHOWCASE_LOG'
  }}]);
  return true;
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
    removeScriptCacheKeys_(['stock-locations-' + outlet]);
    return { outlet: outlet, location: location, locations: existing.concat([location]) };
  });
}

function readStockUploadProgress_(outlet) {
  const today = todayIso_(), parts = today.split('-');
  const year = Number(parts[0]), month = Number(parts[1]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthKey = parts[0] + '-' + parts[1];
  const startDate = monthKey + '-01';
  const endDate = monthKey + '-' + String(lastDay).padStart(2, '0');
  const sql = 'SELECT CAST(event_date AS STRING) AS event_date, ' +
    'MAX(IF(movement_type = \'Goods Receipt\', 1, 0)) AS goods_receipt, ' +
    'MAX(IF(movement_type = \'Terjual\', 1, 0)) AS sales_usage, ' +
    'MAX(IF(movement_type = \'Transfer Out Antar Outlet\', 1, 0)) AS goods_delivery ' +
    'FROM ' + stockCardTable_() + ' ' +
    'WHERE record_type = \'MOVEMENT\' AND outlet = @outlet ' +
    'AND item_code IS NOT NULL AND item_code != \'\' AND qty IS NOT NULL ' +
    'AND event_date BETWEEN CAST(@startDate AS DATE) AND CAST(@endDate AS DATE) ' +
    'AND movement_type IN (\'Goods Receipt\', \'Terjual\', \'Transfer Out Antar Outlet\') ' +
    'AND source_file IS NOT NULL AND source_file != \'\' GROUP BY event_date';
  const statusByDate = {};
  runNamedQuery_(sql, { outlet: outlet, startDate: startDate, endDate: endDate }).forEach(function (row) {
    statusByDate[String(row.event_date || '').slice(0, 10)] = {
      goodsReceipt: Number(row.goods_receipt || 0) > 0,
      salesUsage: Number(row.sales_usage || 0) > 0,
      goodsDelivery: Number(row.goods_delivery || 0) > 0
    };
  });
  const days = [];
  for (let day = 1; day <= lastDay; day++) {
    const date = monthKey + '-' + String(day).padStart(2, '0');
    const state = statusByDate[date] || { goodsReceipt: false, salesUsage: false, goodsDelivery: false };
    days.push({
      day: day, date: date, future: date > today,
      goodsReceipt: state.goodsReceipt, salesUsage: state.salesUsage, goodsDelivery: state.goodsDelivery,
      complete: state.goodsReceipt && state.salesUsage
    });
  }
  return { monthKey: monthKey, today: today, days: days };
}

/** BIHQ-only day-by-day monitoring, derived from actual item movements. */
function getStockUploadMonitoring(token, monthKey) {
  return safe_(function () {
    const employee = requireAdmin_(token);
    monthKey = /^\d{4}-\d{2}$/.test(String(monthKey || '')) ? String(monthKey) : todayIso_().slice(0, 7);
    const cacheKey = 'stock-upload-monitor-v1-' + monthKey, cached = readScriptJsonCache_(cacheKey);
    if (cached) return cached;
    const parts = monthKey.split('-'), lastDay = new Date(Date.UTC(Number(parts[0]), Number(parts[1]), 0)).getUTCDate();
    const startDate = monthKey + '-01', endDate = monthKey + '-' + String(lastDay).padStart(2, '0');
    const outlets = readActiveOutlets_().filter(function (outlet) { return outlet !== 'BIHQ'; });
    const sql = 'SELECT outlet, CAST(event_date AS STRING) AS event_date, upload_type, actual_item_count AS actual_rows, marker_count AS marker_rows, ' +
      'CAST(last_upload AS STRING) AS last_upload, last_user FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_upload_daily_summary` ' +
      'WHERE event_date BETWEEN CAST(@startDate AS DATE) AND CAST(@endDate AS DATE)';
    const map = {}, problemCount = { markerWithoutData: 0 };
    runNamedQuery_(sql, { startDate: startDate, endDate: endDate }, { useQueryCache: false }).forEach(function (row) {
      const key = String(row.outlet || '').toUpperCase() + '|' + String(row.event_date || '').slice(0, 10);
      if (!map[key]) map[key] = {};
      const type = String(row.upload_type || '');
      if (['goodsReceipt', 'salesUsage', 'goodsDelivery'].indexOf(type) < 0) return;
      const actualRows = Number(row.actual_rows || 0), markerRows = Number(row.marker_rows || 0);
      if (!actualRows && markerRows) problemCount.markerWithoutData++;
      map[key][type] = { done: actualRows > 0, actualRows: actualRows, markerWithoutData: !actualRows && markerRows > 0,
        lastUpload: String(row.last_upload || ''), lastUser: String(row.last_user || '') };
    });
    const rows = [];
    outlets.forEach(function (outlet) {
      for (let day = 1; day <= lastDay; day++) {
        const date = monthKey + '-' + String(day).padStart(2, '0');
        if (date > todayIso_()) continue;
        const state = map[outlet + '|' + date] || {};
        rows.push({ outlet: outlet, date: date,
          goodsReceipt: state.goodsReceipt || { done: false, actualRows: 0, markerWithoutData: false },
          salesUsage: state.salesUsage || { done: false, actualRows: 0, markerWithoutData: false },
          goodsDelivery: state.goodsDelivery || { done: false, actualRows: 0, markerWithoutData: false },
          complete: Boolean(state.goodsReceipt && state.goodsReceipt.done && state.salesUsage && state.salesUsage.done) });
      }
    });
    const response = { monthKey: monthKey, rows: rows, outlets: outlets, problems: problemCount, generatedAt: new Date().toISOString(), requestedBy: employee.nik };
    writeScriptJsonCache_(cacheKey, response, 60);
    return response;
  });
}

function parseBihqBatchGroups_(payload) {
  const type = String(payload.type || '').toUpperCase();
  if (['GOODS_RECEIPT', 'GOODS_DELIVERY'].indexOf(type) < 0) throw new Error('Pilih jenis batch Good Receipt atau Good Delivery.');
  const fileName = cleanText_(payload.fileName, 180);
  const base64 = String(payload.base64 || '').replace(/^data:[^,]+,/, '').trim();
  const report = type === 'GOODS_RECEIPT' ? parseGoodsReceiptReport_(base64, fileName, true) : parseGoodsDeliveryReport_(base64, fileName, true);
  const directory = readStoreCodeDirectory_(), active = readActiveOutlets_(), grouped = {};
  report.rows.forEach(function (row) {
    const outletName = type === 'GOODS_RECEIPT' ? row.outletName : row.originName;
    const entry = directory.byName[normalizeStoreName_(outletName)] || null;
    if (!entry) throw new Error('Outlet "' + outletName + '" belum terdaftar di sheet STORE CODE.');
    if (active.indexOf(entry.code) < 0 || entry.code === 'BIHQ') throw new Error('Outlet ' + entry.code + ' tidak aktif atau tidak dapat dipakai untuk batch.');
    if (!grouped[entry.code]) grouped[entry.code] = { outlet: entry.code, outletName: entry.name, rows: [] };
    grouped[entry.code].rows.push(row);
  });
  return { type: type, fileName: fileName, base64: base64, groups: Object.keys(grouped).sort().map(function (code) {
    const group = grouped[code], dates = {}, documents = {}, counterparties = {};
    group.rows.forEach(function (row) {
      dates[row.transactionDate] = true;
      documents[type === 'GOODS_RECEIPT' ? row.grNumber : row.gdNumber] = true;
      counterparties[type === 'GOODS_RECEIPT' ? row.supplier : row.destinationName] = true;
    });
    group.report = { outletName: group.outletName, rows: group.rows, transactionDates: Object.keys(dates),
      receiptCount: type === 'GOODS_RECEIPT' ? Object.keys(documents).length : 0,
      supplierCount: type === 'GOODS_RECEIPT' ? Object.keys(counterparties).length : 0,
      deliveryCount: type === 'GOODS_DELIVERY' ? Object.keys(documents).length : 0,
      destinationCount: type === 'GOODS_DELIVERY' ? Object.keys(counterparties).length : 0 };
    return group;
  }) };
}

function prepareBihqBatch_(employee, payload) {
  const batch = parseBihqBatchGroups_(payload), location = normalizeLocation_(payload.location) || 'Store', preparedGroups = [], conversions = [];
  batch.groups.forEach(function (group) {
    if (readStockLocations_(group.outlet).indexOf(location) < 0) throw new Error('Lokasi ' + location + ' tidak tersedia pada outlet ' + group.outlet + '.');
    const context = { outlet: group.outlet, location: location, employee: employee };
    let localPayload = { fileName: batch.fileName, base64: batch.base64, conversions: payload.conversions || {} };
    let prepared = batch.type === 'GOODS_RECEIPT'
      ? prepareGoodsReceiptImport_(context, localPayload, true, group.report)
      : prepareGoodsDeliveryImport_(context, localPayload, true, group.report);
    if (prepared.requiresConversion) {
      (prepared.conversionRequests || []).forEach(function (entry) { conversions.push(entry); });
      preparedGroups.push({ outlet: group.outlet, outletName: group.outletName, prepared: prepared, context: context });
      return;
    }
    if (prepared.requiresDuplicateDecision) {
      localPayload.skipDuplicateRows = (prepared.unresolvedDuplicates || []).map(function (entry) { return entry.sourceRow; });
      prepared = batch.type === 'GOODS_RECEIPT'
        ? prepareGoodsReceiptImport_(context, localPayload, true, group.report)
        : prepareGoodsDeliveryImport_(context, localPayload, true, group.report);
    }
    preparedGroups.push({ outlet: group.outlet, outletName: group.outletName, prepared: prepared, context: context });
  });
  return { type: batch.type, fileName: batch.fileName, location: location, groups: preparedGroups, conversions: conversions };
}

function previewBihqBatchUpload(token, payload) {
  return safe_(function () {
    const employee = requireAdmin_(token);
    const batch = prepareBihqBatch_(employee, payload || {});
    return { verified: batch.conversions.length === 0, requiresConversion: batch.conversions.length > 0,
      type: batch.type, fileName: batch.fileName, location: batch.location, conversions: batch.conversions,
      outlets: batch.groups.map(function (group) { return { outlet: group.outlet, outletName: group.outletName,
        sourceItemCount: group.prepared.originalSourceItemCount || group.prepared.sourceItemCount || 0,
        uploadItemCount: group.prepared.items ? group.prepared.items.length : 0,
        duplicateRowsSkipped: group.prepared.skippedDuplicates ? group.prepared.skippedDuplicates.length : 0 }; }) };
  });
}

function uploadBihqBatch(token, payload) {
  return safe_(function () {
    const employee = requireAdmin_(token);
    const batch = prepareBihqBatch_(employee, payload || {});
    if (batch.conversions.length) throw new Error('Batch memiliki perbedaan unit. Lengkapi Unit Konversi terlebih dahulu lalu verifikasi ulang.');
    const results = [];
    batch.groups.forEach(function (group) {
      const prepared = group.prepared;
      if (!prepared.items || !prepared.items.length) {
        results.push({ outlet: group.outlet, uploaded: 0, skipped: prepared.skippedDuplicates ? prepared.skippedDuplicates.length : 0 });
        return;
      }
      appendOrActivateStockMasterItems_(prepared.masterChanges);
      const lock = acquireStockWriteLock_();
      try {
        if (batch.type === 'GOODS_RECEIPT') writeBihqGoodsReceiptGroup_(group.context, prepared);
        else writeBihqGoodsDeliveryGroup_(group.context, prepared);
      } finally { lock.releaseLock(); }
      results.push({ outlet: group.outlet, uploaded: prepared.items.length, skipped: prepared.skippedDuplicates.length });
    });
    return { uploaded: true, type: batch.type, fileName: batch.fileName, outletCount: results.length, results: results };
  });
}

function writeBihqGoodsReceiptGroup_(context, prepared) {
  const now = new Date(), rows = prepared.items.map(function (receipt) {
    const recordId = Utilities.getUuid(), conversionInfo = receipt.converted ? ' | Konversi ' + formatQty_(receipt.originalQty) + ' ' + receipt.originalUnit + ' = ' + formatQty_(receipt.qty) + ' ' + receipt.item.unit : '';
    return { insertId: recordId, json: { record_id: recordId, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT',
      outlet: context.outlet, location: context.location, item_code: receipt.item.code, category: receipt.item.category, item_name: receipt.item.name, unit: receipt.item.unit,
      direction: 'IN', qty: receipt.qty, movement_type: 'Goods Receipt', supplier: cleanText_(receipt.supplier || '-', 180),
      info: cleanText_('Supplier ' + (receipt.supplier || '-') + ' | PO ' + (receipt.poNumber || '-') + ' | GR ' + (receipt.grNumber || '-') + ' | Batch BIHQ | ' + prepared.fileName + ' | Baris ' + receipt.sourceRow + conversionInfo, 500),
      expiry_date: receipt.expiryDate || null, source_arrival_date: receipt.transactionDate, event_date: receipt.transactionDate,
      created_at: now.getTime() / 1000, created_by: context.employee.nik, source_file: prepared.fileName, source_hash: prepared.sourceHash, source_row: receipt.sourceRow } };
  });
  insertStockCardRows_(rows);
}

function writeBihqGoodsDeliveryGroup_(context, prepared) {
  const now = new Date(), transferIds = {}, totalByCode = {}, itemByCode = {}, queues = {}, stockRows = [], pendingRows = [];
  prepared.items.forEach(function (line) { totalByCode[line.item.code] = Number(totalByCode[line.item.code] || 0) + Number(line.qty || 0); itemByCode[line.item.code] = line.item; });
  Object.keys(totalByCode).forEach(function (code) { queues[code] = allocateTransferLots_(context.outlet, context.location, itemByCode[code], totalByCode[code]); });
  prepared.items.forEach(function (line) {
    const groupKey = line.gdNumber + '|' + line.destinationCode;
    if (!transferIds[groupKey]) transferIds[groupKey] = Utilities.getUuid();
    const transferId = transferIds[groupKey], queue = queues[line.item.code] || [], allocated = [];
    let remaining = Number(line.qty || 0);
    while (remaining > 0.0000001 && queue.length) { const lot = queue[0], taken = Math.min(remaining, Number(lot.qty || 0)); if (taken > 0.0000001) allocated.push({ qty: taken, expiryDate: lot.expiryDate || '' }); remaining -= taken; lot.qty -= taken; if (lot.qty <= 0.0000001) queue.shift(); }
    if (remaining > 0.0000001) allocated.push({ qty: remaining, expiryDate: '' });
    const destination = line.destinationName + ' (' + line.destinationCode + ')';
    allocated.forEach(function (lot) {
      const recordId = Utilities.getUuid(), eventId = Utilities.getUuid(), note = cleanText_('Transfer To ' + destination + ' | GD ' + line.gdNumber + ' | Batch BIHQ | ' + prepared.fileName + ' | Baris ' + line.sourceRow, 300);
      stockRows.push({ insertId: recordId, json: { record_id: recordId, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT', transfer_id: transferId,
        outlet: context.outlet, location: context.location, item_code: line.item.code, category: line.item.category, item_name: line.item.name, unit: line.item.unit,
        direction: 'OUT', qty: lot.qty, movement_type: 'Transfer Out Antar Outlet', supplier: cleanText_(line.destinationName, 180), info: note,
        expiry_date: lot.expiryDate || null, event_date: line.transactionDate, created_at: now.getTime() / 1000, created_by: context.employee.nik,
        source_file: prepared.fileName, source_hash: line.rowHash, source_row: line.sourceRow } });
      pendingRows.push({ insertId: eventId, json: { event_id: eventId, transfer_id: transferId, status: 'PENDING', from_outlet: context.outlet, from_location: context.location,
        to_outlet: line.destinationCode, to_location: null, item_code: line.item.code, category: line.item.category, item_name: line.item.name, unit: line.item.unit,
        qty: lot.qty, note: note, expiry_date: lot.expiryDate || null, delivery_date: line.transactionDate,
        created_by: context.employee.nik, created_by_name: context.employee.name, created_at: now.getTime() / 1000 } });
    });
  });
  insertStockCardRows_(stockRows);
  insertAll_('stock_transfers', pendingRows);
}

function markStockTaskCompleteFromUploads_(context, periodKey, completedType) {
  try {
    if (['Goods Receipt', 'Terjual'].indexOf(completedType) < 0) return false;
    const otherType = completedType === 'Goods Receipt' ? 'Terjual' : 'Goods Receipt';
    const sql = 'SELECT COUNT(*) AS total FROM ' + stockCardTable_() + ' ' +
      'WHERE record_type = \'MOVEMENT\' AND outlet = @outlet AND item_code IS NOT NULL AND item_code != \'\' AND event_date = CAST(@periodKey AS DATE) ' +
      'AND movement_type = @movementType AND source_file IS NOT NULL AND source_file != \'\'';
    const rows = runNamedQuery_(sql, { outlet: context.outlet, periodKey: periodKey, movementType: otherType });
    if (!rows.length || Number(rows[0].total || 0) <= 0) return false;
    const task = readTasksForEmployee_(context.employee).filter(function (item) {
      return item.type === 'FORM' && item.target === 'StockCard' && item.frequency === 'DAILY';
    })[0] || null;
    if (!task || !taskExistedForPeriod_(task, task.frequency, periodKey)) return false;
    if (readCompletionMap_(context.outlet)[task.id + '|' + periodKey]) return true;
    insertAll_('task_completions', [{
      insertId: Utilities.getUuid(),
      json: {
        completion_id: Utilities.getUuid(), task_id: task.id, nik: context.employee.nik,
        outlet: context.outlet, period_key: periodKey, completed_at: new Date().toISOString(),
        source: 'AUTO_UPLOADS'
      }
    }]);
    return true;
  } catch (error) {
    console.error('Auto completion Stock Card gagal: ' + (error && error.message ? error.message : error));
    return false;
  }
}

/** Hide or restore one stock item for an outlet and storage location. */
function setStockItemHidden(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const item = findStockItemForLocation_(context.location, payload.itemCode);
    const hidden = Boolean(payload.hidden);
    const sheet = ensureStockVisibilitySheet_();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const lastRow = sheet.getLastRow();
      const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues() : [];
      let targetRow = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (String(rows[i][0]).trim().toUpperCase() === context.outlet &&
            normalizeLocation_(rows[i][1]).toLowerCase() === context.location.toLowerCase() &&
            String(rows[i][2]).trim().toUpperCase() === item.code) {
          targetRow = i + 2;
          break;
        }
      }
      const values = [[context.outlet, context.location, item.code, hidden, context.employee.nik, new Date()]];
      if (targetRow) sheet.getRange(targetRow, 1, 1, 6).setValues(values);
      else sheet.appendRow(values[0]);
      SpreadsheetApp.flush();
      removeScriptCacheKeys_([stockItemsCacheKey_(context.outlet, context.location)]);
      return { itemCode: item.code, hidden: hidden };
    } finally {
      lock.releaseLock();
    }
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

/** BIHQ-only catalog for changing an item's default unit. */
function getStockDefaultUnitOptions(token) {
  return safe_(function () {
    requireAdmin_(token);
    const savedConversions = readStockUnitConversions_();
    const items = readStockMaster_(true).map(function (item) {
      const currentUnit = normalizeUnit_(item.unit), available = {};
      Object.keys(savedConversions).forEach(function (key) {
        const conversion = savedConversions[key];
        if (conversion.itemCode !== item.code) return;
        if (conversion.fromUnit) available[conversion.fromUnit] = true;
        if (conversion.toUnit) available[conversion.toUnit] = true;
      });
      delete available[currentUnit];
      const unitOptions = Object.keys(available).sort().map(function (unit) {
        return { unit: unit, factor: resolveUnitConversionFactor_(item.code, currentUnit, unit, {}, savedConversions) };
      }).filter(function (option) { return isFinite(option.factor) && option.factor > 0; });
      return { code: item.code, category: item.category, name: item.name, unit: currentUnit, unitOptions: unitOptions, active: item.active };
    });
    const units = {};
    ['PCS', 'GR', 'KG', 'ML', 'L', 'PORSI', 'PACK', 'BOX', 'BTL'].forEach(function (unit) { units[unit] = true; });
    items.forEach(function (item) { if (item.unit) units[item.unit] = true; });
    return { items: items, units: Object.keys(units).sort() };
  });
}

/** Changes STOCK_ITEMS.UNIT and converts every stored quantity for that item. */
function changeStockItemDefaultUnit(token, payload) {
  return safe_(function () {
    const employee = requireAdmin_(token);
    payload = payload || {};
    const itemCode = cleanText_(payload.itemCode, 80).toUpperCase();
    const newUnit = normalizeUnit_(payload.newUnit);
    if (!itemCode || !newUnit) throw new Error('Pilih item dan Unit Default baru terlebih dahulu.');

    const masterSheet = ensureStockMasterSheet_();
    if (masterSheet.getLastRow() < 2) throw new Error('STOCK_ITEMS masih kosong.');
    const masterRows = masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, 5).getDisplayValues();
    let masterIndex = -1;
    for (let i = 0; i < masterRows.length; i++) {
      if (String(masterRows[i][0] || '').trim().toUpperCase() === itemCode) { masterIndex = i; break; }
    }
    if (masterIndex < 0) throw new Error('Item ' + itemCode + ' tidak ditemukan pada STOCK_ITEMS.');
    const itemName = String(masterRows[masterIndex][2] || '').trim();
    const oldUnit = normalizeUnit_(masterRows[masterIndex][3]);
    if (!oldUnit) throw new Error(itemCode + ' · Unit Default lama masih kosong.');
    if (oldUnit === newUnit) throw new Error(itemCode + ' sudah menggunakan Unit Default ' + newUnit + '.');
    const savedFactor = resolveUnitConversionFactor_(itemCode, oldUnit, newUnit, {}, readStockUnitConversions_());
    const factor = defaultUnitConversionFactor_(oldUnit, newUnit) || savedFactor || Number(payload.factor);
    if (!isFinite(factor) || factor <= 0) throw new Error('Masukkan faktor: 1 ' + oldUnit + ' setara dengan berapa ' + newUnit + '.');

    ensureStockCardInfrastructure_();
    const lock = acquireStockWriteLock_();
    let converted = false;
    try {
      const contexts = runNamedQuery_(
        'SELECT DISTINCT outlet, location FROM ' + stockCardTable_() + ' WHERE record_type = \'MOVEMENT\' AND (item_code = @code OR ((item_code IS NULL OR item_code = \'\') AND item_name = @name))',
        { code: itemCode, name: itemName }, { useQueryCache: false });
      const result = convertStockDefaultUnitBigQuery_(itemCode, itemName, newUnit, factor);
      converted = true;
      try {
        masterSheet.getRange(masterIndex + 2, 4).setValue(newUnit);
        const conversionRows = [
          { itemCode: itemCode, itemName: itemName, fromUnit: oldUnit, toUnit: newUnit, factor: factor },
          { itemCode: itemCode, itemName: itemName, fromUnit: newUnit, toUnit: oldUnit, factor: 1 / factor }
        ];
        const savedConversions = readStockUnitConversions_();
        Object.keys(savedConversions).forEach(function (key) {
          const row = savedConversions[key];
          if (row.itemCode !== itemCode) return;
          if (row.toUnit === oldUnit && row.fromUnit !== newUnit) {
            conversionRows.push({ itemCode: itemCode, itemName: itemName, fromUnit: row.fromUnit, toUnit: newUnit, factor: Number(row.factor) * factor });
          }
          if (row.fromUnit === oldUnit && row.toUnit !== newUnit) {
            conversionRows.push({ itemCode: itemCode, itemName: itemName, fromUnit: row.toUnit, toUnit: newUnit, factor: factor / Number(row.factor) });
          }
        });
        upsertStockConversionRows_(conversionRows, employee);
        SpreadsheetApp.flush();
      } catch (sheetError) {
        try { masterSheet.getRange(masterIndex + 2, 4).setValue(oldUnit); SpreadsheetApp.flush(); } catch (restoreSheetError) { console.error(restoreSheetError); }
        convertStockDefaultUnitBigQuery_(itemCode, itemName, oldUnit, 1 / factor);
        converted = false;
        throw new Error('Perubahan sheet gagal dan konversi stok telah dipulihkan: ' + sheetError.message);
      }
      try {
        ensureSheet_(CONFIG.STOCK_DEFAULT_UNIT_LOG_SHEET, ['CHANGED_AT', 'ITEM_CODE', 'ITEM_NAME', 'OLD_UNIT', 'NEW_UNIT', 'FACTOR_OLD_TO_NEW', 'CHANGED_BY'])
          .appendRow([new Date(), itemCode, itemName, oldUnit, newUnit, factor, employee.nik]);
      } catch (auditError) { console.error('Audit perubahan Unit Default gagal dicatat: ' + auditError.message); }

      removeScriptCacheKeys_(['stock-master-all', 'stock-master-active', 'stock-unit-conversions']);
      const cacheRows = contexts.map(function (row) { return { outlet: row.outlet, location: row.location, item_code: itemCode, item_name: itemName, record_type: 'MOVEMENT' }; });
      invalidateStockItemCachesForRows_(cacheRows);
      invalidateFastStockHistoryRows_(cacheRows);
      return { changed: true, itemCode: itemCode, itemName: itemName, oldUnit: oldUnit, newUnit: newUnit, factor: factor,
        affectedStockRows: Number(result.stock_rows || 0), affectedTransferRows: Number(result.transfer_rows || 0) };
    } catch (error) {
      if (converted) console.error('Konversi Unit Default sudah menyentuh BigQuery sebelum error: ' + error.message);
      if (/streaming buffer/i.test(String(error && error.message || error))) {
        throw new Error('Item ini baru saja memiliki transaksi. Tunggu sekitar 30 menit lalu ulangi Change Default Unit agar BigQuery dapat mengonversi seluruh baris dengan aman.');
      }
      throw error;
    } finally {
      lock.releaseLock();
    }
  });
}

function convertStockDefaultUnitBigQuery_(itemCode, itemName, newUnit, factor) {
  const active = stockCardTable_();
  const mirrorId = stockCardMirrorTableId_();
  const mirror = mirrorId && mirrorId !== stockCardTableId_() ? '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.' + mirrorId + '`' : '';
  const transfers = '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_transfers`';
  const balances = '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_balances`';
  const condition = '(item_code = @code OR ((item_code IS NULL OR item_code = \'\') AND item_name = @name))';
  let sql = 'BEGIN TRANSACTION; UPDATE ' + active + ' SET qty = qty * CAST(@factor AS FLOAT64), unit = @newUnit WHERE ' + condition + '; ';
  if (mirror) sql += 'UPDATE ' + mirror + ' SET qty = qty * CAST(@factor AS FLOAT64), unit = @newUnit WHERE ' + condition + '; ';
  sql += 'UPDATE ' + transfers + ' SET qty = qty * CAST(@factor AS FLOAT64), received_qty = IF(received_qty IS NULL, NULL, received_qty * CAST(@factor AS FLOAT64)), unit = @newUnit WHERE ' + condition + '; ' +
    'DELETE FROM ' + balances + ' WHERE ' + condition + '; ' +
    'INSERT INTO ' + balances + ' (outlet, location, item_code, item_name, current_qty, updated_at) ' +
    'WITH latest AS (SELECT * FROM ' + active + ' WHERE record_type = \'MOVEMENT\' QUALIFY ROW_NUMBER() OVER (PARTITION BY COALESCE(NULLIF(logical_id, \'\'), record_id) ORDER BY COALESCE(version, 1) DESC, created_at DESC) = 1) ' +
    'SELECT outlet, location, item_code, item_name, SUM(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END), CURRENT_TIMESTAMP() FROM latest WHERE ' + condition + ' GROUP BY outlet, location, item_code, item_name; ' +
    'COMMIT TRANSACTION; SELECT (SELECT COUNT(*) FROM ' + active + ' WHERE ' + condition + ') AS stock_rows, (SELECT COUNT(*) FROM ' + transfers + ' WHERE ' + condition + ') AS transfer_rows;';
  return runNamedQuery_(sql, { code: itemCode, name: itemName, newUnit: newUnit, factor: factor }, { useQueryCache: false })[0] || {};
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
    if (isShowcaseLocation_(fromLocation) || isShowcaseLocation_(toLocation)) {
      throw new Error('Transfer ke Showcase wajib melalui Input Transaksi Masuk pada item Showcase agar Product Store terpotong otomatis.');
    }
    const lock = acquireStockWriteLock_();
    try {
      const lines = validateTransferLines_(outlet, fromLocation, payload.items);
      const transferId = Utilities.getUuid(), now = new Date(), eventDate = todayIso_(), rows = [];
      lines.forEach(function (line) {
        allocateTransferLots_(outlet, fromLocation, line.item, line.qty).forEach(function (lot) {
          const userNote = line.note ? ' · ' + line.note : '';
          rows.push(stockTransferMovementRow_(transferId, outlet, fromLocation, line.item, 'OUT', lot.qty, 'Transfer Out',
            'Transfer To ' + toLocation + ' · Dari ' + fromLocation + userNote, lot.expiryDate, employee, now, eventDate, lot.productionDate));
          rows.push(stockTransferMovementRow_(transferId, outlet, toLocation, line.item, 'IN', lot.qty, 'Transfer In',
            'Transfer From ' + fromLocation + ' · Ke ' + toLocation + userNote, lot.expiryDate, employee, now, eventDate, lot.productionDate));
        });
      });
      insertStockCardRows_(rows);
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
    if (isShowcaseLocation_(fromLocation)) throw new Error('Item Showcase tidak dapat dikirim melalui transfer antar-outlet.');
    const lock = acquireStockWriteLock_();
    try {
      const lines = validateTransferLines_(fromOutlet, fromLocation, payload.items);
      const transferId = Utilities.getUuid(), now = new Date(), eventDate = todayIso_(), stockRows = [], pendingRows = [];
      const transferNo = stockTransferReceiptNumber_({ transferId: transferId, createdAt: now.toISOString() });
      const photoData = prepareTransferPhotoData_(payload.photos);
      lines.forEach(function (line) {
        allocateTransferLots_(fromOutlet, fromLocation, line.item, line.qty).forEach(function (lot) {
          stockRows.push(stockTransferMovementRow_(transferId, fromOutlet, fromLocation, line.item, 'OUT', lot.qty, 'Transfer Out',
            'Transfer To ' + toOutlet + ' · Dari ' + fromOutlet + ' / ' + fromLocation + ' · No Transfer ' + transferNo +
            (line.note ? ' · ' + line.note : ''), lot.expiryDate, employee, now, eventDate, lot.productionDate));
          const eventId = Utilities.getUuid();
          pendingRows.push({ insertId: eventId, json: {
            event_id: eventId, transfer_id: transferId, status: 'PENDING', from_outlet: fromOutlet, from_location: fromLocation,
            to_outlet: toOutlet, to_location: null, item_code: line.item.code, category: line.item.category,
            item_name: line.item.name, unit: line.item.unit, qty: lot.qty, note: line.note, expiry_date: lot.expiryDate || null,
            created_by: employee.nik, created_by_name: employee.name, created_at: now.getTime() / 1000, delivery_date: eventDate,
            photo_count: photoData.length
          }});
        });
      });
      if (pendingRows.length && photoData.length) pendingRows[0].json.photo_data_json = JSON.stringify(photoData);
      insertStockCardRows_(stockRows);
      insertAll_('stock_transfers', pendingRows);
      return { sent: true, transferId: transferId, fromOutlet: fromOutlet, toOutlet: toOutlet, itemCount: lines.length, photoCount: photoData.length };
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

function acceptInterOutletStockTransfer(token, transferId, requestedOutlet, receiveLocation, receivedItems, receiptDetails) {
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
    if (isShowcaseLocation_(receiveLocation)) {
      throw new Error('Transfer antar-outlet tidak dapat diterima langsung ke Showcase. Terima ke Store atau Gudang terlebih dahulu.');
    }
    receiptDetails = receiptDetails || {};
    const lock = acquireStockWriteLock_();
    try {
      const transfers = readPendingStockTransfers_(outlet).filter(function (transfer) { return transfer.transferId === transferId; });
      if (!transfers.length) throw new Error('Transfer sudah diproses atau tidak ditemukan untuk outlet ini.');
      const transfer = transfers[0], now = new Date();
      let eventDate = todayIso_();
      const receivedMap = {};
      (Array.isArray(receivedItems) ? receivedItems : []).forEach(function (line) {
        const lineId = cleanText_(line.lineId, 100), qty = Number(line.qty);
        if (!lineId || !isFinite(qty) || qty < 0) throw new Error('QTY diterima wajib berupa angka 0 atau lebih.');
        const receivedAt = new Date(String(receiptDetails.receivedAt || line.receivedAt || ''));
        const storageEnteredAt = new Date(String(receiptDetails.storageEnteredAt || line.storageEnteredAt || ''));
        const productTemperature = Number(line.productTemperature === '' || line.productTemperature === null || line.productTemperature === undefined ? receiptDetails.productTemperature : line.productTemperature);
        if (isNaN(receivedAt.getTime())) throw new Error('Waktu Terima wajib diisi.');
        if (isNaN(storageEnteredAt.getTime())) throw new Error('Waktu Masuk Storage wajib diisi.');
        if (storageEnteredAt.getTime() < receivedAt.getTime()) throw new Error('Waktu Masuk Storage tidak boleh lebih awal dari Waktu Terima.');
        if (!isFinite(productTemperature)) throw new Error('Suhu Produk wajib diisi dengan angka untuk setiap item.');
        receivedMap[lineId] = { qty: qty, receivedAt: receivedAt, storageEnteredAt: storageEnteredAt, productTemperature: productTemperature };
      });
      const firstReceivedKey = Object.keys(receivedMap)[0];
      if (firstReceivedKey) eventDate = Utilities.formatDate(receivedMap[firstReceivedKey].receivedAt, 'Asia/Jakarta', 'yyyy-MM-dd');
      const receiptNo = stockTransferReceiptNumber_(transfer), stockRows = [], acceptedRows = [], expiryWarnings = [];
      transfer.items.forEach(function (line) {
        const receipt = receivedMap[line.lineId];
        if (!receipt) throw new Error('Lengkapi QTY, waktu penerimaan, waktu masuk storage, dan suhu untuk setiap item.');
        const receivedQty = receipt.qty;
        const item = { code: line.code, category: line.category, name: line.name, unit: line.unit };
        if (receivedQty > 0.0000001) {
          const expiryWarning = incomingFefoWarning_(outlet, receiveLocation, item, line.expiryDate);
          if (expiryWarning) expiryWarnings.push(expiryWarning);
          stockRows.push(stockTransferMovementRow_(transferId, outlet, receiveLocation, item, 'IN', receivedQty, 'Transfer In',
            'Transfer From ' + transfer.fromOutlet + ' / ' + transfer.fromLocation + ' · Ke ' + outlet + ' / ' + receiveLocation +
            ' · No Transfer ' + receiptNo + ' · QTY dikirim ' + formatQty_(line.qty) +
            (line.note ? ' · ' + line.note : '') + (expiryWarning ? ' | FEFO ALERT: expiry masuk ' + expiryWarning.incomingExpiryDate + ' lebih cepat dari stok existing ' + expiryWarning.existingExpiryDate : ''), line.expiryDate, employee, now, eventDate, line.productionDate));
        }
        const eventId = Utilities.getUuid();
        acceptedRows.push({ insertId: eventId, json: {
          event_id: eventId, transfer_id: transferId, status: 'ACCEPTED', from_outlet: transfer.fromOutlet, from_location: transfer.fromLocation,
          to_outlet: outlet, to_location: receiveLocation, item_code: line.code, category: line.category, item_name: line.name,
          unit: line.unit, qty: Number(line.qty || 0), received_qty: receivedQty, note: line.note || '', expiry_date: line.expiryDate || null,
          created_by: transfer.createdBy, created_by_name: transfer.createdByName, created_at: now.getTime() / 1000,
          accepted_by: employee.nik, accepted_by_name: employee.name, accepted_at: now.getTime() / 1000,
          received_at: receipt.receivedAt.getTime() / 1000, storage_entered_at: receipt.storageEnteredAt.getTime() / 1000,
          product_temperature: receipt.productTemperature, receipt_no: receiptNo, delivery_date: transfer.deliveryDate || null
        }});
        line.receivedQty = receivedQty;
        line.receivedAt = receipt.receivedAt.toISOString();
        line.storageEnteredAt = receipt.storageEnteredAt.toISOString();
        line.productTemperature = receipt.productTemperature;
      });
      if (stockRows.length) insertStockCardRows_(stockRows);
      insertAll_('stock_transfers', acceptedRows);
      transfer.status = 'ACCEPTED';
      transfer.toLocation = receiveLocation;
      transfer.acceptedBy = employee.nik;
      transfer.acceptedByName = employee.name;
      transfer.acceptedAt = now.toISOString();
      transfer.receivedAt = transfer.items.length ? transfer.items[0].receivedAt : '';
      transfer.storageEnteredAt = transfer.items.length ? transfer.items[0].storageEnteredAt : '';
      transfer.productTemperature = transfer.items.length ? transfer.items[0].productTemperature : null;
      transfer.receiptNo = receiptNo;
      return { accepted: true, transferId: transferId, itemCount: transfer.items.length, location: receiveLocation, receipt: transfer, expiryWarnings: expiryWarnings };
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

    const item = findStockItemForLocation_(location, payload.itemCode || payload.itemName);
    const direction = String(payload.direction || '').toUpperCase();
    const movementType = cleanText_(payload.movementType, 60);
    const qty = Number(payload.qty);
    const productionDate = normalizeDate_(payload.productionDate, false);
    const expiryDate = normalizeDate_(payload.expiryDate, false);
    if (['IN', 'OUT'].indexOf(direction) < 0) throw new Error('Arah transaksi tidak valid.');
    if (String(payload.qty === null || payload.qty === undefined ? '' : payload.qty).trim() === '' || !isFinite(qty) || qty < 0) throw new Error('QTY harus berupa angka 0 atau lebih.');
    validateMovementType_(direction, movementType);
    if (isShowcaseLocation_(location) && direction === 'IN') {
      return saveShowcaseInboundMovement_(outlet, item, qty, payload, employee);
    }

    const current = getCurrentStock_(outlet, location, item.code, item.name);
    if (movementType === 'Opening Stock' && Math.abs(current.qty) > 0.0000001) {
      throw new Error('Input stok awal hanya tersedia ketika Current QTY masih 0.');
    }
    if (direction === 'OUT' && qty > current.qty && movementType !== 'Terjual') {
      throw new Error('Stok tidak mencukupi. Current QTY: ' + formatQty_(current.qty));
    }

    const now = new Date();
    const eventDate = normalizeDate_(payload.eventDate, true);
    let info = ensureTransferMovementInfo_(direction, movementType, payload.info);
    if (movementType === 'Others' && !info) throw new Error('Catatan wajib diisi ketika Jenis Transaksi Others dipilih.');
    const expiryWarning = direction === 'IN' ? incomingFefoWarning_(outlet, location, item, expiryDate) : null;
    if (expiryWarning) info = cleanText_((info ? info + ' | ' : '') + 'FEFO ALERT: expiry masuk ' + expiryWarning.incomingExpiryDate + ' lebih cepat dari stok existing ' + expiryWarning.existingExpiryDate, 500);
    const logicalId = Utilities.getUuid();
    const recordId = Utilities.getUuid();
    insertStockCardRows_([{ insertId: recordId, json: {
      record_id: recordId, logical_id: logicalId, version: 1, record_type: 'MOVEMENT', outlet: outlet, location: location,
      item_code: item.code, category: item.category, item_name: item.name, unit: item.unit, direction: direction, qty: qty,
      movement_type: movementType, info: info, production_date: productionDate || null, expiry_date: expiryDate || null,
      event_date: eventDate, created_at: now.getTime() / 1000, created_by: employee.nik
    }}]);
    const nextQty = direction === 'IN' ? current.qty + qty : current.qty - qty;
    return {
      saved: true, outlet: outlet, location: location, itemCode: item.code, itemName: item.name, currentQty: nextQty,
      movement: { recordId: recordId, logicalId: logicalId, version: 1, date: eventDate, direction: direction, qty: qty, movementType: movementType, info: info, productionDate: productionDate, expiryDate: expiryDate, createdBy: employee.nik, createdByUser: employee.name + ' · ' + employee.nik, createdAt: now.toISOString() },
      expiryWarning: expiryWarning
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
    const item = findStockItemForLocation_(location, payload.itemCode || payload.itemName);
    const logicalId = cleanText_(payload.logicalId, 100);
    if (!logicalId) throw new Error('Transaksi yang akan diedit tidak ditemukan. Muat ulang Stock Card lalu coba lagi.');

    const lock = acquireStockWriteLock_();
    try {
      const previousRows = readLatestStockHistory_(outlet, location, item, logicalId);
      if (!previousRows.length) throw new Error('Transaksi tidak ditemukan atau sudah berubah. Muat ulang Stock Card lalu coba lagi.');
      const previous = previousRows[0];
      if (previous.systemGenerated) throw new Error('Transfer otomatis Showcase tidak dapat diedit terpisah agar saldo Store tetap konsisten. Buat transaksi koreksi pada Showcase jika diperlukan.');
      let direction = String(payload.direction || '').toUpperCase();
      let movementType = cleanText_(payload.movementType, 60);
      const qty = Number(payload.qty);
      if (previous.movementType === 'Opening Stock') {
        direction = 'IN';
        movementType = 'Opening Stock';
      }
      if (['IN', 'OUT'].indexOf(direction) < 0) throw new Error('Arah transaksi tidak valid.');
      if (String(payload.qty === null || payload.qty === undefined ? '' : payload.qty).trim() === '' || !isFinite(qty) || qty < 0) throw new Error('QTY harus berupa angka 0 atau lebih.');
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
      const productionDate = normalizeDate_(payload.productionDate, false);
      const expiryDate = normalizeDate_(payload.expiryDate, false);
      if (movementType === 'Stock Adjustment' && !expiryDate) throw new Error('Expiry Date wajib diisi untuk Stock Adjustment Masuk maupun Keluar.');
      const info = ensureTransferMovementInfo_(direction, movementType, payload.info);
      if (movementType === 'Others' && !info) throw new Error('Catatan wajib diisi ketika Jenis Transaksi Others dipilih.');
      insertStockCardRows_([{ insertId: recordId, json: {
        record_id: recordId, logical_id: logicalId, version: version, record_type: 'MOVEMENT', outlet: outlet, location: location,
        item_code: item.code, category: item.category, item_name: item.name, unit: item.unit, direction: direction, qty: qty,
        movement_type: movementType, info: info, production_date: productionDate || null, expiry_date: expiryDate || null,
        event_date: eventDate, created_at: now.getTime() / 1000, created_by: employee.nik
      }}]);
      return {
        saved: true, edited: true, outlet: outlet, location: location, itemCode: item.code, itemName: item.name, currentQty: nextQty,
        movement: { recordId: recordId, logicalId: logicalId, version: version, date: eventDate, direction: direction, qty: qty, movementType: movementType, info: info, productionDate: productionDate, expiryDate: expiryDate, createdBy: employee.nik, createdByUser: employee.name + ' · ' + employee.nik, createdAt: now.toISOString() }
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
    const item = findStockItemForLocation_(context.location, payload.itemCode || payload.itemName);
    const targetQty = Number(payload.targetQty);
    const info = cleanText_(payload.info, 300);
    if (!isFinite(targetQty) || targetQty < 0) throw new Error('Hasil stock fisik harus 0 atau lebih.');
    if (info.length < 3) throw new Error('Catatan penyesuaian wajib diisi agar perubahan dapat diaudit.');
    const rawLots = Array.isArray(payload.lots) ? payload.lots : [];
    if (!rawLots.length && targetQty > 0.0000001) throw new Error('Isi minimal satu baris lot stok.');
    const lots = rawLots.map(function (raw, index) {
      const qty = Number(raw.qty);
      if (!isFinite(qty) || qty <= 0) throw new Error('QTY lot baris ' + (index + 1) + ' wajib lebih besar dari 0.');
      return { qty: qty, arrivalDate: normalizeDate_(raw.arrivalDate, true), stockInDate: normalizeDate_(raw.stockInDate, true), expiryDate: normalizeDate_(raw.expiryDate, true) };
    });
    const lotTotal = lots.reduce(function (sum, lot) { return sum + lot.qty; }, 0);
    if (Math.abs(lotTotal - targetQty) > 0.0000001) throw new Error('Total QTY lot harus sama dengan hasil stock fisik (' + formatQty_(targetQty) + ').');

    const lock = acquireStockWriteLock_();
    try {
      const current = getCurrentStock_(context.outlet, context.location, item.code, item.name);
      const direction = targetQty >= current.qty ? 'IN' : 'OUT';
      const adjustmentQty = Math.abs(targetQty - current.qty);
      const now = new Date();
      const logicalId = Utilities.getUuid();
      const recordId = Utilities.getUuid();
      const eventDate = normalizeDate_(payload.eventDate, true);
      const adjustmentExpiry = lots.length ? lots[0].expiryDate : null;
      const rows = [];
      if (adjustmentQty > 0.0000001) rows.push({ insertId: recordId, json: {
        record_id: recordId, logical_id: logicalId, version: 1, record_type: 'MOVEMENT',
        outlet: context.outlet, location: context.location, item_code: item.code, category: item.category,
        item_name: item.name, unit: item.unit, direction: direction, qty: adjustmentQty,
        movement_type: 'Stock Adjustment', info: info, expiry_date: adjustmentExpiry, event_date: eventDate,
        created_at: now.getTime() / 1000, created_by: context.employee.nik
      }});
      const lotRecordId = Utilities.getUuid(), lotLogicalId = Utilities.getUuid();
      const lotInfo = JSON.stringify({ note: info, lots: lots });
      rows.push({ insertId: lotRecordId, json: {
        record_id: lotRecordId, logical_id: lotLogicalId, version: 1, record_type: 'MOVEMENT',
        outlet: context.outlet, location: context.location, item_code: item.code, category: item.category,
        item_name: item.name, unit: item.unit, direction: 'LOT', qty: targetQty,
        movement_type: 'Lot Balance Override', info: lotInfo, event_date: eventDate,
        created_at: (now.getTime() + 1) / 1000, created_by: context.employee.nik
      }});
      insertStockCardRows_(rows);
      return {
        saved: true, adjusted: true, itemCode: item.code, currentQty: targetQty,
        movement: {
          recordId: recordId, logicalId: logicalId, version: 1, date: eventDate, direction: direction, qty: adjustmentQty,
          movementType: 'Stock Adjustment', info: info, expiryDate: adjustmentExpiry, createdBy: context.employee.nik,
          createdByUser: context.employee.name + ' · ' + context.employee.nik, createdAt: now.toISOString()
        },
        movements: (adjustmentQty > 0.0000001 ? [{ recordId: recordId, logicalId: logicalId, version: 1, date: eventDate, direction: direction, qty: adjustmentQty, movementType: 'Stock Adjustment', info: info, expiryDate: adjustmentExpiry, createdBy: context.employee.nik, createdAt: now.toISOString() }] : []).concat([{ recordId: lotRecordId, logicalId: lotLogicalId, version: 1, date: eventDate, direction: 'LOT', qty: targetQty, movementType: 'Lot Balance Override', info: lotInfo, createdBy: context.employee.nik, createdAt: new Date(now.getTime() + 1).toISOString() }])
      };
    } finally {
      lock.releaseLock();
    }
  });
}

function completeStockExpiryLots(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const item = findStockItemForLocation_(context.location, payload.itemCode || payload.itemName);
    const allocations = normalizeStockExpiryAllocations_(payload.lots, item.code);

    const lock = acquireStockWriteLock_();
    try {
      const requestId = /^[a-f0-9]{32,64}$/i.test(String(payload.requestId || '')) ? String(payload.requestId).toLowerCase() : '';
      const completed = buildStockExpiryCompletionRow_(context, item, allocations, Date.now() / 1000,
        payload.sourceFile ? 'Lengkapi Expired Date melalui upload Excel' : 'Lengkapi Expired Date melalui notifikasi', null, null,
        { allowAlreadyComplete: Boolean(payload.allowAlreadyComplete), requestId: requestId, sourceFile: cleanText_(payload.sourceFile, 180) });
      if (completed.row) insertStockCardRows_([completed.row]);
      return { saved: true, alreadyCompleted: Boolean(completed.alreadyCompleted), itemCode: item.code, itemName: item.name, completedQty: completed.completedQty };
    } finally {
      lock.releaseLock();
    }
  });
}

function normalizeStockExpiryAllocations_(lots, itemCode) {
  const label = itemCode ? ' untuk ' + itemCode : '';
  const allocations = (Array.isArray(lots) ? lots : []).map(function (raw, index) {
    const qty = Number(raw.qty), expiryDate = normalizeDate_(raw.expiryDate, true);
    if (!isFinite(qty) || qty <= 0) throw new Error('QTY baris ' + (index + 1) + label + ' wajib lebih besar dari 0.');
    return { qty: qty, expiryDate: expiryDate };
  });
  if (!allocations.length) throw new Error('Isi minimal satu pembagian QTY dan Expired Date' + label + '.');
  return allocations;
}

function buildStockExpiryCompletionRow_(context, item, allocations, createdAt, note, remainingLotsOverride, excludedCategoriesOverride, options) {
  options = options || {};
  const excludedCategories = excludedCategoriesOverride || readStockNoExpiryCategoryMap_();
  if (excludedCategories[normalizeStockCategory_(item.category)]) {
    throw new Error('Category ' + item.category + ' tidak memerlukan Expired Date.');
  }
  const remainingLots = remainingLotsOverride || readRemainingStockLots_(context.outlet, context.location, item.code, item.name);
  const datedLots = remainingLots.filter(function (lot) { return Boolean(String(lot.expiryDate || '').slice(0, 10)); });
  const blankLots = remainingLots.filter(function (lot) { return !String(lot.expiryDate || '').slice(0, 10); });
  const missingQty = blankLots.reduce(function (sum, lot) { return sum + Number(lot.qty || 0); }, 0);
  const allocationTotal = allocations.reduce(function (sum, lot) { return sum + Number(lot.qty || 0); }, 0);
  if (missingQty <= 0.0000001) {
    if (options.allowAlreadyComplete) return { completedQty: 0, row: null, alreadyCompleted: true };
    throw new Error('Expired Date ' + item.code + ' sudah lengkap. Download ulang daftar terbaru.');
  }
  if (!options.allowQuantityMismatch && Math.abs(allocationTotal - missingQty) > 0.0000001) {
    throw new Error('Total QTY ' + item.code + ' harus ' + formatQty_(missingQty) + ' ' + item.unit + ', tetapi file berisi ' + formatQty_(allocationTotal) + '.');
  }
  const completedLots = datedLots.map(function (lot) {
    return { qty: Number(lot.qty), arrivalDate: lot.sourceDate || todayIso_(), stockInDate: lot.showcaseDate || lot.sourceDate || todayIso_(), expiryDate: String(lot.expiryDate).slice(0, 10) };
  });
  let allocationIndex = 0, allocationRemaining = allocations[0].qty;
  blankLots.forEach(function (source) {
    let sourceRemaining = Number(source.qty || 0);
    while (sourceRemaining > 0.0000001 && allocationIndex < allocations.length) {
      const used = Math.min(sourceRemaining, allocationRemaining);
      completedLots.push({ qty: used, arrivalDate: source.sourceDate || todayIso_(), stockInDate: source.showcaseDate || source.sourceDate || todayIso_(), expiryDate: allocations[allocationIndex].expiryDate });
      sourceRemaining -= used;
      allocationRemaining -= used;
      if (allocationRemaining <= 0.0000001) {
        allocationIndex++;
        allocationRemaining = allocationIndex < allocations.length ? allocations[allocationIndex].qty : 0;
      }
    }
    // Jika QTY Excel lebih kecil, pertahankan sisa lot tanpa Expired Date.
    // Dengan begitu saldo tidak berubah dan sisanya tetap muncul untuk dilengkapi.
    if (sourceRemaining > 0.0000001) {
      completedLots.push({ qty: sourceRemaining, arrivalDate: source.sourceDate || todayIso_(),
        stockInDate: source.showcaseDate || source.sourceDate || todayIso_(), expiryDate: '' });
    }
  });
  const recordId = options.requestId ? 'EXPIRY-' + options.requestId : Utilities.getUuid(), logicalId = recordId;
  const totalQty = completedLots.reduce(function (sum, lot) { return sum + Number(lot.qty || 0); }, 0);
  return { completedQty: Math.min(missingQty, allocationTotal), row: { insertId: recordId, json: {
    record_id: recordId, logical_id: logicalId, version: 1, record_type: 'MOVEMENT',
    outlet: context.outlet, location: context.location, item_code: item.code, category: item.category,
    item_name: item.name, unit: item.unit, direction: 'LOT', qty: totalQty,
    movement_type: 'Lot Balance Override', info: JSON.stringify({ note: note, lots: completedLots }), event_date: todayIso_(),
    created_at: createdAt, created_by: context.employee.nik, source_file: options.sourceFile || null,
    source_hash: options.requestId || null, source_row: null
  }}};
}

function downloadMissingExpiryTemplate(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const missing = readStockExpiryAlerts_(context.outlet, context.location).missingExpiry || [];
    if (!missing.length) throw new Error('Semua item sudah memiliki Expired Date. Tidak ada daftar yang perlu di-download.');
    let workbook = null;
    try {
      workbook = SpreadsheetApp.create('TEMP_MISSING_EXPIRY_' + Utilities.getUuid());
      const sheet = workbook.getSheets()[0];
      sheet.setName('Expired Date');
      sheet.getRange('A1:F1').merge().setValue('ITEM TANPA EXPIRED DATE').setBackground('#7f1d32').setFontColor('#ffffff').setFontWeight('bold').setFontSize(15);
      sheet.getRange('A2').setValue('OUTLET').setFontWeight('bold');
      sheet.getRange('B2').setValue(context.outlet);
      sheet.getRange('C2').setValue('LOKASI').setFontWeight('bold');
      sheet.getRange('D2').setValue(context.location);
      sheet.getRange('E2').setValue('DIBUAT').setFontWeight('bold');
      sheet.getRange('F2').setValue(new Date()).setNumberFormat('dd/mm/yyyy hh:mm');
      sheet.getRange('A3:F3').merge().setValue('Isi hanya kolom kuning QTY dan EXPIRED DATE. Untuk beberapa tanggal pada satu item, salin baris item lalu bagi QTY. Total QTY per item harus sama dengan QTY TANPA EXPIRED.');
      sheet.getRange('A4:F4').merge().setValue('Kolom EXPIRED DATE wajib bertipe Date. Jangan mengubah nama kolom, kode item, unit, outlet, atau lokasi.');
      const headers = ['ITEM CODE', 'ITEM NAME', 'UNIT', 'QTY TANPA EXPIRED', 'QTY', 'EXPIRED DATE'];
      sheet.getRange(5, 1, 1, headers.length).setValues([headers]).setBackground('#9f172b').setFontColor('#ffffff').setFontWeight('bold');
      const values = missing.map(function (item) { return [item.code, item.name, item.unit, Number(item.qty || 0), Number(item.qty || 0), '']; });
      sheet.getRange(6, 1, values.length, headers.length).setValues(values).setVerticalAlignment('middle');
      sheet.getRange(6, 1, values.length, 4).setBackground('#f3f1f2');
      sheet.getRange(6, 5, values.length, 2).setBackground('#fff4bf');
      sheet.getRange(6, 4, values.length, 2).setNumberFormat('#,##0.00');
      sheet.getRange(6, 6, values.length, 1).setNumberFormat('dd/mm/yyyy');
      sheet.getRange(6, 5, values.length, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).setHelpText('QTY wajib berupa angka lebih besar dari 0.').build());
      sheet.getRange(6, 6, values.length, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Expired Date wajib berupa tanggal yang valid.').build());
      sheet.setFrozenRows(5);
      sheet.setColumnWidth(1, 125); sheet.setColumnWidth(2, 300); sheet.setColumnWidth(3, 90);
      sheet.setColumnWidth(4, 150); sheet.setColumnWidth(5, 110); sheet.setColumnWidth(6, 145);
      sheet.getRange(1, 1, values.length + 5, 6).setWrap(true);
      SpreadsheetApp.flush();
      const response = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + workbook.getId() + '/export?format=xlsx', {
        method: 'get', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
      });
      if (response.getResponseCode() !== 200) throw new Error('Export daftar merespons HTTP ' + response.getResponseCode() + '.');
      const safeOutlet = String(context.outlet || 'Outlet').replace(/[^A-Za-z0-9_-]+/g, '_');
      const blob = response.getBlob().setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .setName('Item_Tanpa_Expired_' + safeOutlet + '_' + todayIso_() + '.xlsx');
      const bytes = blob.getBytes();
      if (bytes.length < 4 || bytes[0] !== 80 || bytes[1] !== 75) throw new Error('Hasil download bukan file XLSX yang valid.');
      return { fileName: blob.getName(), mimeType: blob.getContentType(), data: Utilities.base64Encode(bytes), itemCount: missing.length };
    } finally {
      if (workbook) {
        try { DriveApp.getFileById(workbook.getId()).setTrashed(true); } catch (cleanupError) {}
      }
    }
  });
}

function parseMissingExpiryExcel_(base64, fileName) {
  const cells = extractReportCells_(base64, fileName, 'Expired Date');
  const header = findReportHeader_(cells, ['ITEM CODE', 'ITEM NAME', 'UNIT', 'QTY TANPA EXPIRED', 'QTY', 'EXPIRED DATE']);
  const fileOutlet = cleanText_(cells.B2, 100).trim().toUpperCase();
  const fileLocation = cleanText_(cells.D2, 100).trim();
  if (!fileOutlet || !fileLocation) throw new Error('Identitas OUTLET atau LOKASI pada template tidak ditemukan. Download ulang daftar terbaru.');
  const grouped = {}, errors = [];
  const rows = reportDataRows_(cells, header, 'ITEM CODE');
  if (!rows.length) throw new Error('File tidak memuat item untuk diproses. Download ulang daftar terbaru.');
  if (rows.length > 1000) throw new Error('File memuat lebih dari 1.000 baris. Pecah upload menjadi beberapa file.');
  rows.forEach(function (rowNumber) {
    const code = cleanText_(reportCell_(cells, header, 'ITEM CODE', rowNumber), 100).trim().toUpperCase();
    const qty = parseReportNumber_(reportCell_(cells, header, 'QTY', rowNumber));
    const rawDate = reportCell_(cells, header, 'EXPIRED DATE', rowNumber);
    try {
      if (!code) throw new Error('ITEM CODE kosong.');
      if (!isFinite(qty) || qty <= 0) throw new Error('QTY wajib berupa angka lebih besar dari 0.');
      const dateText = String(rawDate === null || rawDate === undefined ? '' : rawDate).trim();
      if (!/^\d+(?:\.\d+)?$/.test(dateText)) throw new Error('EXPIRED DATE wajib diisi sebagai cell Date, bukan teks.');
      const expiryDate = parseReportDate_(dateText, 'TRANSACTION', rowNumber, 'Expired Date');
      if (!grouped[code]) grouped[code] = [];
      grouped[code].push({ qty: qty, expiryDate: expiryDate });
    } catch (error) {
      errors.push('Baris ' + rowNumber + ' (' + (code || 'tanpa kode') + '): ' + error.message);
    }
  });
  if (errors.length) throw new Error(errors.slice(0, 10).join('\n') + (errors.length > 10 ? '\n...dan ' + (errors.length - 10) + ' error lainnya.' : ''));
  return { grouped: grouped, outlet: fileOutlet, location: fileLocation };
}

function prepareMissingExpiryExcelLegacy_(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const parsed = parseMissingExpiryExcel_(payload.base64, payload.fileName);
    if (parsed.outlet !== String(context.outlet || '').trim().toUpperCase() || parsed.location.toLowerCase() !== String(context.location || '').trim().toLowerCase()) {
      throw new Error('File ini dibuat untuk ' + parsed.outlet + ' · ' + parsed.location + ', bukan ' + context.outlet + ' · ' + context.location + '. Download daftar dari outlet dan lokasi yang sedang dipilih.');
    }
    const grouped = parsed.grouped;
    const codes = Object.keys(grouped);
    if (!codes.length) throw new Error('Tidak ada baris Expired Date yang dapat diproses.');
    const excludedCategories = readStockNoExpiryCategoryMap_(), sourceHash = digest_(String(payload.base64 || ''));
    const requests = codes.map(function (code) {
      const item = findStockItemForLocation_(context.location, code);
      if (excludedCategories[normalizeStockCategory_(item.category)]) throw new Error('Category ' + item.category + ' tidak memerlukan Expired Date.');
      return {
        code: item.code, name: item.name, unit: item.unit,
        lots: normalizeStockExpiryAllocations_(grouped[code], code),
        requestId: digest_(sourceHash + '|' + context.outlet + '|' + context.location + '|' + item.code)
      };
    });
    return { prepared: true, itemCount: requests.length, sourceFile: cleanText_(payload.fileName, 180), items: requests };
  });
}

function uploadMissingExpiryExcel(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const fileName = cleanText_(payload.fileName, 180);
    if (!/\.xlsx$/i.test(fileName)) throw new Error('Pilih file hasil Download List Excel dengan format .xlsx.');
    let bytes;
    try { bytes = Utilities.base64Decode(String(payload.base64 || '').replace(/^data:[^,]+,/, '')); }
    catch (error) { throw new Error('File Excel tidak dapat dibaca. Download ulang daftar terbaru.'); }
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Ukuran file harus lebih dari 0 dan maksimal 10 MB.');
    if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error('File bukan workbook Excel .xlsx yang valid.');
    const sourceFile = DriveApp.createFile(Utilities.newBlob(bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'TEMP_EXPIRY_' + Utilities.getUuid() + '.xlsx'));
    const jobId = Utilities.getUuid(), now = new Date().toISOString();
    writeMissingExpiryJob_({ jobId: jobId, ownerNik: context.employee.nik, ownerName: context.employee.name,
      outlet: context.outlet, location: context.location, sourceFileName: fileName, sourceDriveId: sourceFile.getId(), preparedDriveId: '',
      status: 'QUEUED', stage: 'File diterima. Menunggu proses background.', progress: 3, processed: 0, total: 0, saved: 0, skipped: 0,
      retryCount: 0, error: '', createdAt: now, updatedAt: now });
    try { ensureStockMaintenanceTrigger_(); }
    catch (triggerError) { console.error('Trigger maintenance Expired Date belum tersedia: ' + triggerError.message); }
    scheduleMissingExpiryWorker_();
    return { jobId: jobId, status: 'QUEUED', progress: 3, stage: 'File diterima. Proses background disiapkan.' };
  });
}

function missingExpiryJobKey_(jobId) { return 'expiry-upload-job-' + String(jobId || '').trim(); }

function writeMissingExpiryJob_(job) {
  job.updatedAt = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty(missingExpiryJobKey_(job.jobId), JSON.stringify(job));
  return job;
}

function readMissingExpiryJob_(jobId) {
  const raw = PropertiesService.getScriptProperties().getProperty(missingExpiryJobKey_(jobId));
  return raw ? JSON.parse(raw) : null;
}

function missingExpiryJobView_(job) {
  const progress = job.status === 'COMPLETE' ? 100 : job.status === 'FAILED' ? Math.max(5, Number(job.progress || 0)) :
    job.total ? Math.min(98, 20 + Math.round(Number(job.processed || 0) / job.total * 78)) : Number(job.progress || 5);
  return { jobId: job.jobId, status: job.status, stage: job.stage, progress: progress, processed: Number(job.processed || 0),
    total: Number(job.total || 0), saved: Number(job.saved || 0), skipped: Number(job.skipped || 0), error: String(job.error || '') };
}

function getMissingExpiryUploadStatus(token, jobId) {
  return safe_(function () {
    const session = requireSession_(token), job = readMissingExpiryJob_(cleanText_(jobId, 100));
    if (!job || job.ownerNik !== session.nik) throw new Error('Job upload tidak ditemukan atau bukan milik akun ini.');
    return missingExpiryJobView_(job);
  });
}

function scheduleMissingExpiryWorker_() {
  try {
    const exists = ScriptApp.getProjectTriggers().some(function (trigger) { return trigger.getHandlerFunction() === 'processMissingExpiryUploadJobs'; });
    if (!exists) ScriptApp.newTrigger('processMissingExpiryUploadJobs').timeBased().after(1000).create();
  } catch (error) { console.error('Worker Expired Date menunggu trigger maintenance: ' + error.message); }
}

function prepareMissingExpiryJob_(job) {
  job.status = 'PREPARING'; job.stage = 'Membaca dan memvalidasi workbook Excel.'; job.progress = 8; writeMissingExpiryJob_(job);
  const source = DriveApp.getFileById(job.sourceDriveId), base64 = Utilities.base64Encode(source.getBlob().getBytes());
  const parsed = parseMissingExpiryExcel_(base64, job.sourceFileName);
  if (parsed.outlet !== String(job.outlet || '').trim().toUpperCase() || parsed.location.toLowerCase() !== String(job.location || '').trim().toLowerCase()) {
    throw new Error('File ini dibuat untuk ' + parsed.outlet + ' · ' + parsed.location + ', bukan ' + job.outlet + ' · ' + job.location + '.');
  }
  const codes = Object.keys(parsed.grouped);
  if (!codes.length) throw new Error('Tidak ada baris Expired Date yang dapat diproses.');
  const excludedCategories = readStockNoExpiryCategoryMap_(), sourceHash = digest_(base64);
  const requests = codes.map(function (code) {
    const item = findStockItemForLocation_(job.location, code);
    if (excludedCategories[normalizeStockCategory_(item.category)]) throw new Error('Category ' + item.category + ' tidak memerlukan Expired Date.');
    return { code: item.code, name: item.name, unit: item.unit, lots: normalizeStockExpiryAllocations_(parsed.grouped[code], code),
      requestId: digest_(sourceHash + '|' + job.outlet + '|' + job.location + '|' + item.code) };
  });
  const preparedFile = DriveApp.createFile(Utilities.newBlob(JSON.stringify(requests), 'application/json', 'TEMP_EXPIRY_JOB_' + job.jobId + '.json'));
  job.preparedDriveId = preparedFile.getId(); job.total = requests.length; job.status = 'PROCESSING';
  job.stage = 'Validasi selesai. Menyimpan item 1/' + requests.length + '.'; job.progress = 20;
  try { source.setTrashed(true); } catch (cleanupError) {}
  job.sourceDriveId = '';
  return writeMissingExpiryJob_(job);
}

function cleanupMissingExpiryJobFiles_(job) {
  [job.sourceDriveId, job.preparedDriveId].filter(Boolean).forEach(function (id) {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (error) {}
  });
  job.sourceDriveId = ''; job.preparedDriveId = '';
}

function processMissingExpiryJobChunk_(job) {
  if (!job.preparedDriveId) {
    prepareMissingExpiryJob_(job);
    // Pisahkan fase parsing Excel dan penulisan BigQuery agar satu eksekusi
    // tidak menghabiskan seluruh batas waktu Apps Script.
    return job;
  }
  const requests = JSON.parse(DriveApp.getFileById(job.preparedDriveId).getBlob().getDataAsString('UTF-8'));
  const context = { outlet: job.outlet, location: job.location, employee: { nik: job.ownerNik, name: job.ownerName } };
  const batchSize = 20, startIndex = Number(job.processed || 0), batch = requests.slice(startIndex, startIndex + batchSize);
  const items = batch.map(function (request) { return findStockItemForLocation_(job.location, request.code); });
  job.status = 'PROCESSING';
  job.stage = 'Membaca saldo lot item ' + (startIndex + 1) + '-' + (startIndex + batch.length) + ' dari ' + requests.length + '.';
  job.progress = 20 + Math.round(startIndex / requests.length * 78);
  writeMissingExpiryJob_(job);
  const lotsByCode = readRemainingStockLotsBatch_(job.outlet, job.location, items), rows = [];
  let batchSaved = 0, batchSkipped = 0;
  batch.forEach(function (request, index) {
    const item = items[index], code = String(item.code || '').trim().toUpperCase();
    const completed = buildStockExpiryCompletionRow_(context, item, normalizeStockExpiryAllocations_(request.lots, item.code),
      Date.now() / 1000 + index / 1000, 'Lengkapi Expired Date melalui upload Excel background', lotsByCode[code] || [], null,
      { allowAlreadyComplete: true, allowQuantityMismatch: true, requestId: request.requestId, sourceFile: job.sourceFileName });
    if (completed.row) { rows.push(completed.row); batchSaved++; } else batchSkipped++;
  });
  job.stage = 'Menyimpan item ' + (startIndex + 1) + '-' + (startIndex + batch.length) + ' dari ' + requests.length + '.';
  writeMissingExpiryJob_(job);
  if (rows.length) {
    const lock = acquireStockWriteLock_();
    try { insertStockCardRows_(rows); }
    finally { lock.releaseLock(); }
  }
  job.processed = startIndex + batch.length;
  job.saved = Number(job.saved || 0) + batchSaved;
  job.skipped = Number(job.skipped || 0) + batchSkipped;
  job.retryCount = 0;
  writeMissingExpiryJob_(job);
  if (job.processed >= requests.length) {
    job.status = 'COMPLETE'; job.stage = 'Semua item berhasil diproses.'; job.progress = 100;
    cleanupMissingExpiryJobFiles_(job); writeMissingExpiryJob_(job);
  }
  return job;
}

function processMissingExpiryUploadJobs() {
  try {
    ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === 'processMissingExpiryUploadJobs'; })
      .forEach(function (trigger) { try { ScriptApp.deleteTrigger(trigger); } catch (error) {} });
    const properties = PropertiesService.getScriptProperties(), all = properties.getProperties(), jobs = [];
    Object.keys(all).filter(function (key) { return key.indexOf('expiry-upload-job-') === 0; }).forEach(function (key) {
      try {
        const job = JSON.parse(all[key]), age = Date.now() - new Date(job.updatedAt || job.createdAt || 0).getTime();
        if ((job.status === 'COMPLETE' || job.status === 'FAILED') && age > 86400000) properties.deleteProperty(key);
        else if (['QUEUED', 'PREPARING', 'PROCESSING'].indexOf(job.status) >= 0) jobs.push(job);
      } catch (error) { properties.deleteProperty(key); }
    });
    jobs.sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
    if (!jobs.length) return { processed: false };
    let job = jobs[0];
    try { job = processMissingExpiryJobChunk_(job); }
    catch (error) {
      job.retryCount = Number(job.retryCount || 0) + 1;
      if (job.retryCount < 4 && /penguncian|sedang menyimpan|rate|backend|timeout|waktu/i.test(String(error.message || error))) {
        job.status = 'QUEUED'; job.stage = 'Gangguan sementara. Sistem mencoba ulang otomatis (' + job.retryCount + '/3).'; job.error = ''; writeMissingExpiryJob_(job);
      } else {
        job.status = 'FAILED'; job.stage = 'Proses berhenti pada item ' + (job.processed + 1) + '.'; job.error = String(error.message || error);
        cleanupMissingExpiryJobFiles_(job); writeMissingExpiryJob_(job);
      }
    }
    const pending = PropertiesService.getScriptProperties().getProperties();
    if (Object.keys(pending).some(function (key) { if (key.indexOf('expiry-upload-job-') !== 0) return false; try { return ['QUEUED', 'PREPARING', 'PROCESSING'].indexOf(JSON.parse(pending[key]).status) >= 0; } catch (error) { return false; } })) scheduleMissingExpiryWorker_();
    return { processed: true, jobId: job.jobId, status: job.status };
  } catch (error) {
    console.error('Worker upload Expired Date gagal: ' + error.message);
    return { processed: false, error: error.message };
  }
}

/**
 * Reads and validates an ESB Sales Material Usage Report before the user can
 * press Upload. The file is parsed in memory; it is never stored in Drive.
 */
function previewSalesUsageUpload(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveSalesUsageContext_(token, payload);
    const prepared = prepareSalesUsageImport_(context, payload, true);
    if (prepared.requiresWipChoice) {
      return {
        verified: false, requiresWipChoice: true, fileName: prepared.fileName,
        outlet: prepared.outlet, outletName: prepared.outletName, location: context.location,
        transactionDate: prepared.transactionDate, itemCount: prepared.sourceItemCount,
        zeroRowsSkipped: prepared.zeroRowsSkipped, showcaseRowsSkipped: prepared.showcaseRowsSkipped,
        wipChoices: prepared.wipChoices
      };
    }
    if (prepared.requiresConversion) {
      return {
        verified: false, requiresConversion: true, fileName: prepared.fileName,
        outlet: prepared.outlet, outletName: prepared.outletName, location: context.location,
        transactionDate: prepared.transactionDate, itemCount: prepared.sourceItemCount,
        zeroRowsSkipped: prepared.zeroRowsSkipped, showcaseRowsSkipped: prepared.showcaseRowsSkipped, newItemCount: prepared.newItemCount,
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
      showcaseRowsSkipped: prepared.showcaseRowsSkipped,
      newItemCount: prepared.newItemCount,
      negativeItemCount: prepared.negativeItemCount,
      conversionCount: prepared.conversionCount,
      autoWipProductionCount: prepared.autoWipProductionCount,
      rawShortages: prepared.rawShortages
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
    const mode = String(payload.mode || 'UPLOAD').trim().toUpperCase();
    const isAdmin = employee.outlet === 'BIHQ';
    if (!isAdmin && mode !== 'UPLOAD') throw new Error('Unit Konversi hanya dapat diubah oleh BIHQ. Outlet tetap dapat mengisi konversi baru saat diminta oleh proses upload.');
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

    const lock = acquireStockWriteLock_();
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
        if (existing[entry.key]) {
          const currentFactor = Number(sheet.getRange(existing[entry.key], 5).getValue());
          if (!isAdmin && Math.abs(currentFactor - entry.factor) > 0.000000001) {
            throw new Error(entry.itemCode + ' · Konversi ini sudah tersimpan. Perubahan nilai hanya dapat dilakukan oleh BIHQ.');
          }
          if (isAdmin) sheet.getRange(existing[entry.key], 1, 1, 8).setValues([values]);
        } else additions.push(values);
      });
      if (additions.length) sheet.getRange(sheet.getLastRow() + 1, 1, additions.length, 8).setValues(additions);
      SpreadsheetApp.flush();
      removeScriptCacheKeys_(['stock-unit-conversions']);
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
    const context = resolveSalesUsageContext_(token, payload);
    // Parse and validate before locking; only the final write is serialized.
    const prepared = prepareSalesUsageImport_(context, payload, false);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw new Error('Sistem sedang menyimpan transaksi lain. Silakan coba lagi; data Anda belum disimpan.');
    try {
      if (salesUsageHashAlreadyImported_(context.outlet, prepared.sourceHash)) {
        throw new Error('File yang sama sudah pernah diproses untuk outlet ' + context.outlet + '.');
      }
      appendOrActivateStockMasterItems_(prepared.masterChanges);
      const now = new Date(), rows = [];
      (prepared.autoWipPlans || []).forEach(function (plan) {
        const productionId = Utilities.getUuid(), outputId = Utilities.getUuid();
        rows.push({ insertId: outputId, json: {
          record_id: outputId, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT',
          outlet: context.outlet, location: context.location, item_code: plan.outputItem.code, category: plan.outputItem.category,
          item_name: plan.outputItem.name, unit: plan.outputItem.unit, direction: 'IN', qty: plan.outputQty, movement_type: 'Production',
          info: cleanText_('Produksi WIP Otomatis - Kekurangan Usage Penjualan - ' + plan.variant.name + ' - Resep ' + plan.variant.key + ' - Formula ' + formatQty_(plan.formulaQty) + ' ' + plan.variant.unit, 500),
          expiry_date: null, event_date: prepared.transactionDate, created_at: now.getTime() / 1000, created_by: context.employee.nik,
          source_file: prepared.fileName, source_hash: prepared.sourceHash, source_row: 0, transfer_id: productionId
        }});
        plan.materials.forEach(function (material) {
          const rawId = Utilities.getUuid();
          rows.push({ insertId: rawId, json: {
            record_id: rawId, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT',
            outlet: context.outlet, location: context.location, item_code: material.item.code, category: material.item.category,
            item_name: material.item.name, unit: material.item.unit, direction: 'OUT', qty: material.qty, movement_type: 'WIP Material Usage',
            info: cleanText_('Keluar untuk Produk WIP: ' + plan.variant.name + ' (' + plan.variant.code + ') · Otomatis dari Usage ' + prepared.fileName, 500),
            expiry_date: null, event_date: prepared.transactionDate, created_at: now.getTime() / 1000, created_by: context.employee.nik,
            source_file: prepared.fileName, source_hash: prepared.sourceHash, source_row: material.sourceRow, transfer_id: productionId
          }});
        });
      });
      prepared.items.forEach(function (usage) {
        const logicalId = Utilities.getUuid();
        const recordId = Utilities.getUuid();
        rows.push({ insertId: recordId, json: {
          record_id: recordId, logical_id: logicalId, version: 1, record_type: 'MOVEMENT',
          outlet: context.outlet, location: context.location, item_code: usage.item.code,
          category: usage.item.category, item_name: usage.item.name, unit: usage.item.unit,
          direction: 'OUT', qty: usage.qty, movement_type: 'Terjual',
          info: cleanText_('ESB Usage Penjualan · ' + prepared.fileName + ' · Baris ' + usage.sourceRow +
            (usage.converted ? ' · Konversi ' + formatQty_(usage.originalQty) + ' ' + usage.originalUnit + ' = ' + formatQty_(usage.qty) + ' ' + usage.item.unit : ''), 500),
          expiry_date: null, event_date: prepared.transactionDate,
          created_at: now.getTime() / 1000, created_by: context.employee.nik,
          source_file: prepared.fileName, source_hash: prepared.sourceHash, source_row: usage.sourceRow
        }});
      });
      // An import marker preserves duplicate detection and daily completion even if every Showcase product was skipped.
      const importId = Utilities.getUuid();
      rows.push({ insertId: importId, json: {
        record_id: importId, logical_id: importId, version: 1, record_type: 'IMPORT',
        outlet: context.outlet, location: context.location, direction: null, qty: 0, movement_type: 'Terjual',
        info: cleanText_('Import ESB Usage Penjualan · ' + prepared.fileName + ' · ' + prepared.showcaseRowsSkipped + ' baris Product Showcase dilewati', 500),
        expiry_date: null, event_date: prepared.transactionDate, created_at: now.getTime() / 1000, created_by: context.employee.nik,
        source_file: prepared.fileName, source_hash: prepared.sourceHash, source_row: 0
      }});
      // One request keeps one report together and avoids a retry leaving a half-imported file.
      insertStockCardRows_(rows);
      markStockTaskCompleteFromUploads_(context, prepared.transactionDate, 'Terjual');
      return {
        uploaded: true, outlet: context.outlet, location: context.location,
        transactionDate: prepared.transactionDate, itemCount: prepared.items.length,
        zeroRowsSkipped: prepared.zeroRowsSkipped, showcaseRowsSkipped: prepared.showcaseRowsSkipped, newItemCount: prepared.newItemCount,
        negativeItemCount: prepared.negativeItemCount, conversionCount: prepared.conversionCount,
        autoWipProductionCount: prepared.autoWipProductionCount, rawShortageCount: (prepared.rawShortages || []).length,
        duplicateItemsSkipped: prepared.duplicateItemsSkipped || 0
      };
    } finally {
      lock.releaseLock();
    }
  });
}

/** Validates an exported Stock Position workbook before any balance is changed. */
function previewStockPositionUpload(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const prepared = prepareStockPositionImport_(context, payload, true);
    return {
      verified: !prepared.requiresExpiry,
      fileName: prepared.fileName, outlet: context.outlet, location: context.location,
      sourceItemCount: prepared.sourceItemCount, adjustmentCount: prepared.items.length,
      increaseCount: prepared.increaseCount, decreaseCount: prepared.decreaseCount,
      requiresExpiry: prepared.requiresExpiry, expiryRequests: prepared.expiryRequests,
      adjustedItems: prepared.items.map(function (line) {
        return { itemCode: line.item.code, qty: line.actualQty };
      })
    };
  });
}

/** Applies QTY Stock Actual as the new balance and records only its delta. */
function uploadStockPosition(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const prepared = prepareStockPositionImport_(context, payload, false);
    if (!prepared.items.length) throw new Error('QTY Stock Actual sama dengan saldo terbaru. Tidak ada Stock Adjustment yang perlu dicatat.');
    const lock = acquireStockWriteLock_();
    try {
      const now = new Date(), eventDate = todayIso_(), rows = [];
      prepared.items.forEach(function (line) {
        const direction = line.delta > 0 ? 'IN' : 'OUT';
        const qty = Math.abs(line.delta);
        const lots = direction === 'IN'
          ? [{ qty: qty, expiryDate: line.expiryDate }]
          : allocateTransferLots_(context.outlet, context.location, line.item, qty);
        lots.forEach(function (lot) {
          const recordId = Utilities.getUuid();
          rows.push({ insertId: recordId, json: {
            record_id: recordId, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT',
            outlet: context.outlet, location: context.location, item_code: line.item.code,
            category: line.item.category, item_name: line.item.name, unit: line.item.unit,
            direction: direction, qty: Number(lot.qty), movement_type: 'Stock Adjustment',
            info: cleanText_('Upload Stock Posisi · Saldo sistem terbaru ' + formatQty_(line.cardQty) +
              ' → QTY Stock Actual ' + formatQty_(line.actualQty), 500),
            expiry_date: lot.expiryDate || null, event_date: eventDate,
            created_at: now.getTime() / 1000, created_by: context.employee.nik,
            source_file: prepared.fileName, source_hash: prepared.sourceHash, source_row: line.sourceRow
          }});
        });
      });
      insertStockCardRows_(rows);
      const uploadedDates = {};
      prepared.items.forEach(function (item) { uploadedDates[item.transactionDate] = true; });
      Object.keys(uploadedDates).forEach(function (date) {
        markStockTaskCompleteFromUploads_(context, date, 'Goods Receipt');
      });
      return {
        uploaded: true, outlet: context.outlet, location: context.location,
        adjustmentCount: prepared.items.length, movementCount: rows.length,
        increaseCount: prepared.increaseCount, decreaseCount: prepared.decreaseCount,
        adjustedItems: prepared.items.map(function (line) {
          return { itemCode: line.item.code, qty: line.actualQty };
        })
      };
    } finally {
      lock.releaseLock();
    }
  });
}

function prepareStockPositionImport_(context, payload, allowPendingExpiry) {
  const fileName = cleanText_(payload.fileName, 180);
  const base64 = String(payload.base64 || '').replace(/^data:[^,]+,/, '').trim();
  const sourceHash = digest_(base64);
  const report = parseStockPositionReport_(base64, fileName);
  if (report.outlet !== context.outlet) throw new Error('File Stock Posisi milik outlet ' + report.outlet +
    ', bukan outlet yang sedang dipilih (' + context.outlet + ').');
  if (report.location.toLowerCase() !== context.location.toLowerCase()) throw new Error('File Stock Posisi dibuat untuk penyimpanan ' +
    report.location + ', bukan ' + context.location + '.');
  if (stockPositionAlreadyImported_(context.outlet, context.location, sourceHash)) {
    throw new Error('File Stock Posisi yang sama sudah pernah di-upload ke ' + context.outlet + ' · ' + context.location + '.');
  }
  const master = {}, current = readCurrentStockCodeQtyMap_(context.outlet, context.location);
  readStockMaster_(true).forEach(function (item) { master[item.code.toUpperCase()] = item; });
  const expiryDates = payload.expiryDates && typeof payload.expiryDates === 'object' ? payload.expiryDates : {};
  const items = [], expiryRequests = [], missingExpiry = [];
  let increaseCount = 0, decreaseCount = 0;
  report.rows.forEach(function (row) {
    const item = master[row.code];
    if (!item) throw new Error(row.code + ' · ' + row.name + ': item tidak ditemukan pada Master Stock Card.');
    if (normalizeUnit_(item.unit) !== normalizeUnit_(row.unit)) throw new Error(row.code + ' · ' + item.name +
      ': Unit file ' + row.unit + ' berbeda dari Unit Master ' + item.unit + '.');
    const liveQty = Number(current[row.code] || 0);
    const delta = row.actualQty - liveQty;
    if (Math.abs(delta) <= 0.0000001) return;
    let expiryDate = '';
    if (delta > 0 && Math.abs(row.actualQty) > 0.0000001) {
      increaseCount++;
      expiryRequests.push({ itemCode: row.code, itemName: item.name, qty: delta, unit: item.unit });
      try { expiryDate = normalizeDate_(expiryDates[row.code], false); } catch (error) { expiryDate = ''; }
      if (!expiryDate) missingExpiry.push(row.code + ' · ' + item.name);
    } else if (delta < 0) decreaseCount++;
    else increaseCount++;
    items.push({
      sourceRow: row.sourceRow, item: item, cardQty: liveQty,
      actualQty: row.actualQty, delta: delta, expiryDate: expiryDate
    });
  });
  const allowMissingExpiry = Boolean(payload.allowMissingExpiry);
  if (missingExpiry.length && !allowPendingExpiry && !allowMissingExpiry) throw new Error('Konfirmasi upload tanpa melengkapi seluruh Expiry Date terlebih dahulu. Item: ' +
    missingExpiry.slice(0, 8).join(', ') + '.');
  return {
    fileName: fileName, sourceHash: sourceHash, sourceItemCount: report.rows.length,
    items: items, increaseCount: increaseCount, decreaseCount: decreaseCount,
    requiresExpiry: missingExpiry.length > 0 && !allowMissingExpiry, expiryRequests: expiryRequests
  };
}

function parseStockPositionReport_(base64, fileName) {
  const cells = extractReportCells_(base64, fileName, 'Export Stok Saat Ini');
  const header = findReportHeader_(cells, [
    'KODE ITEM', 'CATEGORY', 'NAMA ITEM', 'UNIT', 'QTY STOCK ACTUAL'
  ]);
  const meta = String(cells.A2 || '');
  const outletMatch = /Outlet:\s*([^|]+)/i.exec(meta);
  const locationMatch = /Penyimpanan:\s*([^|]+)/i.exec(meta);
  if (!outletMatch || !locationMatch) throw new Error('Metadata Outlet dan Penyimpanan tidak ditemukan. Gunakan file hasil Export Stok Saat Ini.');
  const outlet = cleanText_(outletMatch[1], 30).toUpperCase();
  const location = normalizeLocation_(locationMatch[1]);
  const rows = [], invalid = [];
  reportDataRows_(cells, header, 'KODE ITEM').forEach(function (rowNumber) {
    const code = String(reportCell_(cells, header, 'KODE ITEM', rowNumber) || '').trim().toUpperCase();
    if (!code) return;
    const actualRaw = reportCell_(cells, header, 'QTY STOCK ACTUAL', rowNumber);
    if (actualRaw === '' || actualRaw === null || actualRaw === undefined) {
      return;
    }
    const actualQty = parseReportNumber_(actualRaw);
    if (!isFinite(actualQty) || actualQty < 0) {
      invalid.push(code);
      return;
    }
    rows.push({
      sourceRow: rowNumber, code: code,
      category: cleanText_(reportCell_(cells, header, 'CATEGORY', rowNumber), 100),
      name: cleanText_(reportCell_(cells, header, 'NAMA ITEM', rowNumber), 180),
      unit: cleanText_(reportCell_(cells, header, 'UNIT', rowNumber), 40).toUpperCase(),
      actualQty: actualQty
    });
  });
  if (invalid.length) throw new Error('QTY stok tidak valid untuk: ' + invalid.slice(0, 10).join(', ') + '.');
  if (!rows.length) throw new Error('Tidak ada QTY Stock Actual yang diisi. Sel kosong dianggap tidak mengalami perubahan.');
  return { outlet: outlet, location: location, rows: rows, headerRow: header.row };
}

function stockPositionAlreadyImported_(outlet, location, sourceHash) {
  const sql = 'SELECT COUNT(*) AS total FROM ' + stockCardTable_() + ' ' +
    'WHERE record_type = \'MOVEMENT\' AND outlet = @outlet AND location = @location ' +
    'AND movement_type = \'Stock Adjustment\' AND source_hash = @sourceHash';
  const rows = runNamedQuery_(sql, { outlet: outlet, location: location, sourceHash: sourceHash });
  return rows.length && Number(rows[0].total || 0) > 0;
}

function prepareSalesUsageImport_(context, payload, allowPendingConversions) {
  if (isShowcaseLocation_(context.location)) {
    throw new Error('Upload Usage Penjualan tidak dapat diarahkan ke Showcase. Pilih penyimpanan Store atau Gudang.');
  }
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
  if (salesUsageHashAlreadyImported_(context.outlet, sourceHash)) {
    throw new Error('File yang sama sudah pernah di-upload untuk outlet ' + context.outlet + '.');
  }

  const master = readStockMaster_(true);
  const masterMap = {};
  master.forEach(function (item) { masterMap[item.code.toUpperCase()] = item; });
  const currentMap = readCurrentStockCodeQtyMap_(context.outlet, context.location);
  const providedConversions = payload.conversions && typeof payload.conversions === 'object' ? payload.conversions : {};
  const savedConversions = readStockUnitConversions_();
  const conversionMap = {}, conversionRequests = [], usageTotals = {}, items = [], masterChangeMap = {};
  const existingItemCodes = readExistingSalesUsageItemCodes_(context.outlet, report.transactionDate);
  let duplicateItemsSkipped = 0;
  const showcaseProducts = showcaseProductNameMap_();
  let showcaseRowsSkipped = 0;
  report.rows.forEach(function (row) {
    if (existingItemCodes[row.code]) {
      duplicateItemsSkipped++;
      return;
    }
    if (showcaseProducts[normalizeStoreName_(row.name)]) {
      showcaseRowsSkipped++;
      return;
    }
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
      factor = resolveUnitConversionFactor_(row.code, esbUnit, masterUnit, providedConversions, savedConversions);
      if (!factor && !conversionMap[conversionKey]) {
        conversionMap[conversionKey] = {
          key: conversionKey, itemCode: row.code, itemName: item.name,
          fromUnit: row.unit || '-', toUnit: item.unit || '-'
        };
        conversionRequests.push(conversionMap[conversionKey]);
      }
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
    showcaseRowsSkipped: showcaseRowsSkipped, sourceItemCount: report.rows.length,
    newItemCount: Object.keys(masterChangeMap).length, duplicateItemsSkipped: duplicateItemsSkipped
  };
  if (missingConversions.length) {
    if (!allowPendingConversions) throw new Error('Lengkapi seluruh konversi unit sebelum melanjutkan upload.');
    baseResult.requiresConversion = true;
    baseResult.conversionRequests = missingConversions;
    return baseResult;
  }
  const catalog = readWipRecipeCatalog_(), wipChoices = payload.wipChoices && typeof payload.wipChoices === 'object' ? payload.wipChoices : {};
  const wipChoiceRequests = [], autoWipPlans = [], autoProducedCodes = {}, rawTotals = {};
  Object.keys(usageTotals).forEach(function (code) {
    const variants = catalog.byCode[code] || [], required = Number(usageTotals[code] || 0), available = Math.max(0, Number(currentMap[code] || 0));
    const shortage = Math.max(0, required - available);
    if (!variants.length || shortage <= 0.0000001) return;
    let variant = null, selectedKey = cleanText_(wipChoices[code], 500);
    if (variants.length === 1) variant = variants[0];
    else if (selectedKey) variant = variants.filter(function (entry) { return entry.key === selectedKey; })[0];
    if (!variant) {
      wipChoiceRequests.push({ itemCode: code, itemName: masterMap[code] ? masterMap[code].name : variants[0].name, shortageQty: shortage,
        unit: masterMap[code] ? masterMap[code].unit : variants[0].unit,
        options: variants.map(function (entry, index) { return { key: entry.key, label: 'Pilihan ' + String.fromCharCode(65 + index), name: entry.name, unit: entry.unit, materialCount: entry.materials.length }; }) });
      return;
    }
    const outputItem = masterMap[code];
    if (!outputItem) throw new Error(code + ' · ' + variant.name + ': item hasil WIP belum tersedia pada STOCK_ITEMS.');
    if (!normalizeUnit_(outputItem.unit)) throw new Error(code + ' · ' + variant.name + ': Unit Default hasil WIP pada STOCK_ITEMS masih kosong.');
    const outputToFormula = wipConversionFactor_(code, outputItem.unit, variant.unit, providedConversions, savedConversions);
    if (!outputToFormula) wipConversionRequest_(conversionRequests, conversionMap, outputItem, outputItem.unit, variant.unit);
    const formulaQty = outputToFormula ? shortage * outputToFormula : 0, materials = [];
    variant.materials.forEach(function (recipe) {
      let material = masterMap[recipe.code];
      if (!material) {
        material = { code: recipe.code, category: 'WIP RAW MATERIAL', name: recipe.name || recipe.code, unit: recipe.unit || '', active: false };
        masterMap[recipe.code] = material;
        masterChangeMap[recipe.code] = material;
      }
      if (!normalizeUnit_(material.unit)) throw new Error(recipe.code + ' · ' + material.name + ': Unit Default bahan pada STOCK_ITEMS masih kosong.');
      const factor = wipConversionFactor_(recipe.code, recipe.unit, material.unit, providedConversions, savedConversions);
      if (!factor) wipConversionRequest_(conversionRequests, conversionMap, material, recipe.unit, material.unit);
      const rawQty = factor ? recipe.qty * formulaQty * factor : 0;
      materials.push({ item: material, qty: rawQty, recipeQty: recipe.qty, recipeUnit: recipe.unit, sourceRow: recipe.sourceRow });
      if (factor) rawTotals[material.code] = Number(rawTotals[material.code] || 0) + rawQty;
    });
    autoProducedCodes[code] = true;
    autoWipPlans.push({ variant: variant, outputItem: outputItem, outputQty: shortage, formulaQty: formulaQty, materials: materials });
  });
  if (wipChoiceRequests.length) {
    if (!allowPendingConversions) throw new Error('Pilih salah satu resep untuk kode WIP ganda sebelum upload dilanjutkan.');
    baseResult.requiresWipChoice = true;
    baseResult.wipChoices = wipChoiceRequests;
    return baseResult;
  }
  const wipMissingConversions = conversionRequests.filter(function (request) {
    const factor = Number(providedConversions[request.key]);
    const savedFactor = savedConversions[request.key] && Number(savedConversions[request.key].factor);
    const inverseKey = stockConversionKey_(request.itemCode, request.toUnit, request.fromUnit);
    const inverseProvided = Number(providedConversions[inverseKey]);
    const inverseSaved = savedConversions[inverseKey] && Number(savedConversions[inverseKey].factor);
    return (!isFinite(factor) || factor <= 0) && (!isFinite(savedFactor) || savedFactor <= 0) &&
      (!isFinite(inverseProvided) || inverseProvided <= 0) && (!isFinite(inverseSaved) || inverseSaved <= 0);
  });
  if (wipMissingConversions.length) {
    if (!allowPendingConversions) throw new Error('Lengkapi seluruh konversi unit resep WIP sebelum melanjutkan upload.');
    baseResult.requiresConversion = true;
    baseResult.conversionRequests = wipMissingConversions;
    return baseResult;
  }
  let negativeItemCount = 0;
  Object.keys(usageTotals).forEach(function (code) {
    const available = Number(currentMap[code] || 0), required = Number(usageTotals[code] || 0);
    if (!autoProducedCodes[code] && available - required < -0.0000001) negativeItemCount++;
  });
  const rawShortages = [];
  Object.keys(rawTotals).forEach(function (code) {
    const available = Number(currentMap[code] || 0), required = Number(rawTotals[code] || 0);
    if (available - required < -0.0000001) {
      negativeItemCount++;
      rawShortages.push({ itemCode: code, itemName: masterMap[code].name, unit: masterMap[code].unit, available: available, required: required, shortage: required - available });
    }
  });
  if (!items.length && !showcaseRowsSkipped) {
    if (duplicateItemsSkipped) throw new Error('Semua item pada file ini sudah tersimpan untuk outlet dan tanggal tersebut. Gunakan file yang berisi item berbeda.');
    throw new Error('Tidak ada QTY penjualan lebih dari 0 pada file ini.');
  }
  baseResult.requiresConversion = false;
  baseResult.items = items;
  baseResult.masterChanges = Object.keys(masterChangeMap).map(function (code) { return masterChangeMap[code]; });
  baseResult.negativeItemCount = negativeItemCount;
  baseResult.conversionCount = conversionRequests.length;
  baseResult.autoWipPlans = autoWipPlans;
  baseResult.autoWipProductionCount = autoWipPlans.length;
  baseResult.rawShortages = rawShortages;
  baseResult.newItemCount = Object.keys(masterChangeMap).length;
  return baseResult;
}

function resolveSalesUsageContext_(token, payload) {
  payload = payload || {};
  const session = requireSession_(token), employee = findEmployee_(session.nik);
  assertEmployeeActive_(employee);
  // An outlet user is always restricted to their assigned outlet. BIHQ is
  // different: every Usage workbook determines its own outlet from cell B6,
  // including when a Stock Card outlet filter is currently selected.
  if (employee.outlet !== 'BIHQ') {
    return resolveStockContext_(token, employee.outlet, payload.location);
  }
  const fileName = cleanText_(payload.fileName, 180);
  const base64 = String(payload.base64 || '').replace(/^data:[^,]+,/, '').trim();
  const report = parseSalesUsageReport_(base64, fileName);
  const reportOutlet = readStoreCodeMap_()[normalizeStoreName_(report.outletName)] || '';
  if (!reportOutlet) throw new Error('Outlet "' + report.outletName + '" pada cell B6 belum terdaftar di sheet STORE CODE.');
  return resolveStockContext_(token, reportOutlet, payload.location || 'Store');
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
  removeScriptCacheKeys_(['stock-master-active', 'stock-master-all']);
}

function convertSalesUsageQty_(qty, factor) {
  qty = Number(qty);
  factor = Number(factor);
  if (!isFinite(qty) || qty < 0 || !isFinite(factor) || factor <= 0) throw new Error('Faktor konversi unit tidak valid.');
  const result = qty * factor;
  if (!isFinite(result) || result <= 0) throw new Error('Hasil konversi QTY tidak valid.');
  return result;
}

function parseGoodsReceiptReportLegacy_(base64, fileName) {
  if (!/\.xlsx$/i.test(fileName || '')) throw new Error('Pilih Goods Receipt Recapitulation Report dengan format .xlsx.');
  if (!base64) throw new Error('Data file tidak ditemukan. Pilih kembali file Goods Receipt.');
  let bytes;
  try { bytes = Utilities.base64Decode(base64); }
  catch (error) { throw new Error('File tidak dapat dibaca. Pastikan file berasal dari ESB dan berformat .xlsx.'); }
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('Ukuran file harus lebih dari 0 dan maksimal 5 MB.');
  if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error('File bukan workbook Excel .xlsx yang valid.');
  let files;
  try { files = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', 'goods-receipt-report.zip')); }
  catch (error) { throw new Error('Paket Excel Goods Receipt gagal dibuka. Download ulang report dari ESB lalu upload tanpa menyimpan ulang file.'); }
  const fileMap = {}, worksheetNames = [];
  let expandedSize = 0;
  files.forEach(function (file) {
    const name = String(file.getName() || '').replace(/^\/+/, ''), fileBytes = file.getBytes();
    expandedSize += fileBytes.length;
    if (expandedSize > 25 * 1024 * 1024) throw new Error('Isi workbook terlalu besar untuk diproses.');
    fileMap[name] = file;
    if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) worksheetNames.push(name);
  });
  worksheetNames.sort();
  if (!worksheetNames.length) throw new Error('Worksheet Goods Receipt tidak ditemukan.');
  const sharedStrings = fileMap['xl/sharedStrings.xml'] ? parseSharedStringsXml_(fileMap['xl/sharedStrings.xml'].getDataAsString('UTF-8')) : [];
  const worksheetXml = fileMap[worksheetNames[0]].getDataAsString('UTF-8');
  const cells = parseWorksheetCellsXml_(worksheetXml, sharedStrings);
  // Some ESB workbooks store data rows as inline strings. If the fast parser
  // cannot see G12, retry with XmlService before deciding the outlet is empty.
  if (!cleanText_(cells.G12, 160)) {
    const fallbackCells = parseWorksheetCellsXmlDom_(worksheetXml, sharedStrings);
    Object.keys(fallbackCells).forEach(function (address) {
      if (cells[address] === undefined || cells[address] === '') cells[address] = fallbackCells[address];
    });
  }
  const expected = { A11: 'GOODS RECEIPT NUMBER', B11: 'GOODS RECEIPT DATE', G11: 'DESTINATION', L11: 'SUB CATEGORY', M11: 'PRODUCT NAME', N11: 'PRODUCT CODE', O11: 'UNIT', P11: 'QTY', S11: 'EXPIRED DATE' };
  const invalidHeaders = Object.keys(expected).filter(function (address) { return normalizeHeader_(cells[address]) !== expected[address]; });
  if (invalidHeaders.length) throw new Error('Format Goods Receipt tidak sesuai. Header baris 11 tidak cocok pada: ' + invalidHeaders.join(', ') + '.');
  const rowNumbers = Object.keys(cells).map(function (address) {
    const match = /^N(\d+)$/.exec(address); return match ? Number(match[1]) : 0;
  }).filter(function (row) { return row >= 12; }).sort(function (a, b) { return a - b; });
  if (rowNumbers.length > 5000) throw new Error('Jumlah baris report melebihi batas 5.000 item.');
  const rows = [], seenRows = {}, invalidQty = [], outlets = {}, receipts = {}, suppliers = {}, dates = {};
  const primaryOutletName = cleanText_(cells.G12, 160);
  rowNumbers.forEach(function (rowNumber) {
    if (seenRows[rowNumber]) return;
    seenRows[rowNumber] = true;
    const code = String(cells['N' + rowNumber] || '').trim().toUpperCase();
    if (!code) return;
    const status = normalizeHeader_(cells['U' + rowNumber]);
    const origin = cleanText_(cells['E' + rowNumber], 180);
    if (status !== 'AUTHORIZED' || /^BAKERZIN\b/i.test(origin)) return;
    const qty = parseGoodsReceiptNumber_(cells['P' + rowNumber]);
    if (!isFinite(qty) || qty < 0) { invalidQty.push(code + ' baris ' + rowNumber); return; }
    if (qty <= 0.0000001) return;
    // ESB can omit repeated Destination values on following rows. G12 remains
    // the authoritative destination and is used only when a later G cell is blank.
    const outletName = cleanText_(cells['G' + rowNumber], 160) || primaryOutletName;
    if (!outletName) throw new Error('Destination pada G12 tidak dapat dibaca. Download ulang report langsung dari ESB tanpa menyimpan ulang file.');
    outlets[normalizeStoreName_(outletName)] = outletName;
    const transactionDate = parseGoodsReceiptDate_(cells['B' + rowNumber], rowNumber);
    const grNumber = cleanText_(cells['A' + rowNumber], 100), supplier = origin;
    const lots = parseGoodsReceiptExpiryLots_(cells['S' + rowNumber], qty, rowNumber, code);
    rows.push({
      sourceRow: rowNumber, transactionDate: transactionDate, grNumber: grNumber,
      poNumber: cleanText_(cells['C' + rowNumber], 100), supplier: supplier,
      outletName: outletName, category: cleanText_(cells['L' + rowNumber], 100),
      name: cleanText_(cells['M' + rowNumber], 180), code: code,
      unit: cleanText_(cells['O' + rowNumber], 40).toUpperCase(), qty: qty, lots: lots
    });
    dates[transactionDate] = true;
    if (grNumber) receipts[grNumber] = true;
    if (supplier) suppliers[supplier] = true;
  });
  if (invalidQty.length) throw new Error('QTY tidak valid pada: ' + invalidQty.slice(0, 8).join(', ') + '.');
  const outletKeys = Object.keys(outlets);
  if (outletKeys.length !== 1) throw new Error('Semua baris kolom G wajib memiliki satu outlet yang sama. Ditemukan: ' + outletKeys.map(function (key) { return outlets[key]; }).join(', ') + '.');
  if (!rows.length) throw new Error('Tidak ada baris Goods Receipt yang dapat di-upload. Hanya Status Authorized dan Origin yang tidak diawali Bakerzin yang diproses.');
  return {
    outletName: outlets[outletKeys[0]], rows: rows, transactionDates: Object.keys(dates),
    receiptCount: Object.keys(receipts).length, supplierCount: Object.keys(suppliers).length
  };
}

/**
 * Reads a Goods Receipt report by column names instead of fixed row numbers.
 * ESB metadata may grow or move; only the table header names are authoritative.
 */
function parseGoodsReceiptReport_(base64, fileName, allowMultipleOutlets) {
  const cells = extractReportCells_(base64, fileName, 'Goods Receipt');
  const header = findReportHeader_(cells, [
    'GOODS RECEIPT NUMBER', 'GOODS RECEIPT DATE', 'DESTINATION',
    'PRODUCT NAME', 'PRODUCT CODE', 'UNIT', 'QTY'
  ]);
  const rows = [], invalidQty = [], outlets = {}, receipts = {}, suppliers = {}, dates = {};
  let lastDestination = '', lastSupplier = '';
  reportDataRows_(cells, header, 'PRODUCT CODE').forEach(function (rowNumber) {
    const code = String(reportCell_(cells, header, 'PRODUCT CODE', rowNumber) || '').trim().toUpperCase();
    if (!code) return;
    const status = normalizeHeader_(cells['U' + rowNumber] || reportCell_(cells, header, 'STATUS', rowNumber));
    const fixedOrigin = cleanText_(cells['E' + rowNumber], 180);
    if (status !== 'AUTHORIZED' || /^BAKERZIN\b/i.test(fixedOrigin)) return;
    const qty = parseReportNumber_(reportCell_(cells, header, 'QTY', rowNumber));
    if (!isFinite(qty) || qty < 0) {
      invalidQty.push(code + ' · baris ' + rowNumber);
      return;
    }
    if (qty <= 0.0000001) return;
    const destination = cleanText_(reportCell_(cells, header, 'DESTINATION', rowNumber), 160) || lastDestination;
    if (!destination) throw new Error('Destination tidak ditemukan pada baris ' + rowNumber + '.');
    lastDestination = destination;
    const supplier = fixedOrigin || cleanText_(reportCell_(cells, header, 'ORIGIN', rowNumber), 180) || lastSupplier;
    if (supplier) lastSupplier = supplier;
    const transactionDate = parseReportDate_(reportCell_(cells, header, 'GOODS RECEIPT DATE', rowNumber), 'TRANSACTION', rowNumber, 'Goods Receipt');
    const grNumber = cleanText_(reportCell_(cells, header, 'GOODS RECEIPT NUMBER', rowNumber), 100);
    const expiryLots = parseReportExpiryLots_(reportCell_(cells, header, 'EXPIRED DATE', rowNumber), qty, rowNumber, code);
    rows.push({
      sourceRow: rowNumber, transactionDate: transactionDate, grNumber: grNumber,
      // No PO pada Goods Receipt berada di kolom C. Header dipakai sebagai
      // fallback agar format report lama tetap dapat diproses.
      poNumber: cleanText_(cells['C' + rowNumber], 100) ||
        cleanText_(reportCell_(cells, header, 'REFERENCE NUMBER', rowNumber), 100),
      supplier: supplier, outletName: destination,
      category: cleanText_(reportCell_(cells, header, 'SUB CATEGORY', rowNumber), 100) ||
        cleanText_(reportCell_(cells, header, 'CATEGORY', rowNumber), 100),
      name: cleanText_(reportCell_(cells, header, 'PRODUCT NAME', rowNumber), 180),
      code: code, unit: cleanText_(reportCell_(cells, header, 'UNIT', rowNumber), 40).toUpperCase(),
      qty: qty, lots: expiryLots
    });
    outlets[normalizeStoreName_(destination)] = destination;
    dates[transactionDate] = true;
    if (grNumber) receipts[grNumber] = true;
    if (supplier) suppliers[supplier] = true;
  });
  if (invalidQty.length) throw new Error('QTY Goods Receipt tidak valid pada ' + invalidQty.slice(0, 8).join(', ') + '.');
  const outletKeys = Object.keys(outlets);
  if (!allowMultipleOutlets && outletKeys.length !== 1) throw new Error('Goods Receipt harus berisi tepat satu Destination. Ditemukan: ' +
    outletKeys.map(function (key) { return outlets[key]; }).join(', ') + '.');
  if (!rows.length) throw new Error('Tidak ada baris Goods Receipt yang dapat di-upload. Hanya Status Authorized pada kolom U dan Origin non-Bakerzin pada kolom E yang diproses.');
  return {
    outletName: outlets[outletKeys[0]], outletNames: outletKeys.map(function (key) { return outlets[key]; }), rows: rows, transactionDates: Object.keys(dates),
    receiptCount: Object.keys(receipts).length, supplierCount: Object.keys(suppliers).length,
    headerRow: header.row
  };
}

function parseGoodsReceiptNumber_(value) {
  const text = String(value === null || value === undefined ? '' : value).trim().replace(/\s/g, '');
  if (!text) return NaN;
  if (text.indexOf(',') >= 0) return Number(text.replace(/\./g, '').replace(',', '.'));
  return Number(text);
}

function parseGoodsReceiptDate_(value, rowNumber) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  const serial = Number(text);
  if (isFinite(serial) && serial > 20000 && serial < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
    return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
  }
  let match = /^(\d{2})[-\/]([01]\d)[-\/](\d{4})$/.exec(text);
  if (match) return normalizeDate_(match[3] + '-' + match[2] + '-' + match[1], false);
  match = /^(\d{4})[-\/]([01]\d)[-\/](\d{2})$/.exec(text);
  if (match) return normalizeDate_(match[1] + '-' + match[2] + '-' + match[3], false);
  throw new Error('Tanggal Goods Receipt pada kolom B baris ' + rowNumber + ' tidak valid.');
}

function parseGoodsReceiptExpiryLots_(value, qty, rowNumber, code) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) return [{ expiryDate: '', qty: qty }];
  const lots = [];
  const regex = /(\d{2})[-\/](\d{2})[-\/](\d{4})\s*\(([\d.,]+)\)/g;
  let match, matchedText = '';
  while ((match = regex.exec(text)) !== null) {
    const expiryDate = normalizeDate_(match[3] + '-' + match[2] + '-' + match[1], false);
    const lotQty = parseGoodsReceiptNumber_(match[4]);
    if (!isFinite(lotQty) || lotQty <= 0) throw new Error(code + ' baris ' + rowNumber + ': QTY expiry tidak valid.');
    lots.push({ expiryDate: expiryDate, qty: lotQty });
    matchedText += match[0];
  }
  if (!lots.length) throw new Error(code + ' baris ' + rowNumber + ': format Expired Date harus seperti 01-07-2027 (2,0000).');
  const total = lots.reduce(function (sum, lot) { return sum + lot.qty; }, 0);
  const tolerance = Math.max(0.0001, qty * 0.000001);
  if (total > qty + tolerance) throw new Error(code + ' baris ' + rowNumber + ': total QTY expiry ' + formatQty_(total) + ' melebihi QTY ' + formatQty_(qty) + '.');
  if (qty - total > tolerance) lots.push({ expiryDate: '', qty: qty - total });
  return lots;
}

function extractReportCells_(base64, fileName, label) {
  if (!/\.xlsx$/i.test(fileName || '')) throw new Error('Pilih ' + label + ' Report dengan format .xlsx.');
  if (!base64) throw new Error('Data file ' + label + ' tidak ditemukan. Pilih kembali file.');
  let bytes;
  try { bytes = Utilities.base64Decode(String(base64).replace(/^data:[^,]+,/, '')); }
  catch (error) { throw new Error('File ' + label + ' tidak dapat dibaca sebagai Excel.'); }
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Ukuran file harus lebih dari 0 dan maksimal 10 MB.');
  if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error('File bukan workbook Excel .xlsx yang valid.');
  let files;
  try { files = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', 'report.zip')); }
  catch (error) {
    throw new Error('Paket internal Excel ' + label + ' gagal dibuka. Download ulang report dari ESB tanpa membuka atau menyimpan ulang file. Detail: ' +
      cleanText_(error && error.message ? error.message : error, 160));
  }
  const map = {}, sheets = [];
  let expandedSize = 0;
  files.forEach(function (file) {
    const name = String(file.getName() || '').replace(/^\/+/, '');
    expandedSize += file.getBytes().length;
    if (expandedSize > 30 * 1024 * 1024) {
      throw new Error('Isi workbook ' + label + ' terlalu besar untuk diproses.');
    }
    map[name] = file;
    if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) sheets.push(name);
  });
  sheets.sort(function (a, b) {
    const aNumber = Number((/sheet(\d+)\.xml$/i.exec(a) || [0, 0])[1]);
    const bNumber = Number((/sheet(\d+)\.xml$/i.exec(b) || [0, 0])[1]);
    return aNumber - bNumber;
  });
  if (!sheets.length) throw new Error('Worksheet ' + label + ' tidak ditemukan.');
  const shared = map['xl/sharedStrings.xml'] ?
    parseSharedStringsXml_(map['xl/sharedStrings.xml'].getDataAsString('UTF-8')) : [];
  const xml = map[sheets[0]].getDataAsString('UTF-8');
  const cells = parseWorksheetCellsXml_(xml, shared);
  // Parser regex menangani shared string, inline string, dan cell kosong dari
  // report ESB. DOM XML sangat lambat pada worksheet besar, jadi hanya pakai
  // fallback jika parser utama benar-benar tidak menemukan cell apa pun.
  if (!Object.keys(cells).length && typeof XmlService !== 'undefined') {
    const fallback = parseWorksheetCellsXmlDom_(xml, shared);
    Object.keys(fallback).forEach(function (address) {
      if (cells[address] === undefined || cells[address] === '') cells[address] = fallback[address];
    });
  }
  return cells;
}

function findReportHeader_(cells, requiredHeaders) {
  const rows = {};
  Object.keys(cells).forEach(function (address) {
    const match = /^([A-Z]+)(\d+)$/.exec(address);
    if (!match) return;
    const header = normalizeHeader_(cells[address]);
    if (!header) return;
    if (!rows[match[2]]) rows[match[2]] = {};
    rows[match[2]][header] = match[1];
  });
  const rowNumbers = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
  for (let i = 0; i < rowNumbers.length; i++) {
    const columns = rows[rowNumbers[i]];
    if (requiredHeaders.every(function (header) { return Boolean(columns[header]); })) {
      return { row: rowNumbers[i], columns: columns };
    }
  }
  throw new Error('Header tabel tidak ditemukan otomatis. Pastikan file memuat kolom: ' + requiredHeaders.join(', ') + '.');
}

function reportCell_(cells, header, name, rowNumber) {
  const column = header.columns[name];
  return column ? (cells[column + rowNumber] === undefined ? '' : cells[column + rowNumber]) : '';
}

function reportDataRows_(cells, header, codeHeader) {
  const column = header.columns[codeHeader], rows = {};
  if (!column) return [];
  const pattern = new RegExp('^' + column + '(\\d+)$');
  Object.keys(cells).forEach(function (address) {
    const match = pattern.exec(address);
    if (match && Number(match[1]) > header.row && String(cells[address] || '').trim()) rows[match[1]] = true;
  });
  return Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
}

function parseReportNumber_(value) {
  if (typeof value === 'number') return value;
  const text = String(value === null || value === undefined ? '' : value).trim().replace(/\s/g, '');
  if (!text) return NaN;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (/^-?\d+,\d+$/.test(text)) return Number(text.replace(',', '.'));
  return Number(text.replace(/\./g, '').replace(',', '.'));
}

function parseReportDate_(value, mode, rowNumber, label) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000 && serial < 100000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
      return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
    }
  }
  if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(text)) {
    const isoMatch = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(text);
    return validIsoDate_(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]), label, rowNumber);
  }
  const match = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/.exec(text);
  if (!match) throw new Error('Format tanggal ' + label + ' pada baris ' + rowNumber + ' tidak dikenali: "' + text + '".');
  const first = Number(match[1]), second = Number(match[2]), year = Number(match[3]);
  // ESB Expired Date is explicitly MM-DD-YYYY. Transaction dates are DD-MM-YYYY.
  const month = mode === 'EXPIRY' ? first : second;
  const day = mode === 'EXPIRY' ? second : first;
  return validIsoDate_(year, month, day, label, rowNumber);
}

function validIsoDate_(year, month, day, label, rowNumber) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error('Tanggal ' + label + ' pada baris ' + rowNumber + ' tidak valid.');
  }
  return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function parseReportExpiryLots_(value, qty, rowNumber, code) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) return [{ expiryDate: '', qty: qty }];
  const lots = [], pattern = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})(?:\s*\(([^)]+)\))?/g;
  let match;
  while ((match = pattern.exec(text))) {
    const lotQty = match[2] ? parseReportNumber_(match[2]) : qty;
    if (!isFinite(lotQty) || lotQty <= 0) throw new Error(code + ' · baris ' + rowNumber + ': QTY Expired Date tidak valid.');
    lots.push({ expiryDate: parseReportDate_(match[1], 'EXPIRY', rowNumber, 'Expired Date'), qty: lotQty });
  }
  if (!lots.length) throw new Error(code + ' · baris ' + rowNumber +
    ': format Expired Date tidak dikenali. Gunakan MM-DD-YYYY, contoh 09-25-2026 (1,0000).');
  const total = lots.reduce(function (sum, lot) { return sum + lot.qty; }, 0);
  const tolerance = Math.max(0.0001, qty * 0.000001);
  if (total > qty + tolerance) throw new Error(code + ' · baris ' + rowNumber +
    ': total QTY lot expired ' + formatQty_(total) + ' melebihi QTY report ' + formatQty_(qty) + '.');
  if (qty - total > tolerance) lots.push({ expiryDate: '', qty: qty - total });
  return lots;
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
  // Match paired and self-closing cells separately. ESB writes empty cells such
  // as F12 as <c .../>; treating that as an opening tag would swallow G12.
  String(xml || '').replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi, function (_, attrs, body) {
    const ref = /\br="([A-Z]+\d+)"/i.exec(attrs);
    if (!ref) return '';
    const typeMatch = /\bt="([^"]+)"/i.exec(attrs);
    const type = typeMatch ? typeMatch[1] : '';
    body = body || '';
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

function parseWorksheetCellsXmlDom_(xml, sharedStrings) {
  const cells = {};
  let document;
  try { document = XmlService.parse(String(xml || '')); }
  catch (error) { return cells; }
  const root = document.getRootElement(), namespace = root.getNamespace();
  const sheetData = root.getChild('sheetData', namespace);
  if (!sheetData) return cells;
  sheetData.getChildren('row', namespace).forEach(function (row) {
    row.getChildren('c', namespace).forEach(function (cell) {
      const refAttribute = cell.getAttribute('r');
      if (!refAttribute) return;
      const address = String(refAttribute.getValue() || '').toUpperCase();
      if (!/^[A-Z]+\d+$/.test(address)) return;
      const typeAttribute = cell.getAttribute('t');
      const type = typeAttribute ? String(typeAttribute.getValue() || '') : '';
      let value = '';
      if (type === 'inlineStr') {
        const inline = cell.getChild('is', namespace);
        if (inline) value = collectWorksheetTextXml_(inline, namespace);
      } else {
        const raw = cell.getChild('v', namespace);
        if (raw) {
          const rawValue = raw.getText();
          if (type === 's') {
            const index = Number(rawValue);
            value = isFinite(index) && sharedStrings[index] !== undefined ? sharedStrings[index] : '';
          } else value = rawValue;
        } else {
          value = collectWorksheetTextXml_(cell, namespace);
        }
      }
      cells[address] = value;
    });
  });
  return cells;
}

function collectWorksheetTextXml_(element, namespace) {
  let value = '';
  if (element.getName() === 't') value += element.getText();
  element.getChildren().forEach(function (child) {
    value += collectWorksheetTextXml_(child, namespace);
  });
  return value;
}

function decodeXmlText_(value) {
  return String(value || '').replace(/&#(x?[0-9a-f]+);|&(amp|lt|gt|quot|apos);/gi, function (match, numeric, named) {
    if (numeric) return String.fromCharCode(parseInt(numeric.replace(/^x/i, ''), /^x/i.test(numeric) ? 16 : 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[String(named).toLowerCase()] || match;
  });
}

function readStoreCodeMap_() {
  const directory = readStoreCodeDirectory_(), map = {};
  Object.keys(directory.byName).forEach(function (key) { map[key] = directory.byName[key].code; });
  return map;
}

function readStoreCodeDirectory_() {
  const cached = readScriptJsonCache_('stock-store-code-directory');
  if (cached) return cached;
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.STORE_CODE_SHEET);
  if (!sheet || sheet.getLastRow() < 1) throw new Error('Sheet STORE CODE belum tersedia atau masih kosong. Isi nama outlet panjang di kolom A dan kode singkat di kolom B.');
  const rows = sheet.getRange(1, 1, sheet.getLastRow(), 2).getDisplayValues();
  const byName = {}, byCode = {};
  rows.forEach(function (row, index) {
    const displayName = cleanText_(row[0], 160), name = normalizeStoreName_(displayName);
    const code = String(row[1] || '').trim().toUpperCase();
    if (!name && !code) return;
    if (!name || !code) throw new Error('STORE CODE baris ' + (index + 1) + ' belum lengkap. Kolom A wajib nama outlet panjang dan kolom B wajib kode singkat.');
    if (byName[name] && byName[name].code !== code) throw new Error('Nama outlet "' + displayName + '" memiliki lebih dari satu kode di sheet STORE CODE.');
    if (byCode[code] && byCode[code].normalizedName !== name) throw new Error('Kode outlet ' + code + ' digunakan untuk lebih dari satu nama outlet di sheet STORE CODE.');
    const entry = { name: displayName, normalizedName: name, code: code, row: index + 1 };
    byName[name] = entry;
    byCode[code] = entry;
  });
  if (!Object.keys(byName).length) throw new Error('Sheet STORE CODE belum berisi pasangan nama outlet dan kode.');
  const result = { byName: byName, byCode: byCode };
  writeScriptJsonCache_('stock-store-code-directory', result, 600);
  return result;
}

function salesUsageHashAlreadyImported_(outlet, sourceHash) {
  const sql = 'SELECT COUNT(*) AS total FROM ' + stockCardTable_() + ' ' +
    'WHERE record_type IN (\'MOVEMENT\', \'IMPORT\') AND outlet = @outlet AND movement_type = \'Terjual\' AND source_hash = @sourceHash';
  const rows = runNamedQuery_(sql, { outlet: outlet, sourceHash: sourceHash });
  return rows.length && Number(rows[0].total || 0) > 0;
}

function readExistingSalesUsageItemCodes_(outlet, transactionDate) {
  const sql = 'SELECT DISTINCT UPPER(item_code) AS item_code FROM ' + stockCardTable_() + ' ' +
    'WHERE record_type = \'MOVEMENT\' AND outlet = @outlet AND movement_type = \'Terjual\' ' +
    'AND event_date = CAST(@transactionDate AS DATE) AND source_file IS NOT NULL AND source_file != \'\' AND item_code IS NOT NULL';
  const map = {};
  runNamedQuery_(sql, { outlet: outlet, transactionDate: transactionDate }).forEach(function (row) {
    const code = String(row.item_code || '').trim().toUpperCase();
    if (code) map[code] = true;
  });
  return map;
}

function normalizeStoreName_(value) { return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase(); }
function normalizeHeader_(value) { return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase(); }
function normalizeUnit_(value) { return String(value || '').trim().replace(/\s+/g, '').toUpperCase(); }

function defaultUnitConversionFactor_(fromUnit, toUnit) {
  const pair = normalizeUnit_(fromUnit) + '|' + normalizeUnit_(toUnit);
  const defaults = { 'KG|GR': 1000, 'GR|KG': 0.001, 'L|ML': 1000, 'ML|L': 0.001 };
  return Number(defaults[pair] || 0);
}

function resolveUnitConversionFactor_(itemCode, fromUnit, toUnit, provided, saved) {
  fromUnit = normalizeUnit_(fromUnit); toUnit = normalizeUnit_(toUnit);
  if (fromUnit === toUnit) return 1;
  const standard = defaultUnitConversionFactor_(fromUnit, toUnit);
  if (standard) return standard;
  const direct = stockConversionKey_(itemCode, fromUnit, toUnit), inverse = stockConversionKey_(itemCode, toUnit, fromUnit);
  let factor = Number(provided && provided[direct]);
  if (!isFinite(factor) || factor <= 0) factor = saved && saved[direct] && Number(saved[direct].factor);
  if (isFinite(factor) && factor > 0) return factor;
  let inverseFactor = Number(provided && provided[inverse]);
  if (!isFinite(inverseFactor) || inverseFactor <= 0) inverseFactor = saved && saved[inverse] && Number(saved[inverse].factor);
  return isFinite(inverseFactor) && inverseFactor > 0 ? 1 / inverseFactor : 0;
}

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
    const item = findStockItemForLocation_(location, payload.itemCode || payload.itemName);
    const fastHistory = isShowcaseLocation_(location) ? null : readFastStockHistory_(outlet, location, item);
    let rows = fastHistory ? fastHistory.history : readLatestStockHistory_(outlet, location, item);
    if (!fastHistory && isShowcaseLocation_(location)) rows = enrichShowcaseHistoryLots_(rows, outlet, item);
    const employeeNames = readEmployeeNameMap_();
    rows.forEach(function (row) { row.createdByUser = employeeNames[row.createdBy] || row.createdBy || 'User tidak diketahui'; });
    const currentQty = fastHistory ? Number(fastHistory.currentQty || 0) : getCurrentStock_(outlet, location, item.code, item.name).qty;
    return {
      item: item, outlet: outlet, location: location, currentQty: currentQty,
      history: rows, fastSource: fastHistory && fastHistory.meta ? fastHistory.meta.source : 'BIGQUERY_FALLBACK'
    };
  });
}

/** WIP recipe master and production ledger. */
function ensureWipRecipeSheet_() {
  const headers = ['FORMULA_CODE', 'FORMULA_NAME', 'FINISHED_UNIT', 'MATERIAL_CODE', 'MATERIAL_NAME', 'QTY_USAGE', 'MATERIAL_UNIT'];
  const sheet = ensureSheet_(CONFIG.WIP_RECIPE_SHEET, headers);
  if (sheet.getLastRow() < 2) {
    const seed = wipRecipeSeedRows_();
    if (seed.length) sheet.getRange(2, 1, seed.length, headers.length).setValues(seed);
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#9f172b').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 1, 120);
  sheet.setColumnWidths(2, 1, 260);
  sheet.setColumnWidths(3, 1, 95);
  sheet.setColumnWidths(4, 1, 120);
  sheet.setColumnWidths(5, 1, 260);
  sheet.setColumnWidths(6, 2, 105);
  return sheet;
}

function wipRecipeSeedRows_() {
  const encoded = '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';
  if (!encoded || encoded.indexOf('__WIP_') === 0) return [];
  const json = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(encoded))).getDataAsString('UTF-8');
  return JSON.parse(json);
}

function readWipRecipeCatalog_() {
  const sheet = ensureWipRecipeSheet_(), result = { variants: [], byCode: {}, invalidRowsSkipped: 0 };
  if (sheet.getLastRow() < 2) return result;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getDisplayValues();
  const variants = {};
  rows.forEach(function (row, index) {
    const code = cleanText_(row[0], 80).toUpperCase(), name = cleanText_(row[1], 180), finishedUnit = normalizeUnit_(row[2]);
    const materialCode = cleanText_(row[3], 80).toUpperCase(), materialName = cleanText_(row[4], 180);
    const qty = Number(String(row[5] || '').replace(',', '.')), materialUnit = normalizeUnit_(row[6]);
    if (!code || !name || !finishedUnit || !materialCode || materialCode === '0' || !materialName || materialName === '0' ||
        !isFinite(qty) || qty <= 0 || !materialUnit || materialUnit === '0' || materialUnit === '-') {
      result.invalidRowsSkipped++;
      return;
    }
    const key = code + '|' + name.toUpperCase() + '|' + finishedUnit;
    if (!variants[key]) variants[key] = { key: key, code: code, name: name, unit: finishedUnit, materials: [] };
    variants[key].materials.push({ sourceRow: index + 2, code: materialCode, name: materialName, qty: qty, unit: materialUnit });
  });
  Object.keys(variants).forEach(function (key) {
    const variant = variants[key];
    result.variants.push(variant);
    if (!result.byCode[variant.code]) result.byCode[variant.code] = [];
    result.byCode[variant.code].push(variant);
  });
  result.variants.sort(function (a, b) { return a.name.localeCompare(b.name) || a.code.localeCompare(b.code); });
  Object.keys(result.byCode).forEach(function (code) {
    result.byCode[code].sort(function (a, b) { return a.name.localeCompare(b.name) || a.key.localeCompare(b.key); });
  });
  return result;
}

function wipConversionFactor_(itemCode, fromUnit, toUnit, provided, saved) {
  return resolveUnitConversionFactor_(itemCode, fromUnit, toUnit, provided, saved);
}

function wipConversionRequest_(requests, requestMap, item, fromUnit, toUnit) {
  const key = stockConversionKey_(item.code, fromUnit, toUnit);
  const inverseKey = stockConversionKey_(item.code, toUnit, fromUnit);
  if (requestMap[inverseKey]) return;
  if (!requestMap[key]) {
    requestMap[key] = { key: key, itemCode: item.code, itemName: item.name, fromUnit: fromUnit, toUnit: toUnit };
    requests.push(requestMap[key]);
  }
}

function getWipProductionOptions(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    if (isShowcaseLocation_(context.location)) throw new Error('Produksi WIP tidak tersedia untuk penyimpanan Showcase.');
    const catalog = readWipRecipeCatalog_(), masterMap = {}, saved = readStockUnitConversions_();
    readStockMaster_(true).forEach(function (item) { masterMap[item.code.toUpperCase()] = item; });
    const variants = catalog.variants.filter(function (variant) { return Boolean(masterMap[variant.code] && masterMap[variant.code].active); }).map(function (variant) {
      const item = masterMap[variant.code], candidates = {};
      candidates[variant.unit] = true; candidates[normalizeUnit_(item.unit)] = true;
      Object.keys(saved).forEach(function (key) {
        const conversion = saved[key];
        if (conversion.itemCode !== variant.code) return;
        if (wipConversionFactor_(variant.code, conversion.fromUnit, variant.unit, {}, saved)) candidates[conversion.fromUnit] = true;
        if (wipConversionFactor_(variant.code, conversion.toUnit, variant.unit, {}, saved)) candidates[conversion.toUnit] = true;
      });
      const units = Object.keys(candidates).filter(function (unit) {
        return unit === normalizeUnit_(item.unit) || wipConversionFactor_(variant.code, unit, variant.unit, {}, saved) > 0;
      });
      return { key: variant.key, code: variant.code, name: variant.name, formulaUnit: variant.unit, stockUnit: item.unit, units: units, materialCount: variant.materials.length };
    });
    return { outlet: context.outlet, location: context.location, variants: variants, invalidRowsSkipped: catalog.invalidRowsSkipped, sheetName: CONFIG.WIP_RECIPE_SHEET };
  });
}

function wipTemplateOptions_() {
  const catalog = readWipRecipeCatalog_(), masterMap = {}, counts = {}, indexes = {};
  readStockMaster_(true).forEach(function (item) { masterMap[item.code.toUpperCase()] = item; });
  catalog.variants.forEach(function (variant) { if (masterMap[variant.code] && masterMap[variant.code].active) counts[variant.code] = Number(counts[variant.code] || 0) + 1; });
  return catalog.variants.filter(function (variant) { return Boolean(masterMap[variant.code] && masterMap[variant.code].active); }).map(function (variant) {
    const item = masterMap[variant.code];
    indexes[variant.code] = Number(indexes[variant.code] || 0) + 1;
    const choice = counts[variant.code] > 1 ? ' | Pilihan ' + String.fromCharCode(64 + indexes[variant.code]) : '';
    return {
      label: variant.code + ' | ' + variant.name + choice,
      key: variant.key, code: variant.code, name: variant.name,
      stockUnit: normalizeUnit_(item.unit), formulaUnit: variant.unit
    };
  });
}

function downloadWipProductionTemplate(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    if (isShowcaseLocation_(context.location)) throw new Error('Template Produksi WIP tidak tersedia untuk penyimpanan Showcase.');
    const options = wipTemplateOptions_();
    if (!options.length) throw new Error('Belum ada produk WIP aktif yang cocok antara WIP_RECIPES dan STOCK_ITEMS.');
    let workbook = null;
    try {
      workbook = SpreadsheetApp.create('TEMP_WIP_TEMPLATE_' + Utilities.getUuid());
      const sheet = workbook.getSheets()[0], list = workbook.insertSheet('WIP_LIST');
      sheet.setName('Produksi WIP');
      sheet.getRange('A1:E1').merge().setValue('TEMPLATE UPLOAD PRODUKSI WIP').setBackground('#7f1d32').setFontColor('#ffffff').setFontWeight('bold').setFontSize(15);
      sheet.getRange('A2').setValue('TANGGAL TRANSAKSI').setFontWeight('bold');
      sheet.getRange('B2').setValue(new Date()).setNumberFormat('dd/mm/yyyy');
      sheet.getRange('A3:E3').merge().setValue('Pilih item dari dropdown. Unit otomatis mengikuti Unit Default STOCK_ITEMS. Production Date dan Expired Date bersifat opsional.');
      const headers = ['WIP ITEM', 'QTY', 'UNIT', 'PRODUCTION DATE', 'EXPIRED DATE'];
      sheet.getRange(4, 1, 1, headers.length).setValues([headers]).setBackground('#9f172b').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setFrozenRows(4);
      sheet.setColumnWidths(1, 1, 390); sheet.setColumnWidths(2, 1, 100); sheet.setColumnWidths(3, 1, 110); sheet.setColumnWidths(4, 2, 140);
      const listRows = [['WIP ITEM', 'UNIT DEFAULT', 'UNIT RESEP', 'RECIPE KEY']].concat(options.map(function (option) {
        return [option.label, option.stockUnit, option.formulaUnit, option.key];
      }));
      list.getRange(1, 1, listRows.length, 4).setValues(listRows);
      const inputRows = 300, firstInputRow = 5;
      const validation = SpreadsheetApp.newDataValidation().requireValueInRange(list.getRange(2, 1, options.length, 1), true).setAllowInvalid(false).build();
      sheet.getRange(firstInputRow, 1, inputRows, 1).setDataValidation(validation);
      sheet.getRange(firstInputRow, 2, inputRows, 1).setNumberFormat('#,##0.00');
      const unitFormulas = [];
      for (let rowNumber = firstInputRow; rowNumber < firstInputRow + inputRows; rowNumber++) {
        unitFormulas.push(['=IFERROR(VLOOKUP(A' + rowNumber + ',WIP_LIST!$A$2:$B$' + (options.length + 1) + ',2,FALSE),"")']);
      }
      sheet.getRange(firstInputRow, 3, inputRows, 1).setFormulas(unitFormulas);
      sheet.getRange(firstInputRow, 4, inputRows, 2).setNumberFormat('dd/mm/yyyy');
      sheet.getRange(firstInputRow, 1, inputRows, 5).setVerticalAlignment('middle');
      list.hideSheet();
      SpreadsheetApp.flush();
      const response = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + workbook.getId() + '/export?format=xlsx', {
        method: 'get', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
      });
      if (response.getResponseCode() !== 200) throw new Error('Export template merespons HTTP ' + response.getResponseCode() + '.');
      const blob = response.getBlob().setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .setName('Template_Produksi_WIP_' + context.outlet + '.xlsx');
      const bytes = blob.getBytes();
      if (bytes.length < 4 || bytes[0] !== 80 || bytes[1] !== 75) throw new Error('Hasil template bukan file XLSX yang valid.');
      return { fileName: blob.getName(), mimeType: blob.getContentType(), data: Utilities.base64Encode(bytes) };
    } finally {
      if (workbook) {
        try { DriveApp.getFileById(workbook.getId()).setTrashed(true); } catch (cleanupError) {}
      }
    }
  });
}

function parseOptionalWipTemplateDate_(value, rowNumber, label) {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  return parseReportDate_(value, 'TRANSACTION', rowNumber, label);
}

function parseWipProductionTemplate_(base64, fileName) {
  const cells = extractReportCells_(base64, fileName, 'Produksi WIP');
  const header = findReportHeader_(cells, ['WIP ITEM', 'QTY']);
  const eventDate = parseReportDate_(cells.B2, 'TRANSACTION', 2, 'Tanggal Transaksi');
  const options = wipTemplateOptions_(), byLabel = {}, byCode = {};
  options.forEach(function (option) {
    byLabel[option.label.trim().toUpperCase()] = option;
    if (!byCode[option.code]) byCode[option.code] = [];
    byCode[option.code].push(option);
  });
  const lines = [], errors = [];
  reportDataRows_(cells, header, 'WIP ITEM').forEach(function (rowNumber) {
    const selected = cleanText_(reportCell_(cells, header, 'WIP ITEM', rowNumber), 500);
    const code = selected.trim().toUpperCase(), matches = byCode[code] || [];
    const option = byLabel[selected.trim().toUpperCase()] || (matches.length === 1 ? matches[0] : null);
    const qty = parseReportNumber_(reportCell_(cells, header, 'QTY', rowNumber));
    if (!option) { errors.push('Baris ' + rowNumber + ': WIP ITEM tidak dikenali atau bukan pilihan dropdown.'); return; }
    if (!isFinite(qty) || qty <= 0) { errors.push('Baris ' + rowNumber + ': QTY ' + option.code + ' harus lebih besar dari 0.'); return; }
    const unit = normalizeUnit_(reportCell_(cells, header, 'UNIT', rowNumber)) || option.stockUnit;
    lines.push({
      sourceRow: rowNumber, code: option.code, name: option.name, variantKey: option.key, qty: qty, unit: unit,
      productionDate: parseOptionalWipTemplateDate_(reportCell_(cells, header, 'PRODUCTION DATE', rowNumber), rowNumber, 'Production Date'),
      expiryDate: parseOptionalWipTemplateDate_(reportCell_(cells, header, 'EXPIRED DATE', rowNumber), rowNumber, 'Expired Date')
    });
  });
  if (errors.length) throw new Error(errors.slice(0, 8).join(' '));
  if (!lines.length) throw new Error('Template Produksi WIP belum memiliki baris dengan item dan QTY.');
  if (lines.length > 300) throw new Error('Maksimal 300 baris produksi dalam satu file.');
  return { eventDate: eventDate, lines: lines, sourceHash: digest_(String(base64 || '')) };
}

function previewWipProductionUpload(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    if (isShowcaseLocation_(context.location)) throw new Error('Upload Produksi WIP tidak tersedia untuk penyimpanan Showcase.');
    const parsed = parseWipProductionTemplate_(String(payload.base64 || '').replace(/^data:[^,]+,/, ''), cleanText_(payload.fileName, 180));
    const prepared = prepareWipProductionLines_(context, { lines: parsed.lines, eventDate: parsed.eventDate, conversions: payload.conversions || {} }, false);
    return {
      fileName: cleanText_(payload.fileName, 180), eventDate: parsed.eventDate, sourceHash: parsed.sourceHash,
      lines: parsed.lines, requiresConversion: Boolean(prepared.requiresConversion),
      conversions: prepared.requiresConversion ? prepared.conversionRequests : [], productionCount: parsed.lines.length
    };
  });
}

function prepareWipProductionLines_(context, payload, allowNegativeRaw) {
  const lines = Array.isArray(payload.lines) ? payload.lines : [], catalog = readWipRecipeCatalog_();
  if (!lines.length) throw new Error('Tambahkan minimal satu item WIP yang akan diproduksi.');
  const masterMap = {};
  readStockMaster_(true).forEach(function (item) { masterMap[item.code.toUpperCase()] = item; });
  const saved = readStockUnitConversions_(), provided = payload.conversions && typeof payload.conversions === 'object' ? payload.conversions : {};
  const conversionRequests = [], requestMap = {}, plans = [], rawTotals = {};
  lines.forEach(function (line, lineIndex) {
    const code = cleanText_(line.code, 80).toUpperCase(), variants = catalog.byCode[code] || [];
    const variantKey = cleanText_(line.variantKey, 500);
    const variant = variants.filter(function (entry) { return entry.key === variantKey; })[0];
    const outputItem = masterMap[code], qty = Number(line.qty), inputUnit = normalizeUnit_(line.unit) || normalizeUnit_(outputItem && outputItem.unit);
    if (!variant) throw new Error('Resep WIP baris ' + (lineIndex + 1) + ' tidak ditemukan atau belum dipilih.');
    if (!outputItem) throw new Error(code + ' · ' + variant.name + ': belum tersedia pada STOCK_ITEMS.');
    if (!normalizeUnit_(outputItem.unit)) throw new Error(code + ' · ' + variant.name + ': Unit Default hasil WIP pada STOCK_ITEMS masih kosong.');
    if (!isFinite(qty) || qty <= 0) throw new Error(code + ' · ' + variant.name + ': QTY produksi wajib lebih besar dari 0.');
    const outputToFormula = wipConversionFactor_(code, inputUnit, variant.unit, provided, saved);
    if (!outputToFormula) wipConversionRequest_(conversionRequests, requestMap, outputItem, inputUnit, variant.unit);
    const formulaQty = outputToFormula ? qty * outputToFormula : 0;
    const formulaToStock = wipConversionFactor_(code, variant.unit, outputItem.unit, provided, saved);
    if (!formulaToStock) wipConversionRequest_(conversionRequests, requestMap, outputItem, variant.unit, outputItem.unit);
    const outputQty = formulaToStock ? formulaQty * formulaToStock : 0;
    const materials = [];
    variant.materials.forEach(function (recipe) {
      const material = masterMap[recipe.code];
      if (!material) throw new Error(recipe.code + ' · ' + recipe.name + ': raw material belum tersedia pada STOCK_ITEMS.');
      if (!normalizeUnit_(material.unit)) throw new Error(recipe.code + ' · ' + material.name + ': Unit Default bahan pada STOCK_ITEMS masih kosong.');
      const factor = wipConversionFactor_(recipe.code, recipe.unit, material.unit, provided, saved);
      if (!factor) wipConversionRequest_(conversionRequests, requestMap, material, recipe.unit, material.unit);
      const rawQty = factor ? recipe.qty * formulaQty * factor : 0;
      materials.push({ item: material, qty: rawQty, recipeQty: recipe.qty, recipeUnit: recipe.unit, sourceRow: recipe.sourceRow });
      if (factor) rawTotals[material.code] = Number(rawTotals[material.code] || 0) + rawQty;
    });
    plans.push({ variant: variant, outputItem: outputItem, inputQty: qty, inputUnit: inputUnit, formulaQty: formulaQty, outputQty: outputQty, materials: materials, sourceRow: Number(line.sourceRow || 0),
      productionDate: normalizeDate_(line.productionDate || payload.productionDate, false), expiryDate: normalizeDate_(line.expiryDate || payload.expiryDate, false) });
  });
  if (conversionRequests.length) return { requiresConversion: true, conversionRequests: conversionRequests };
  const current = readCurrentStockCodeQtyMap_(context.outlet, context.location), credits = payload._stockCredits || {}, shortages = [];
  Object.keys(rawTotals).forEach(function (code) {
    const available = Number(current[code] || 0) + Number(credits[code] || 0), required = Number(rawTotals[code] || 0);
    if (available + 0.0000001 < required) shortages.push({ itemCode: code, itemName: masterMap[code].name, unit: masterMap[code].unit, available: available, required: required, shortage: required - available });
  });
  if (shortages.length && !allowNegativeRaw) throw new Error('Produksi diblokir karena raw material tidak mencukupi: ' + shortages.slice(0, 8).map(function (line) { return line.itemCode + ' · ' + line.itemName + ' · kurang ' + formatQty_(line.shortage) + ' ' + line.unit; }).join(', ') + '.');
  return { requiresConversion: false, plans: plans, rawTotals: rawTotals, shortages: shortages, current: current };
}

function processWipProduction(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    if (isShowcaseLocation_(context.location)) throw new Error('Produksi WIP tidak tersedia untuk penyimpanan Showcase.');
    const lock = acquireStockWriteLock_();
    try {
      const editId = cleanText_(payload.productionId, 100), sourceFile = cleanText_(payload.sourceFile, 180), sourceHash = cleanText_(payload.sourceHash, 100);
      const previous = editId ? readLatestProductionRows_(context.outlet, context.location, editId).filter(function (row) { return Number(row.qty || 0) > 0; }) : [];
      if (editId && !previous.length) throw new Error('Produksi yang akan diedit tidak ditemukan atau sudah dibatalkan.');
      if (!editId && sourceHash && wipProductionHashAlreadyImported_(context.outlet, context.location, sourceHash)) {
        throw new Error('File Produksi WIP yang sama sudah pernah diproses untuk outlet dan penyimpanan ini.');
      }
      const credits = {};
      previous.forEach(function (row) { if (String(row.direction || '') === 'OUT') credits[String(row.item_code || '').toUpperCase()] = Number(credits[String(row.item_code || '').toUpperCase()] || 0) + Number(row.qty || 0); });
      const previousOutput = previous.filter(function (row) { return String(row.movement_type || '') === 'Production'; })[0];
      if (previousOutput) {
        const liveOutput = getCurrentStock_(context.outlet, context.location, String(previousOutput.item_code || ''), String(previousOutput.item_name || '')).qty;
        if (liveOutput + 0.0000001 < Number(previousOutput.qty || 0)) throw new Error('Produksi tidak dapat diedit karena sebagian hasil WIP sudah digunakan.');
      }
      const preparedPayload = Object.assign({}, payload, { _stockCredits: credits });
      const prepared = prepareWipProductionLines_(context, preparedPayload, false);
      if (prepared.requiresConversion) return { produced: false, requiresConversion: true, conversions: prepared.conversionRequests };
      if (editId && prepared.plans.length !== 1) throw new Error('Edit produksi hanya dapat dilakukan untuk satu item.');
      const now = new Date(), eventDate = normalizeDate_(payload.eventDate, true), rows = [], productionIds = [];
      previous.forEach(function (row) {
        const id = Utilities.getUuid();
        rows.push({ insertId: id, json: {
          record_id: id, logical_id: String(row.logical_id || ''), version: Number(row.version || 1) + 1, record_type: 'MOVEMENT', outlet: context.outlet, location: context.location,
          item_code: String(row.item_code || ''), category: String(row.category || ''), item_name: String(row.item_name || ''), unit: String(row.unit || ''),
          direction: String(row.direction || ''), qty: 0, movement_type: String(row.movement_type || ''), info: cleanText_('Diganti melalui edit produksi · ' + editId, 500),
          production_date: row.production_date || null, expiry_date: row.expiry_date || null, event_date: String(row.event_date || eventDate), created_at: now.getTime() / 1000,
          created_by: context.employee.nik, transfer_id: editId
        }});
      });
      prepared.plans.forEach(function (plan) {
        const productionId = editId || Utilities.getUuid(), outputId = Utilities.getUuid();
        productionIds.push(productionId);
        const label = 'Produksi WIP · ' + plan.variant.name + ' · Resep ' + plan.variant.key + ' · Formula ' + formatQty_(plan.formulaQty) + ' ' + plan.variant.unit;
        rows.push({ insertId: outputId, json: {
          record_id: outputId, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT', outlet: context.outlet, location: context.location,
          item_code: plan.outputItem.code, category: plan.outputItem.category, item_name: plan.outputItem.name, unit: plan.outputItem.unit,
          direction: 'IN', qty: plan.outputQty, movement_type: 'Production', info: cleanText_(label, 500), production_date: plan.productionDate || null,
          expiry_date: plan.expiryDate || null, event_date: eventDate, created_at: now.getTime() / 1000, created_by: context.employee.nik, transfer_id: productionId,
          source_file: sourceFile ? 'WIP_PRODUCTION|' + sourceFile : null, source_hash: sourceHash || null, source_row: sourceFile ? plan.sourceRow : null
        }});
        plan.materials.forEach(function (material) {
          const recordId = Utilities.getUuid();
          rows.push({ insertId: recordId, json: {
            record_id: recordId, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT', outlet: context.outlet, location: context.location,
            item_code: material.item.code, category: material.item.category, item_name: material.item.name, unit: material.item.unit,
            direction: 'OUT', qty: material.qty, movement_type: 'WIP Material Usage', info: cleanText_('Keluar untuk Produk WIP: ' + plan.variant.name + ' (' + plan.variant.code + ') · Produksi ' + productionId, 500),
            expiry_date: null, event_date: eventDate, created_at: now.getTime() / 1000, created_by: context.employee.nik, transfer_id: productionId,
            source_file: sourceFile ? 'WIP_PRODUCTION|' + sourceFile : null, source_hash: sourceHash || null, source_row: sourceFile ? plan.sourceRow : null
          }});
        });
      });
      insertStockCardRows_(rows);
      return { produced: true, edited: Boolean(editId), productionCount: prepared.plans.length, movementCount: rows.length, productionIds: productionIds, shortages: [] };
    } finally { lock.releaseLock(); }
  });
}

function wipProductionHashAlreadyImported_(outlet, location, sourceHash) {
  if (!sourceHash) return false;
  const sql = 'SELECT COUNT(*) AS total FROM ' + stockCardTable_() + ' ' +
    'WHERE outlet = @outlet AND location = @location AND movement_type = \'Production\' AND source_hash = @sourceHash ' +
    'AND STARTS_WITH(COALESCE(source_file, \'\'), \'WIP_PRODUCTION|\')';
  const rows = runNamedQuery_(sql, { outlet: outlet, location: location, sourceHash: sourceHash }, { useQueryCache: false });
  return rows.length && Number(rows[0].total || 0) > 0;
}

function readLatestProductionRows_(outlet, location, productionId) {
  const sql = latestStockMovementCte_() + ' SELECT * FROM latest WHERE outlet = @outlet AND location = @location AND transfer_id = @productionId ' +
    'AND movement_type IN (\'Production\', \'WIP Material Usage\') ORDER BY created_at ASC';
  return runNamedQuery_(sql, { outlet: outlet, location: location, productionId: productionId }, { useQueryCache: false });
}

function getWipProductionDetail(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location), productionId = cleanText_(payload.productionId, 100);
    const rows = readLatestProductionRows_(context.outlet, context.location, productionId), output = rows.filter(function (row) { return row.movement_type === 'Production' && Number(row.qty || 0) > 0; })[0];
    if (!output) throw new Error('Data produksi tidak ditemukan atau sudah dibatalkan.');
    const recipeMatch = /Resep\s+(.+?)\s+·\s+Formula/i.exec(String(output.info || ''));
    return { productionId: productionId, line: { code: String(output.item_code || ''), name: String(output.item_name || ''), qty: Number(output.qty || 0), unit: String(output.unit || ''), variantKey: recipeMatch ? recipeMatch[1].trim() : '', productionDate: String(output.production_date || ''), expiryDate: String(output.expiry_date || ''), eventDate: String(output.event_date || '') } };
  });
}

function cancelWipProduction(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location), productionId = cleanText_(payload.productionId, 100);
    if (!productionId) throw new Error('Nomor produksi tidak ditemukan.');
    const lock = acquireStockWriteLock_();
    try {
      const previous = readLatestProductionRows_(context.outlet, context.location, productionId).filter(function (row) { return Number(row.qty || 0) > 0; });
      if (!previous.length) throw new Error('Produksi sudah dibatalkan atau tidak ditemukan.');
      const output = previous.filter(function (row) { return row.movement_type === 'Production'; })[0];
      if (output) {
        const live = getCurrentStock_(context.outlet, context.location, String(output.item_code || ''), String(output.item_name || '')).qty;
        if (live + 0.0000001 < Number(output.qty || 0)) throw new Error('Produksi tidak dapat dihapus karena sebagian hasil WIP sudah digunakan. Buat Stock Adjustment bila perlu.');
      }
      const now = new Date(), rows = previous.map(function (row) {
        const id = Utilities.getUuid();
        return { insertId: id, json: {
          record_id: id, logical_id: String(row.logical_id || ''), version: Number(row.version || 1) + 1, record_type: 'MOVEMENT', outlet: context.outlet, location: context.location,
          item_code: String(row.item_code || ''), category: String(row.category || ''), item_name: String(row.item_name || ''), unit: String(row.unit || ''),
          direction: String(row.direction || ''), qty: 0, movement_type: String(row.movement_type || ''), info: cleanText_('Produksi dibatalkan · ' + productionId, 500),
          production_date: row.production_date || null, expiry_date: row.expiry_date || null, event_date: String(row.event_date || todayIso_()), created_at: now.getTime() / 1000,
          created_by: context.employee.nik, transfer_id: productionId
        }};
      });
      insertStockCardRows_(rows);
      return { cancelled: true, productionId: productionId };
    } finally { lock.releaseLock(); }
  });
}

function stockFastApiConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const url = String(properties.getProperty('STOCK_CARD_API_URL') || '').replace(/\/+$/, '');
  const key = String(properties.getProperty('STOCK_CARD_API_KEY') || '');
  return url && key ? { url: url, key: key } : null;
}

function readFastStockHistory_(outlet, location, item) {
  const config = stockFastApiConfig_();
  if (!config) return null;
  try {
    const query = [
      'outlet=' + encodeURIComponent(outlet),
      'location=' + encodeURIComponent(location),
      'itemCode=' + encodeURIComponent(item.code || ''),
      'itemName=' + encodeURIComponent(item.name || ''),
      'limit=500'
    ].join('&');
    const response = UrlFetchApp.fetch(config.url + '/v1/stock/history?' + query, {
      method: 'get', headers: { 'x-internal-api-key': config.key }, muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) throw new Error('HTTP ' + response.getResponseCode());
    const parsed = JSON.parse(response.getContentText() || '{}');
    if (!parsed.ok || !parsed.data || !Array.isArray(parsed.data.history)) throw new Error('Respons tidak valid.');
    return parsed.data;
  } catch (error) {
    console.error('Cloud Run Stock History gagal; menggunakan BigQuery langsung. ' + error.message);
    return null;
  }
}

function invalidateFastStockHistoryRows_(rows) {
  const config = stockFastApiConfig_();
  if (!config) return;
  const entries = [], seen = {};
  (rows || []).forEach(function (entry) {
    const row = entry && entry.json ? entry.json : entry;
    if (!row || row.record_type !== 'MOVEMENT' || !row.outlet || !row.location) return;
    const key = [row.outlet, row.location, row.item_code || '', row.item_name || ''].join('|');
    if (seen[key]) return;
    seen[key] = true;
    entries.push({ outlet: row.outlet, location: row.location, itemCode: row.item_code || '', itemName: row.item_name || '' });
  });
  if (!entries.length) return;
  try {
    const response = UrlFetchApp.fetch(config.url + '/v1/cache/invalidate-batch', {
      method: 'post', contentType: 'application/json', headers: { 'x-internal-api-key': config.key },
      payload: JSON.stringify({ entries: entries.slice(0, 500) }), muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) throw new Error('HTTP ' + response.getResponseCode());
  } catch (error) {
    console.error('Invalidasi cache Stock Card gagal; cache akan berakhir otomatis. ' + error.message);
  }
}

function exportCurrentStockExcel(token, requestedOutlet, requestedLocation) {
  return safe_(function () {
    const context = resolveStockContext_(token, requestedOutlet, requestedLocation);
    const items = readStockItemsWithQty_(context.outlet, context.location).filter(function (item) {
      // Stock opname export only needs items that currently carry a balance.
      // Keep both positive and negative stock; omit empty/zero rows.
      return !item.hidden && isFinite(Number(item.qty)) && Math.abs(Number(item.qty)) > 0.0000001;
    }).sort(function (a, b) {
      const aNegative = Number(a.qty) < 0, bNegative = Number(b.qty) < 0;
      if (aNegative !== bNegative) return aNegative ? -1 : 1;
      return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    });
    const title = 'Stok Saat Ini';
    const rows = items.map(function (item) { return [item.code, item.category, item.name, item.unit, Number(item.qty), '']; });
    return buildStockExport_(title, context.outlet, context.location, '',
      ['Kode Item', 'Category', 'Nama Item', 'Unit', 'QTY On Stock Card', 'QTY Stock Actual'], rows, 'xlsx');
  });
}

function exportStockCardItem(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const item = findStockItemForLocation_(context.location, payload.itemCode || payload.itemName);
    const month = String(payload.month || '').trim();
    const format = String(payload.format || '').toLowerCase();
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Pilih bulan laporan terlebih dahulu.');
    if (['xlsx', 'pdf'].indexOf(format) < 0) throw new Error('Format export tidak valid.');
    let history = readLatestStockHistory_(context.outlet, context.location, item);
    if (isShowcaseLocation_(context.location)) history = enrichShowcaseHistoryLots_(history, context.outlet, item);
    const employeeNames = readEmployeeNameMap_();
    history.forEach(function (row) { row.createdByUser = (employeeNames[row.createdBy] || row.createdBy || 'User tidak diketahui') + (employeeNames[row.createdBy] && row.createdBy ? ' · ' + row.createdBy : ''); });
    const current = getCurrentStock_(context.outlet, context.location, item.code, item.name);
    const fifoSnapshots = calculateFifoSnapshots_(history);
    const fifoSnapshotDates = Object.keys(fifoSnapshots).sort();
    const currentFifoLots = fifoSnapshotDates.length ? fifoSnapshots[fifoSnapshotDates[fifoSnapshotDates.length - 1]] : [];
    const grouped = addBalancesToGroupedHistory_(groupStockHistoryByDate_(history), current.qty).filter(function (day) { return String(day.date).slice(0, 7) === month; });
    const rows = grouped.map(function (day, index) {
      const dayLots = index === 0 ? currentFifoLots : (fifoSnapshots[day.date] || []);
      return [day.date, day.inMovements.length ? day.inQty : '', stockMovementInfo_(day.inMovements), day.outMovements.length ? day.outQty : '', stockMovementInfo_(day.outMovements), day.balance, fifoDetailText_(reconcileFifoLots_(dayLots, day.balance), item.unit, context.location)];
    });
    const detailHeader = 'Prd · Stock In · Arrival · Exp';
    return buildStockExport_('Stock Card · ' + item.code + ' · ' + item.name, context.outlet, context.location, month, ['Tanggal', 'IN', 'Info IN', 'OUT', 'Info OUT', 'Balance', detailHeader], rows, format);
  });
}

function ensureStockCardReadInfrastructure_() {
  const version = 'stock-card-read-ready-v17';
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(version) === '1') return;
  try {
    BigQuery.Tables.get(CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID, stockCardTableId_());
    BigQuery.Tables.get(CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID, 'stock_balances');
    properties.setProperty(version, '1');
  } catch (error) {
    ensureStockCardInfrastructure_();
    properties.setProperty(version, '1');
  }
}

function ensureStockCardInfrastructure_() {
  const infrastructureCache = CacheService.getScriptCache();
  if (infrastructureCache.get('stock-card-infrastructure-v16') === 'ready') return;
  ensureStockMasterSheet_();
  ensureShowcaseSheet_();
  ensureSheet_(CONFIG.STOCK_LOCATION_SHEET, ['OUTLET', 'LOCATION', 'ACTIVE', 'CREATED_BY', 'CREATED_AT']);
  ensureStockVisibilitySheet_();
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
    bqField_('info', 'STRING'), bqField_('production_date', 'DATE'), bqField_('expiry_date', 'DATE'), bqField_('event_date', 'DATE', 'REQUIRED'),
    bqField_('created_at', 'TIMESTAMP', 'REQUIRED'), bqField_('created_by', 'STRING', 'REQUIRED')
  ], 'created_at');
  const stockCardAdditionalFields = [
    bqField_('item_code', 'STRING'), bqField_('logical_id', 'STRING'), bqField_('version', 'INTEGER'),
    bqField_('source_file', 'STRING'), bqField_('source_hash', 'STRING'), bqField_('source_row', 'INTEGER'),
    bqField_('supplier', 'STRING'), bqField_('transfer_id', 'STRING'),
    bqField_('source_arrival_date', 'DATE'), bqField_('production_date', 'DATE')
  ];
  ensureBigQueryFields_('stock_card', stockCardAdditionalFields);
  if (stockCardTableId_() !== 'stock_card') ensureBigQueryFields_(stockCardTableId_(), stockCardAdditionalFields);
  ensureBigQueryTable_('stock_balances', [
    bqField_('outlet', 'STRING', 'REQUIRED'), bqField_('location', 'STRING', 'REQUIRED'),
    bqField_('item_code', 'STRING'), bqField_('item_name', 'STRING'),
    bqField_('current_qty', 'FLOAT', 'REQUIRED'), bqField_('updated_at', 'TIMESTAMP', 'REQUIRED')
  ]);
  ensureBigQueryTable_('stock_upload_daily_summary', [
    bqField_('event_date', 'DATE', 'REQUIRED'), bqField_('outlet', 'STRING', 'REQUIRED'),
    bqField_('upload_type', 'STRING', 'REQUIRED'), bqField_('actual_item_count', 'INTEGER', 'REQUIRED'),
    bqField_('marker_count', 'INTEGER', 'REQUIRED'), bqField_('last_upload', 'TIMESTAMP'),
    bqField_('last_user', 'STRING'), bqField_('updated_at', 'TIMESTAMP', 'REQUIRED')
  ], 'event_date', ['outlet', 'upload_type']);
  ensureBigQueryTable_('stock_transfers', [
    bqField_('event_id', 'STRING', 'REQUIRED'), bqField_('transfer_id', 'STRING', 'REQUIRED'), bqField_('status', 'STRING', 'REQUIRED'),
    bqField_('from_outlet', 'STRING'), bqField_('from_location', 'STRING'), bqField_('to_outlet', 'STRING'), bqField_('to_location', 'STRING'),
    bqField_('item_code', 'STRING'), bqField_('category', 'STRING'), bqField_('item_name', 'STRING'), bqField_('unit', 'STRING'),
    bqField_('qty', 'FLOAT'), bqField_('note', 'STRING'), bqField_('expiry_date', 'DATE'),
    bqField_('created_by', 'STRING'), bqField_('created_by_name', 'STRING'), bqField_('created_at', 'TIMESTAMP', 'REQUIRED'),
    bqField_('accepted_by', 'STRING'), bqField_('accepted_at', 'TIMESTAMP')
  ], 'created_at');
  ensureBigQueryFields_('stock_transfers', [
    bqField_('received_qty', 'FLOAT'), bqField_('accepted_by_name', 'STRING'),
    bqField_('received_at', 'TIMESTAMP'), bqField_('storage_entered_at', 'TIMESTAMP'), bqField_('product_temperature', 'FLOAT'),
    bqField_('rejected_by', 'STRING'), bqField_('rejected_by_name', 'STRING'), bqField_('rejected_at', 'TIMESTAMP'),
    bqField_('rejection_reason', 'STRING'), bqField_('receipt_no', 'STRING'),
    bqField_('photo_file_ids', 'STRING'), bqField_('photo_count', 'INTEGER'), bqField_('photo_data_json', 'STRING'),
    bqField_('delivery_date', 'DATE')
  ]);
  infrastructureCache.put('stock-card-infrastructure-v16', 'ready', 21600);
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
  const lots = dates.length ? snapshots[dates[dates.length - 1]].map(function (lot) {
    return { qty: Number(lot.qty), productionDate: lot.productionDate || '', expiryDate: lot.expiryDate || '', sourceDate: lot.sourceDate || '' };
  }) : [];
  return allocateTransferLotsFromAvailable_(lots, qty);
}

function allocateTransferLotsFromAvailable_(lots, qty) {
  let remaining = Number(qty || 0);
  const allocated = [];
  (lots || []).forEach(function (lot) {
    if (remaining <= 0.0000001) return;
    const taken = Math.min(Number(lot.qty || 0), remaining);
    if (taken > 0.0000001) allocated.push({ qty: taken, productionDate: lot.productionDate || '', expiryDate: lot.expiryDate || '', sourceDate: lot.sourceDate || '' });
    remaining -= taken;
  });
  if (remaining > 0.0000001) allocated.push({ qty: remaining, productionDate: '', expiryDate: '', sourceDate: '' });
  return allocated;
}

function stockTransferMovementRow_(transferId, outlet, location, item, direction, qty, movementType, note, expiryDate, employee, now, eventDate, productionDate) {
  const info = cleanText_(note, 300);
  if (isTransferMovementType_(movementType) && !info) {
    throw new Error('Keterangan asal atau tujuan wajib tersedia untuk setiap transaksi transfer.');
  }
  const recordId = Utilities.getUuid();
  return { insertId: recordId, json: {
    record_id: recordId, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT', transfer_id: transferId,
    outlet: outlet, location: location, item_code: item.code, category: item.category, item_name: item.name, unit: item.unit,
    direction: direction, qty: qty, movement_type: movementType, info: info, production_date: productionDate || null, expiry_date: expiryDate || null,
    event_date: eventDate, created_at: now.getTime() / 1000, created_by: employee.nik
  }};
}

function readPendingStockTransfers_(outlet) {
  const sql = 'SELECT p.event_id, p.transfer_id, p.from_outlet, p.from_location, p.to_outlet, p.to_location, p.item_code, p.category, p.item_name, p.unit, p.qty, p.note, p.expiry_date, p.delivery_date, p.created_by, p.created_by_name, p.created_at ' +
    'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_transfers` p WHERE p.status = \'PENDING\' AND p.to_outlet = @outlet ' +
    'AND NOT EXISTS (SELECT 1 FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_transfers` a WHERE a.transfer_id = p.transfer_id AND a.status IN (\'ACCEPTED\', \'REJECTED\')) ORDER BY p.created_at DESC, p.item_name, p.expiry_date';
  const grouped = {};
  runNamedQuery_(sql, { outlet: outlet }).forEach(function (row) {
    const id = String(row.transfer_id || '');
    if (!grouped[id]) grouped[id] = {
      transferId: id, status: 'PENDING', fromOutlet: String(row.from_outlet || ''), fromLocation: String(row.from_location || ''),
      toOutlet: String(row.to_outlet || ''), toLocation: String(row.to_location || ''), createdBy: String(row.created_by || ''),
      createdByName: String(row.created_by_name || row.created_by || ''), createdAt: String(row.created_at || ''), deliveryDate: String(row.delivery_date || '').slice(0, 10), items: []
    };
    grouped[id].items.push({ lineId: String(row.event_id || ''), code: String(row.item_code || ''), category: String(row.category || ''), name: String(row.item_name || ''), unit: String(row.unit || ''), qty: Number(row.qty || 0), receivedQty: null, note: String(row.note || ''), expiryDate: String(row.expiry_date || '') });
  });
  return Object.keys(grouped).map(function (id) {
    grouped[id].receiptNo = stockTransferReceiptNumber_(grouped[id]);
    return grouped[id];
  });
}

function getOutletProgress(token) {
  return safe_(function () {
    const employee = requireAdmin_(token);
    const outlets = readActiveOutlets_().filter(function (outlet) { return outlet !== 'BIHQ'; });
    const taskSheet = ensureTaskSheet_();
    const tasks = taskSheet.getLastRow() < 2 ? [] : taskSheet.getRange(2, 1, taskSheet.getLastRow() - 1, 13).getValues()
      .map(taskFromRow_).filter(function (task) { return task.active; });
    const assignees = readActiveAssigneesByOutlet_();
    const frequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
    const periodKeys = { CURRENT: {}, PREVIOUS: {} };
    frequencies.forEach(function (frequency) {
      periodKeys.CURRENT[frequency] = currentPeriodKey_(frequency);
      periodKeys.PREVIOUS[frequency] = previousPeriodKey_(frequency);
    });
    const completionMap = readCurrentOutletCompletionMap_(periodKeys);
    mergeOutletStockUploadCompletions_(completionMap, outlets, tasks, assignees, periodKeys);
    const current = buildOutletProgressView_(outlets, tasks, assignees, frequencies, periodKeys.CURRENT, completionMap, {
      DAILY: 'Hari ini', WEEKLY: 'Minggu ini', MONTHLY: 'Bulan ini', YEARLY: 'Tahun ini'
    });
    const previous = buildOutletProgressView_(outlets, tasks, assignees, frequencies, periodKeys.PREVIOUS, completionMap, {
      DAILY: 'Kemarin', WEEKLY: 'Minggu lalu', MONTHLY: 'Bulan lalu', YEARLY: 'Tahun lalu'
    });
    return {
      outlets: current.outlets,
      summary: current.summary,
      views: { CURRENT: current, PREVIOUS: previous },
      generatedAt: new Date().toISOString(),
      requestedBy: employee.nik
    };
  });
}

function buildOutletProgressView_(outlets, tasks, assignees, frequencies, periodKeys, completionMap, labels) {
  const rows = outlets.map(function (outlet) {
    const periods = {};
    let total = 0;
    let done = 0;
    frequencies.forEach(function (frequency) {
      const applicable = tasks.filter(function (task) {
        return task.frequency === frequency && taskAppliesToOutlet_(task, outlet, assignees[outlet] || []) && taskExistedForPeriod_(task, frequency, periodKeys[frequency]);
      });
      const completed = applicable.filter(function (task) {
        return Boolean(completionMap[outlet + '|' + task.id + '|' + periodKeys[frequency]]);
      }).length;
      periods[frequency] = { done: completed, total: applicable.length, percent: applicable.length ? Math.round(completed / applicable.length * 100) : 0 };
      total += applicable.length;
      done += completed;
    });
    return { outlet: outlet, periods: periods, done: done, total: total, percent: total ? Math.round(done / total * 100) : 0 };
  }).sort(function (a, b) { return a.percent - b.percent || a.outlet.localeCompare(b.outlet); });
  const assignedRows = rows.filter(function (row) { return row.total > 0; });
  return {
    outlets: rows,
    periodKeys: periodKeys,
    labels: labels,
    summary: {
      totalOutlets: rows.length,
      completeOutlets: rows.filter(function (row) { return row.total > 0 && row.done === row.total; }).length,
      attentionOutlets: rows.filter(function (row) { return row.total > 0 && row.done < row.total; }).length,
      averagePercent: assignedRows.length ? Math.round(assignedRows.reduce(function (sum, row) { return sum + row.percent; }, 0) / assignedRows.length) : 0
    }
  };
}

function mergeOutletStockUploadCompletions_(completionMap, outlets, tasks, assignees, periodKeys) {
  const stockTasks = tasks.filter(function (task) {
    return task.active && task.type === 'FORM' && task.target === 'StockCard' && task.frequency === 'DAILY';
  });
  if (!stockTasks.length || !outlets.length) return completionMap;
  try {
    const query = 'SELECT outlet, CAST(event_date AS STRING) AS period_key FROM `' +
      CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.' + stockCardTableId_() + '` ' +
      'WHERE record_type = \'MOVEMENT\' AND event_date IN (CAST(@currentDaily AS DATE), CAST(@previousDaily AS DATE)) ' +
      'AND movement_type IN (\'Goods Receipt\', \'Terjual\') AND source_file IS NOT NULL AND source_file != \'\' ' +
      'GROUP BY outlet, event_date HAVING MAX(IF(movement_type = \'Goods Receipt\', 1, 0)) = 1 ' +
      'AND MAX(IF(movement_type = \'Terjual\', 1, 0)) = 1';
    runNamedQuery_(query, {
      currentDaily: periodKeys.CURRENT.DAILY,
      previousDaily: periodKeys.PREVIOUS.DAILY
    }, { useQueryCache: false }).forEach(function (row) {
      const outlet = String(row.outlet || '').toUpperCase();
      const periodKey = String(row.period_key || '').slice(0, 10);
      if (outlets.indexOf(outlet) < 0 || !periodKey) return;
      stockTasks.forEach(function (task) {
        if (taskAppliesToOutlet_(task, outlet, assignees[outlet] || []) &&
            taskExistedForPeriod_(task, task.frequency, periodKey)) {
          completionMap[outlet + '|' + task.id + '|' + periodKey] =
            completionMap[outlet + '|' + task.id + '|' + periodKey] || 'AUTO_UPLOADS';
        }
      });
    });
  } catch (error) {
    if (!/not found|Not found|404/.test(String(error))) {
      console.error('Progress upload Control Tower gagal dibaca: ' + (error && error.message ? error.message : error));
    }
  }
  return completionMap;
}

function taskExistedForPeriod_(task, frequency, periodKey) {
  if (!task.createdAt) return true;
  const created = new Date(task.createdAt);
  if (isNaN(created.getTime())) return true;
  const parts = String(periodKey).split('-');
  let end;
  if (frequency === 'YEARLY') end = new Date(Number(parts[0]), 11, 31, 23, 59, 59, 999);
  else if (frequency === 'MONTHLY') end = new Date(Number(parts[0]), Number(parts[1]), 0, 23, 59, 59, 999);
  else {
    end = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999);
    if (frequency === 'WEEKLY') end.setDate(end.getDate() + 6);
  }
  return created.getTime() <= end.getTime();
}

function goodsReceiptAlreadyImported_(outlet, sourceHash) {
  const sql = 'SELECT COUNT(*) AS total FROM ' + stockCardTable_() + ' ' +
    'WHERE record_type = \'MOVEMENT\' AND outlet = @outlet AND movement_type = \'Goods Receipt\' AND source_hash = @sourceHash';
  const rows = runNamedQuery_(sql, { outlet: outlet, sourceHash: sourceHash });
  return rows.length && Number(rows[0].total || 0) > 0;
}

/** Validates an ESB Goods Receipt Recapitulation Report before upload. */
function previewGoodsReceiptUpload(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const prepared = prepareGoodsReceiptImport_(context, payload, true);
    if (prepared.requiresConversion) {
      return {
        verified: false, requiresConversion: true, fileName: prepared.fileName,
        outlet: prepared.outlet, outletName: prepared.outletName, location: context.location,
        transactionDate: prepared.transactionDate, transactionDateEnd: prepared.transactionDateEnd,
        sourceItemCount: prepared.sourceItemCount, receiptCount: prepared.receiptCount,
        conversions: prepared.conversionRequests
      };
    }
    if (prepared.requiresDuplicateDecision) {
      return {
        verified: false, requiresDuplicateDecision: true, fileName: prepared.fileName,
        outlet: prepared.outlet, outletName: prepared.outletName, location: context.location,
        transactionDate: prepared.transactionDate, transactionDateEnd: prepared.transactionDateEnd,
        sourceItemCount: prepared.originalSourceItemCount, receiptCount: prepared.receiptCount,
        duplicates: prepared.unresolvedDuplicates
      };
    }
    return {
      verified: prepared.items.length > 0, nothingToUpload: prepared.items.length === 0,
      fileName: prepared.fileName, outlet: prepared.outlet, outletName: prepared.outletName,
      location: context.location, transactionDate: prepared.transactionDate, transactionDateEnd: prepared.transactionDateEnd,
      sourceItemCount: prepared.sourceItemCount, movementCount: prepared.items.length,
      originalSourceItemCount: prepared.originalSourceItemCount,
      duplicateRowsSkipped: prepared.skippedDuplicates.length,
      duplicateRowsUploaded: prepared.allowedDuplicates.length,
      receiptCount: prepared.receiptCount, supplierCount: prepared.supplierCount,
      expiryLotCount: prepared.expiryLotCount, noExpiryItemCount: prepared.noExpiryItemCount,
      newItemCount: prepared.newItemCount, conversionCount: prepared.conversionCount,
      expiryWarnings: prepared.expiryWarnings || []
    };
  });
}

/** Imports a verified Goods Receipt report as append-only stock IN movements. */
function uploadGoodsReceipt(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const prepared = prepareGoodsReceiptImport_(context, payload, false);
    if (prepared.requiresDuplicateDecision) throw new Error('Ditemukan baris duplikat. Pilih Batal Upload, Tetap Upload Duplikat, atau Skip Duplikat.');
    if (!prepared.items.length) throw new Error('Semua baris pada file ini sudah pernah dicatat atau dipilih untuk dilewati. Tidak ada Stock Masuk baru yang di-upload.');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw new Error('Sistem sedang menyimpan transaksi lain. Silakan coba lagi; data Anda belum disimpan.');
    try {
      appendOrActivateStockMasterItems_(prepared.masterChanges);
      const now = new Date();
      const rows = prepared.items.map(function (receipt) {
        const logicalId = Utilities.getUuid(), recordId = Utilities.getUuid();
        const alertInfo = receipt.fefoAlert ? ' | FEFO ALERT: expiry masuk ' + receipt.expiryDate + ' lebih cepat dari stok existing ' + receipt.existingExpiryDate : '';
        const conversionInfo = receipt.converted ? ' · Konversi ' + formatQty_(receipt.originalQty) + ' ' + receipt.originalUnit + ' = ' + formatQty_(receipt.qty) + ' ' + receipt.item.unit : '';
        return { insertId: recordId, json: {
          record_id: recordId, logical_id: logicalId, version: 1, record_type: 'MOVEMENT',
          outlet: context.outlet, location: context.location, item_code: receipt.item.code,
          category: receipt.item.category, item_name: receipt.item.name, unit: receipt.item.unit,
          direction: 'IN', qty: receipt.qty, movement_type: 'Goods Receipt',
          supplier: cleanText_(receipt.supplier || '-', 180),
          info: cleanText_('Supplier ' + (receipt.supplier || '-') + ' · PO ' + (receipt.poNumber || '-') + ' · GR ' + (receipt.grNumber || '-') +
            ' · ' + prepared.fileName + ' · Baris ' + receipt.sourceRow + conversionInfo + alertInfo, 500),
          expiry_date: receipt.expiryDate || null, source_arrival_date: receipt.transactionDate, event_date: receipt.transactionDate,
          created_at: now.getTime() / 1000, created_by: context.employee.nik,
          source_file: prepared.fileName, source_hash: prepared.sourceHash, source_row: receipt.sourceRow
        }};
      });
      insertStockCardRows_(rows);
      return {
        uploaded: true, outlet: context.outlet, location: context.location,
        transactionDate: prepared.transactionDate, transactionDateEnd: prepared.transactionDateEnd,
        sourceItemCount: prepared.sourceItemCount, movementCount: rows.length,
        duplicateRowsSkipped: prepared.skippedDuplicates.length,
        duplicateRowsUploaded: prepared.allowedDuplicates.length,
        receiptCount: prepared.receiptCount, expiryLotCount: prepared.expiryLotCount,
        noExpiryItemCount: prepared.noExpiryItemCount, newItemCount: prepared.newItemCount,
        conversionCount: prepared.conversionCount, expiryWarnings: prepared.expiryWarnings || []
      };
    } finally {
      lock.releaseLock();
    }
  });
}

function prepareGoodsReceiptImport_(context, payload, allowPendingConversions, reportOverride) {
  const fileName = cleanText_(payload.fileName, 180);
  const base64 = String(payload.base64 || '').replace(/^data:[^,]+,/, '').trim();
  const report = reportOverride || parseGoodsReceiptReport_(base64, fileName);
  const storeDirectory = readStoreCodeDirectory_(), outletKey = normalizeStoreName_(report.outletName);
  const storeEntry = storeDirectory.byName[outletKey] || null;
  const reportOutlet = storeEntry ? storeEntry.code : '';
  if (!reportOutlet) throw new Error('Outlet "' + report.outletName + '" pada kolom G belum terdaftar di sheet STORE CODE.');
  if (reportOutlet !== String(context.outlet || '').trim().toUpperCase()) throw new Error('Berdasarkan STORE CODE, ' + storeEntry.name + ' = ' + reportOutlet + '. File ini bukan untuk outlet yang sedang dipilih (' + context.outlet + ').');
  const sourceHash = digest_(JSON.stringify({ outlet: report.outletName, rows: report.rows }));

  const masterMap = {};
  readStockMaster_(true).forEach(function (item) { masterMap[item.code.toUpperCase()] = item; });
  const providedConversions = payload.conversions && typeof payload.conversions === 'object' ? payload.conversions : {};
  const savedConversions = readStockUnitConversions_();
  const conversionMap = {}, conversionRequests = [], items = [], sourceItems = [], masterChangeMap = {};
  let expiryLotCount = 0, noExpiryItemCount = 0;
  report.rows.forEach(function (row) {
    let item = masterMap[row.code];
    if (!item) {
      item = { code: row.code, category: row.category || 'Uncategorized', name: row.name || row.code, unit: row.unit, active: false };
      masterMap[row.code] = item;
      masterChangeMap[row.code] = item;
    } else if (!item.active) masterChangeMap[row.code] = item;
    const reportUnit = normalizeUnit_(row.unit), masterUnit = normalizeUnit_(item.unit);
    let factor = 1, converted = false;
    if (reportUnit !== masterUnit) {
      converted = true;
      const key = stockConversionKey_(row.code, reportUnit, masterUnit);
      factor = resolveUnitConversionFactor_(row.code, reportUnit, masterUnit, providedConversions, savedConversions);
      if (!factor && !conversionMap[key]) {
        conversionMap[key] = { key: key, itemCode: row.code, itemName: row.name || item.name, fromUnit: row.unit || '-', toUnit: item.unit || '-' };
        conversionRequests.push(conversionMap[key]);
      }
    }
    if (converted && !factor) return;
    let convertedSourceQty = 0;
    row.lots.forEach(function (lot) {
      const convertedQty = converted ? convertSalesUsageQty_(lot.qty, factor) : lot.qty;
      convertedSourceQty += convertedQty;
      if (lot.expiryDate) expiryLotCount++; else noExpiryItemCount++;
      items.push({
        item: { code: item.code, category: row.category || item.category, name: row.name || item.name, unit: item.unit },
        qty: convertedQty, originalQty: lot.qty, originalUnit: row.unit,
        converted: converted, conversionFactor: factor, expiryDate: lot.expiryDate,
        transactionDate: row.transactionDate, supplier: row.supplier, poNumber: row.poNumber,
        grNumber: row.grNumber, sourceRow: row.sourceRow
      });
    });
    sourceItems.push({
      sourceRow: row.sourceRow, transactionDate: row.transactionDate, itemCode: item.code,
      itemName: row.name || item.name, qty: convertedSourceQty, unit: item.unit,
      supplier: row.supplier || '-', grNumber: row.grNumber || '', poNumber: row.poNumber || ''
    });
  });
  const missingConversions = conversionRequests.filter(function (request) {
    const factor = Number(providedConversions[request.key]);
    const savedFactor = savedConversions[request.key] && Number(savedConversions[request.key].factor);
    return (!isFinite(factor) || factor <= 0) && (!isFinite(savedFactor) || savedFactor <= 0);
  });
  const dates = report.transactionDates.slice().sort();
  const baseResult = {
    fileName: fileName, sourceHash: sourceHash, outlet: reportOutlet, outletName: report.outletName,
    transactionDate: dates[0], transactionDateEnd: dates[dates.length - 1], sourceItemCount: report.rows.length,
    originalSourceItemCount: report.rows.length,
    receiptCount: report.receiptCount, supplierCount: report.supplierCount,
    newItemCount: Object.keys(masterChangeMap).length
  };
  if (missingConversions.length) {
    if (!allowPendingConversions) throw new Error('Lengkapi seluruh konversi unit sebelum melanjutkan upload.');
    baseResult.requiresConversion = true;
    baseResult.conversionRequests = missingConversions;
    return baseResult;
  }
  if (!items.length) throw new Error('Tidak ada QTY Goods Receipt lebih dari 0 pada file ini.');
  const duplicates = findGoodsReceiptDuplicateRows_(context.outlet, sourceItems);
  const requestedSkipRows = normalizeGoodsReceiptSkipRows_(payload.skipDuplicateRows);
  const requestedAllowRows = normalizeGoodsReceiptSkipRows_(payload.allowDuplicateRows);
  const duplicateRowMap = {}, skippedDuplicates = [], allowedDuplicates = [], unresolvedDuplicates = [];
  duplicates.forEach(function (duplicate) {
    duplicateRowMap[duplicate.sourceRow] = true;
    if (requestedSkipRows[duplicate.sourceRow]) skippedDuplicates.push(duplicate);
    else if (requestedAllowRows[duplicate.sourceRow]) allowedDuplicates.push(duplicate);
    else unresolvedDuplicates.push(duplicate);
  });
  const remainingSourceRowMap = {};
  sourceItems.forEach(function (sourceItem) {
    if (!(duplicateRowMap[sourceItem.sourceRow] && requestedSkipRows[sourceItem.sourceRow])) remainingSourceRowMap[sourceItem.sourceRow] = true;
  });
  const filteredItems = items.filter(function (item) { return remainingSourceRowMap[item.sourceRow]; });
  const expiryWarnings = applyGoodsReceiptFefoWarnings_(context.outlet, context.location, filteredItems);
  const remainingCodeMap = {};
  filteredItems.forEach(function (item) { remainingCodeMap[String(item.item.code || '').toUpperCase()] = true; });
  baseResult.requiresConversion = false;
  baseResult.requiresDuplicateDecision = unresolvedDuplicates.length > 0;
  baseResult.duplicates = duplicates;
  baseResult.unresolvedDuplicates = unresolvedDuplicates;
  baseResult.skippedDuplicates = skippedDuplicates;
  baseResult.allowedDuplicates = allowedDuplicates;
  baseResult.items = filteredItems;
  baseResult.sourceItemCount = Object.keys(remainingSourceRowMap).length;
  baseResult.masterChanges = Object.keys(masterChangeMap).filter(function (code) { return remainingCodeMap[code]; }).map(function (code) { return masterChangeMap[code]; });
  baseResult.expiryLotCount = filteredItems.filter(function (item) { return Boolean(item.expiryDate); }).length;
  baseResult.noExpiryItemCount = filteredItems.filter(function (item) { return !item.expiryDate; }).length;
  baseResult.conversionCount = conversionRequests.length;
  baseResult.expiryWarnings = expiryWarnings;
  return baseResult;
}

function applyGoodsReceiptFefoWarnings_(outlet, location, items) {
  const grouped = {}, warnings = [], histories = {};
  items.forEach(function (entry) {
    const code = String(entry.item.code || '').toUpperCase();
    if (!grouped[code]) grouped[code] = { item: entry.item, entries: [] };
    grouped[code].entries.push(entry);
  });
  const codes = Object.keys(grouped);
  if (!codes.length) return warnings;
  const params = { outlet: outlet, location: location }, placeholders = [];
  codes.forEach(function (code, index) { const name = 'code' + index; params[name] = code; placeholders.push('@' + name); });
  const sql = latestStockMovementCte_() + ' SELECT item_code, record_id, COALESCE(NULLIF(logical_id, \'\'), record_id) AS logical_id, COALESCE(version, 1) AS version, ' +
    'event_date, direction, qty, movement_type, info, production_date, expiry_date, source_arrival_date, transfer_id, created_at FROM latest ' +
    'WHERE outlet = @outlet AND location = @location AND item_code IN (' + placeholders.join(',') + ') ORDER BY event_date, created_at LIMIT 10000';
  runNamedQuery_(sql, params).forEach(function (row) {
    const code = String(row.item_code || '').toUpperCase();
    if (!histories[code]) histories[code] = [];
    histories[code].push({ recordId: String(row.record_id || ''), logicalId: String(row.logical_id || row.record_id || ''), version: Number(row.version || 1),
      date: String(row.event_date || ''), direction: String(row.direction || ''), qty: Number(row.qty || 0), movementType: String(row.movement_type || ''),
      info: String(row.info || ''), productionDate: String(row.production_date || ''), expiryDate: String(row.expiry_date || ''),
      sourceArrivalDate: String(row.source_arrival_date || ''), transferId: String(row.transfer_id || ''), createdAt: String(row.created_at || '') });
  });
  codes.forEach(function (code) {
    const group = grouped[code];
    const snapshots = calculateFifoSnapshots_(histories[code] || []);
    const dates = Object.keys(snapshots).sort();
    const existingLots = dates.length ? snapshots[dates[dates.length - 1]] : [];
    const existingExpiries = existingLots.map(function (lot) { return String(lot.expiryDate || '').slice(0, 10); }).filter(Boolean).sort();
    if (!existingExpiries.length) return;
    const nearestExisting = existingExpiries[0];
    group.entries.forEach(function (entry) {
      const incoming = String(entry.expiryDate || '').slice(0, 10);
      if (incoming && incoming < nearestExisting) {
        entry.fefoAlert = true;
        entry.existingExpiryDate = nearestExisting;
        warnings.push({ itemCode: entry.item.code, itemName: entry.item.name, qty: entry.qty, incomingExpiryDate: incoming, existingExpiryDate: nearestExisting });
      }
    });
  });
  return warnings;
}

function normalizeGoodsReceiptSkipRows_(value) {
  const map = {};
  (Array.isArray(value) ? value : []).forEach(function (row) {
    const number = Math.floor(Number(row));
    if (isFinite(number) && number >= 1 && number <= 100000) map[number] = true;
  });
  return map;
}

function goodsReceiptDuplicateKey_(item) {
  const qty = Math.round(Number(item.qty || 0) * 1000000) / 1000000;
  const itemKey = String(item.itemCode || item.itemName || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const supplierKey = String(item.supplier || '-').trim().replace(/\s+/g, ' ').toUpperCase() || '-';
  return String(item.transactionDate || '').slice(0, 10) + '|' + itemKey + '|' + qty.toFixed(6) + '|' + supplierKey;
}

function extractGoodsReceiptSupplier_(supplier, info) {
  const direct = cleanText_(supplier, 180);
  if (direct) return direct;
  const text = String(info || '');
  const match = /^Supplier\s+([\s\S]*?)\s+(?:Â·|·|\|)\s*PO\s+/i.exec(text);
  return cleanText_(match ? match[1] : '-', 180) || '-';
}

function findGoodsReceiptDuplicateRows_(outlet, sourceItems) {
  if (!sourceItems || !sourceItems.length) return [];
  const dates = sourceItems.map(function (item) { return item.transactionDate; }).sort();
  const sql = 'SELECT CAST(event_date AS STRING) AS event_date, item_code, ANY_VALUE(item_name) AS item_name, ' +
    'SUM(qty) AS qty, ANY_VALUE(unit) AS unit, ANY_VALUE(supplier) AS supplier, ANY_VALUE(info) AS info, ' +
    'source_hash, source_file, source_row, CAST(MIN(created_at) AS STRING) AS created_at ' +
    'FROM ' + stockCardTable_() + ' ' +
    'WHERE record_type = \'MOVEMENT\' AND outlet = @outlet AND direction = \'IN\' AND movement_type = \'Goods Receipt\' ' +
    'AND event_date BETWEEN CAST(@startDate AS DATE) AND CAST(@endDate AS DATE) ' +
    'GROUP BY event_date, item_code, source_hash, source_file, source_row';
  const existingByKey = {};
  runNamedQuery_(sql, { outlet: outlet, startDate: dates[0], endDate: dates[dates.length - 1] }).forEach(function (row) {
    const existing = {
      transactionDate: String(row.event_date || '').slice(0, 10), itemCode: String(row.item_code || ''),
      itemName: String(row.item_name || ''), qty: Number(row.qty || 0), unit: String(row.unit || ''),
      supplier: extractGoodsReceiptSupplier_(row.supplier, row.info), existingFile: String(row.source_file || ''),
      existingRow: Number(row.source_row || 0), existingCreatedAt: String(row.created_at || '')
    };
    const key = goodsReceiptDuplicateKey_(existing);
    if (!existingByKey[key]) existingByKey[key] = existing;
  });
  const seenInFile = {}, duplicates = [];
  sourceItems.slice().sort(function (a, b) { return a.sourceRow - b.sourceRow; }).forEach(function (item) {
    const key = goodsReceiptDuplicateKey_(item), existing = existingByKey[key], earlier = seenInFile[key];
    if (existing || earlier) {
      duplicates.push({
        sourceRow: item.sourceRow, transactionDate: item.transactionDate, itemCode: item.itemCode,
        itemName: item.itemName, qty: item.qty, unit: item.unit, supplier: item.supplier,
        matchType: existing ? 'DATABASE' : 'FILE', existingFile: existing ? existing.existingFile : '',
        existingRow: existing ? existing.existingRow : earlier.sourceRow,
        existingCreatedAt: existing ? existing.existingCreatedAt : ''
      });
    } else seenInFile[key] = item;
  });
  return duplicates;
}

/** Validates an ESB Goods Delivery Recapitulation Report before upload. */
function previewGoodsDeliveryUpload(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const prepared = prepareGoodsDeliveryImport_(context, payload, true);
    if (prepared.requiresConversion) {
      return {
        verified: false, requiresConversion: true, fileName: prepared.fileName,
        outlet: prepared.outlet, outletName: prepared.outletName, location: context.location,
        transactionDate: prepared.transactionDate, transactionDateEnd: prepared.transactionDateEnd,
        sourceItemCount: prepared.originalSourceItemCount, deliveryCount: prepared.deliveryCount,
        conversions: prepared.conversionRequests
      };
    }
    if (prepared.requiresDuplicateDecision) {
      return {
        verified: false, requiresDuplicateDecision: true, fileName: prepared.fileName,
        outlet: prepared.outlet, outletName: prepared.outletName, location: context.location,
        transactionDate: prepared.transactionDate, transactionDateEnd: prepared.transactionDateEnd,
        sourceItemCount: prepared.originalSourceItemCount, deliveryCount: prepared.deliveryCount,
        duplicates: prepared.unresolvedDuplicates
      };
    }
    return {
      verified: prepared.items.length > 0, nothingToUpload: prepared.items.length === 0,
      fileName: prepared.fileName, outlet: prepared.outlet, outletName: prepared.outletName,
      location: context.location, transactionDate: prepared.transactionDate, transactionDateEnd: prepared.transactionDateEnd,
      sourceItemCount: prepared.sourceItemCount, originalSourceItemCount: prepared.originalSourceItemCount,
      movementCount: prepared.items.length, duplicateRowsSkipped: prepared.skippedDuplicates.length,
      duplicateRowsUploaded: prepared.allowedDuplicates.length,
      deliveryCount: prepared.deliveryCount, destinationCount: prepared.destinationCount,
      transferCount: prepared.transferCount,
      newItemCount: prepared.newItemCount, conversionCount: prepared.conversionCount,
      negativeItemCount: prepared.negativeItemCount
    };
  });
}

/** Imports a verified Goods Delivery report as Transfer Out Antar Outlet movements. */
function uploadGoodsDeliveryLegacy_(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const prepared = prepareGoodsDeliveryImport_(context, payload, false);
      if (prepared.requiresDuplicateDecision) throw new Error('Ditemukan baris duplikat. Pilih Batal Upload, Tetap Upload Duplikat, atau Skip Duplikat.');
      if (!prepared.items.length) throw new Error('Semua baris pada file ini sudah pernah dicatat atau dipilih untuk dilewati. Tidak ada Transfer Out baru yang di-upload.');
      appendOrActivateStockMasterItems_(prepared.masterChanges);
      const now = new Date();
      const rows = prepared.items.map(function (delivery) {
        const logicalId = Utilities.getUuid(), recordId = Utilities.getUuid();
        const conversionInfo = delivery.converted ? ' · Konversi ' + formatQty_(delivery.originalQty) + ' ' + delivery.originalUnit + ' = ' + formatQty_(delivery.qty) + ' ' + delivery.item.unit : '';
        const destinationInfo = delivery.destinationCode ? delivery.destinationName + ' (' + delivery.destinationCode + ')' : delivery.destinationName;
        return { insertId: recordId, json: {
          record_id: recordId, logical_id: logicalId, version: 1, record_type: 'MOVEMENT',
          outlet: context.outlet, location: context.location, item_code: delivery.item.code,
          category: delivery.item.category, item_name: delivery.item.name, unit: delivery.item.unit,
          direction: 'OUT', qty: delivery.qty, movement_type: 'Transfer Out Antar Outlet',
          supplier: cleanText_(delivery.destinationName, 180),
          info: cleanText_('Transfer To ' + destinationInfo + ' · No Transfer ' + (delivery.transferNumber || delivery.gdNumber) + ' · GD ' + delivery.gdNumber + ' · Dari ' + delivery.originName + ' (' + context.outlet + ') · Ke ' + destinationInfo +
            ' · ' + prepared.fileName + ' · Baris ' + delivery.sourceRow + conversionInfo, 500),
          expiry_date: null, event_date: delivery.transactionDate,
          created_at: now.getTime() / 1000, created_by: context.employee.nik,
          source_file: prepared.fileName, source_hash: delivery.rowHash, source_row: delivery.sourceRow
        }};
      });
      insertStockCardRows_(rows);
      return {
        uploaded: true, outlet: context.outlet, location: context.location,
        transactionDate: prepared.transactionDate, transactionDateEnd: prepared.transactionDateEnd,
        sourceItemCount: prepared.sourceItemCount, movementCount: rows.length,
        duplicateRowsSkipped: prepared.skippedDuplicates.length, duplicateRowsUploaded: prepared.allowedDuplicates.length,
        deliveryCount: prepared.deliveryCount,
        destinationCount: prepared.destinationCount, newItemCount: prepared.newItemCount,
        conversionCount: prepared.conversionCount, negativeItemCount: prepared.negativeItemCount
      };
    } finally {
      lock.releaseLock();
    }
  });
}

function uploadGoodsDelivery(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const prepared = prepareGoodsDeliveryImport_(context, payload, false);
    if (prepared.requiresDuplicateDecision) throw new Error('Ditemukan baris duplikat. Pilih Batal Upload, Tetap Upload Duplikat, atau Skip Duplikat.');
    if (!prepared.items.length) throw new Error('Semua baris sudah pernah dicatat atau dipilih untuk dilewati. Tidak ada Transfer Out baru yang di-upload.');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw new Error('Sistem sedang menyimpan transaksi lain. Silakan coba lagi; data Anda belum disimpan.');
    try {
      appendOrActivateStockMasterItems_(prepared.masterChanges);
      const now = new Date(), transferIds = {}, totalByCode = {}, itemByCode = {}, lotQueues = {}, stockRows = [], pendingRows = [];
      prepared.items.forEach(function (delivery) {
        totalByCode[delivery.item.code] = Number(totalByCode[delivery.item.code] || 0) + Number(delivery.qty || 0);
        itemByCode[delivery.item.code] = delivery.item;
      });
      Object.keys(totalByCode).forEach(function (code) {
        lotQueues[code] = allocateTransferLots_(context.outlet, context.location, itemByCode[code], totalByCode[code]).map(function (lot) {
          return { qty: Number(lot.qty || 0), expiryDate: lot.expiryDate || '' };
        });
      });
      prepared.items.forEach(function (delivery) {
        const groupKey = delivery.gdNumber + '|' + delivery.destinationCode;
        if (!transferIds[groupKey]) transferIds[groupKey] = Utilities.getUuid();
        const transferId = transferIds[groupKey], queue = lotQueues[delivery.item.code] || [], allocated = [];
        let remaining = Number(delivery.qty || 0);
        while (remaining > 0.0000001 && queue.length) {
          const lot = queue[0], taken = Math.min(remaining, Number(lot.qty || 0));
          if (taken > 0.0000001) allocated.push({ qty: taken, expiryDate: lot.expiryDate || '' });
          remaining -= taken;
          lot.qty -= taken;
          if (lot.qty <= 0.0000001) queue.shift();
        }
        if (remaining > 0.0000001) allocated.push({ qty: remaining, expiryDate: '' });
        const conversionInfo = delivery.converted ? ' | Konversi ' + formatQty_(delivery.originalQty) + ' ' + delivery.originalUnit + ' = ' + formatQty_(delivery.qty) + ' ' + delivery.item.unit : '';
        const destinationInfo = delivery.destinationName + ' (' + delivery.destinationCode + ')';
        const lineNote = cleanText_('Transfer To ' + destinationInfo + ' | No Transfer ' + (delivery.transferNumber || delivery.gdNumber) + ' | No. GD ' + delivery.gdNumber + ' | ' + prepared.fileName + ' | Baris ' + delivery.sourceRow + conversionInfo, 300);
        allocated.forEach(function (lot) {
          const recordId = Utilities.getUuid(), eventId = Utilities.getUuid();
          stockRows.push({ insertId: recordId, json: {
            record_id: recordId, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT', transfer_id: transferId,
            outlet: context.outlet, location: context.location, item_code: delivery.item.code,
            category: delivery.item.category, item_name: delivery.item.name, unit: delivery.item.unit,
            direction: 'OUT', qty: lot.qty, movement_type: 'Transfer Out Antar Outlet',
            supplier: cleanText_(delivery.destinationName, 180),
            info: cleanText_('Transfer To ' + destinationInfo + ' | No Transfer ' + (delivery.transferNumber || delivery.gdNumber) + ' | GD ' + delivery.gdNumber + ' | Dari ' + delivery.originName + ' (' + context.outlet + ') | Ke ' + destinationInfo +
              ' | Menunggu konfirmasi penerima | ' + prepared.fileName + ' | Baris ' + delivery.sourceRow + conversionInfo, 500),
            expiry_date: lot.expiryDate || null, event_date: delivery.transactionDate,
            created_at: now.getTime() / 1000, created_by: context.employee.nik,
            source_file: prepared.fileName, source_hash: delivery.rowHash, source_row: delivery.sourceRow
          }});
          pendingRows.push({ insertId: eventId, json: {
            event_id: eventId, transfer_id: transferId, status: 'PENDING', from_outlet: context.outlet, from_location: context.location,
            to_outlet: delivery.destinationCode, to_location: null, item_code: delivery.item.code, category: delivery.item.category,
            item_name: delivery.item.name, unit: delivery.item.unit, qty: lot.qty, note: lineNote, expiry_date: lot.expiryDate || null,
            created_by: context.employee.nik, created_by_name: context.employee.name, created_at: now.getTime() / 1000,
            delivery_date: delivery.transactionDate
          }});
        });
      });
      insertStockCardRows_(stockRows);
      insertAll_('stock_transfers', pendingRows);
      return {
        uploaded: true, outlet: context.outlet, location: context.location,
        transactionDate: prepared.transactionDate, transactionDateEnd: prepared.transactionDateEnd,
        sourceItemCount: prepared.sourceItemCount, movementCount: stockRows.length, pendingLineCount: pendingRows.length,
        transferCount: Object.keys(transferIds).length, duplicateRowsSkipped: prepared.skippedDuplicates.length,
        duplicateRowsUploaded: prepared.allowedDuplicates.length,
        deliveryCount: prepared.deliveryCount, destinationCount: prepared.destinationCount,
        newItemCount: prepared.newItemCount, conversionCount: prepared.conversionCount,
        negativeItemCount: prepared.negativeItemCount
      };
    } finally {
      lock.releaseLock();
    }
  });
}

function prepareGoodsDeliveryImport_(context, payload, allowPendingConversions, reportOverride) {
  const fileName = cleanText_(payload.fileName, 180);
  const base64 = String(payload.base64 || '').replace(/^data:[^,]+,/, '').trim();
  const report = reportOverride || parseGoodsDeliveryReport_(base64, fileName);
  const storeDirectory = readStoreCodeDirectory_(), originKey = normalizeStoreName_(report.outletName);
  const originEntry = storeDirectory.byName[originKey] || null;
  const reportOutlet = originEntry ? originEntry.code : '';
  if (!reportOutlet) throw new Error('Outlet asal "' + report.outletName + '" pada kolom Origin belum terdaftar di sheet STORE CODE.');
  if (reportOutlet !== String(context.outlet || '').trim().toUpperCase()) throw new Error('Berdasarkan STORE CODE, ' + originEntry.name + ' = ' + reportOutlet + '. File ini bukan untuk outlet yang sedang dipilih (' + context.outlet + ').');

  const masterMap = {};
  readStockMaster_(true).forEach(function (item) { masterMap[item.code.toUpperCase()] = item; });
  const providedConversions = payload.conversions && typeof payload.conversions === 'object' ? payload.conversions : {};
  const savedConversions = readStockUnitConversions_();
  const activeOutlets = readActiveOutlets_();
  const conversionMap = {}, conversionRequests = [], items = [], sourceItems = [], masterChangeMap = {}, deliveryMap = {}, destinationMap = {}, totals = {}, gdDestinationMap = {};
  report.rows.forEach(function (row) {
    let item = masterMap[row.code];
    if (!item) {
      item = { code: row.code, category: row.category || 'Uncategorized', name: row.name || row.code, unit: row.unit, active: false };
      masterMap[row.code] = item;
      masterChangeMap[row.code] = item;
    } else if (!item.active) masterChangeMap[row.code] = item;
    const reportUnit = normalizeUnit_(row.unit), masterUnit = normalizeUnit_(item.unit);
    let factor = 1, converted = false;
    if (reportUnit !== masterUnit) {
      converted = true;
      const key = stockConversionKey_(row.code, reportUnit, masterUnit);
      factor = resolveUnitConversionFactor_(row.code, reportUnit, masterUnit, providedConversions, savedConversions);
      if (!factor && !conversionMap[key]) {
        conversionMap[key] = { key: key, itemCode: row.code, itemName: row.name || item.name, fromUnit: row.unit || '-', toUnit: item.unit || '-' };
        conversionRequests.push(conversionMap[key]);
      }
    }
    if (converted && !factor) return;
    const convertedQty = converted ? convertSalesUsageQty_(row.qty, factor) : row.qty;
    const destinationEntry = storeDirectory.byName[normalizeStoreName_(row.destinationName)] || null;
    if (!destinationEntry) throw new Error('Outlet tujuan "' + row.destinationName + '" pada kolom G baris ' + row.sourceRow + ' belum terdaftar di sheet STORE CODE.');
    if (activeOutlets.indexOf(destinationEntry.code) < 0) throw new Error('Outlet tujuan ' + destinationEntry.name + ' (' + destinationEntry.code + ') tidak aktif.');
    if (destinationEntry.code === reportOutlet) throw new Error('Outlet asal dan tujuan pada No. GD ' + row.gdNumber + ' tidak boleh sama.');
    if (gdDestinationMap[row.gdNumber] && gdDestinationMap[row.gdNumber] !== destinationEntry.code) throw new Error('No. GD ' + row.gdNumber + ' memiliki lebih dari satu outlet tujuan. Pisahkan report sebelum upload.');
    gdDestinationMap[row.gdNumber] = destinationEntry.code;
    const sourceItem = {
      sourceRow: row.sourceRow, transactionDate: row.transactionDate, gdNumber: row.gdNumber, transferNumber: row.transferNumber || row.gdNumber,
      outlet: reportOutlet, itemCode: item.code, itemName: row.name || item.name,
      qty: row.qty, unit: row.unit, destinationName: row.destinationName
    };
    sourceItem.rowHash = digest_(goodsDeliveryDuplicateKey_(sourceItem));
    sourceItems.push(sourceItem);
    items.push({
      item: { code: item.code, category: row.category || item.category, name: row.name || item.name, unit: item.unit },
      qty: convertedQty, originalQty: row.qty, originalUnit: row.unit, converted: converted,
      transactionDate: row.transactionDate, gdNumber: row.gdNumber, transferNumber: row.transferNumber || row.gdNumber, originName: row.originName,
      destinationName: destinationEntry.name, destinationCode: destinationEntry.code,
      sourceRow: row.sourceRow, rowHash: sourceItem.rowHash
    });
    totals[item.code] = Number(totals[item.code] || 0) + convertedQty;
    deliveryMap[row.gdNumber] = true;
    destinationMap[normalizeStoreName_(row.destinationName)] = true;
  });
  const missingConversions = conversionRequests.filter(function (request) {
    const factor = Number(providedConversions[request.key]);
    const savedFactor = savedConversions[request.key] && Number(savedConversions[request.key].factor);
    return (!isFinite(factor) || factor <= 0) && (!isFinite(savedFactor) || savedFactor <= 0);
  });
  const dates = report.transactionDates.slice().sort();
  const baseResult = {
    fileName: fileName, outlet: reportOutlet, outletName: report.outletName,
    transactionDate: dates[0], transactionDateEnd: dates[dates.length - 1],
    sourceItemCount: report.rows.length, originalSourceItemCount: report.rows.length,
    deliveryCount: report.deliveryCount, destinationCount: report.destinationCount,
    newItemCount: Object.keys(masterChangeMap).length
  };
  if (missingConversions.length) {
    if (!allowPendingConversions) throw new Error('Lengkapi seluruh konversi unit sebelum melanjutkan upload.');
    baseResult.requiresConversion = true;
    baseResult.conversionRequests = missingConversions;
    return baseResult;
  }
  if (!items.length) throw new Error('Tidak ada QTY Goods Delivery lebih dari 0 pada file ini.');
  const duplicates = findGoodsDeliveryDuplicateRows_(context.outlet, sourceItems);
  const requestedSkipRows = normalizeGoodsDeliverySkipRows_(payload.skipDuplicateRows);
  const requestedAllowRows = normalizeGoodsDeliverySkipRows_(payload.allowDuplicateRows);
  const duplicateRowMap = {}, skippedDuplicates = [], allowedDuplicates = [], unresolvedDuplicates = [];
  duplicates.forEach(function (duplicate) {
    duplicateRowMap[duplicate.sourceRow] = true;
    if (requestedSkipRows[duplicate.sourceRow]) skippedDuplicates.push(duplicate);
    else if (requestedAllowRows[duplicate.sourceRow]) allowedDuplicates.push(duplicate);
    else unresolvedDuplicates.push(duplicate);
  });
  const remainingSourceRowMap = {};
  sourceItems.forEach(function (sourceItem) {
    if (!(duplicateRowMap[sourceItem.sourceRow] && requestedSkipRows[sourceItem.sourceRow])) remainingSourceRowMap[sourceItem.sourceRow] = true;
  });
  const filteredItems = items.filter(function (item) { return remainingSourceRowMap[item.sourceRow]; });
  const remainingCodeMap = {}, filteredTotals = {}, transferGroupMap = {};
  filteredItems.forEach(function (item) {
    remainingCodeMap[String(item.item.code || '').toUpperCase()] = true;
    filteredTotals[item.item.code] = Number(filteredTotals[item.item.code] || 0) + Number(item.qty || 0);
    transferGroupMap[item.gdNumber + '|' + item.destinationCode] = true;
  });
  const currentMap = readCurrentStockCodeQtyMap_(context.outlet, context.location);
  let negativeItemCount = 0;
  Object.keys(filteredTotals).forEach(function (code) {
    if (Number(currentMap[code] || 0) - Number(filteredTotals[code] || 0) < -0.0000001) negativeItemCount++;
  });
  baseResult.requiresConversion = false;
  baseResult.requiresDuplicateDecision = unresolvedDuplicates.length > 0;
  baseResult.duplicates = duplicates;
  baseResult.unresolvedDuplicates = unresolvedDuplicates;
  baseResult.skippedDuplicates = skippedDuplicates;
  baseResult.allowedDuplicates = allowedDuplicates;
  baseResult.items = filteredItems;
  baseResult.sourceItemCount = Object.keys(remainingSourceRowMap).length;
  baseResult.masterChanges = Object.keys(masterChangeMap).filter(function (code) { return remainingCodeMap[code]; }).map(function (code) { return masterChangeMap[code]; });
  baseResult.conversionCount = conversionRequests.length;
  baseResult.negativeItemCount = negativeItemCount;
  baseResult.transferCount = Object.keys(transferGroupMap).length;
  return baseResult;
}

function parseGoodsDeliveryReportLegacy_(base64, fileName) {
  if (!/\.xlsx$/i.test(fileName || '')) throw new Error('Pilih Goods Delivery Recapitulation Report dengan format .xlsx.');
  if (!base64) throw new Error('Data file tidak ditemukan. Pilih kembali file Goods Delivery.');
  let bytes;
  try { bytes = Utilities.base64Decode(base64); }
  catch (error) { throw new Error('File tidak dapat dibaca. Pastikan file berasal dari ESB dan berformat .xlsx.'); }
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('Ukuran file harus lebih dari 0 dan maksimal 5 MB.');
  if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error('File bukan workbook Excel .xlsx yang valid.');
  let files;
  try { files = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', 'goods-delivery-report.zip')); }
  catch (error) { throw new Error('Paket Excel Goods Delivery gagal dibuka. Download ulang report dari ESB lalu upload tanpa menyimpan ulang file.'); }
  const fileMap = {}, worksheetNames = [];
  let expandedSize = 0;
  files.forEach(function (file) {
    const name = String(file.getName() || '').replace(/^\/+/, ''), fileBytes = file.getBytes();
    expandedSize += fileBytes.length;
    if (expandedSize > 25 * 1024 * 1024) throw new Error('Isi workbook terlalu besar untuk diproses.');
    fileMap[name] = file;
    if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) worksheetNames.push(name);
  });
  worksheetNames.sort();
  if (!worksheetNames.length) throw new Error('Worksheet Goods Delivery tidak ditemukan.');
  const sharedStrings = fileMap['xl/sharedStrings.xml'] ? parseSharedStringsXml_(fileMap['xl/sharedStrings.xml'].getDataAsString('UTF-8')) : [];
  const worksheetXml = fileMap[worksheetNames[0]].getDataAsString('UTF-8');
  const cells = parseWorksheetCellsXml_(worksheetXml, sharedStrings);
  if (!cleanText_(cells.E11, 160)) {
    const fallbackCells = parseWorksheetCellsXmlDom_(worksheetXml, sharedStrings);
    Object.keys(fallbackCells).forEach(function (address) {
      if (cells[address] === undefined || cells[address] === '') cells[address] = fallbackCells[address];
    });
  }
  const expected = { A10: 'GOODS DELIVERY NUMBER', B10: 'GOODS DELIVERY DATE', E10: 'ORIGIN', G10: 'DESTINATION', J10: 'SUB CATEGORY', K10: 'PRODUCT NAME', L10: 'PRODUCT CODE', M10: 'UNIT', N10: 'QTY' };
  const invalidHeaders = Object.keys(expected).filter(function (address) { return normalizeHeader_(cells[address]) !== expected[address]; });
  if (invalidHeaders.length) throw new Error('Format Goods Delivery tidak sesuai. Header baris 10 tidak cocok pada: ' + invalidHeaders.join(', ') + '.');
  const rowNumbers = Object.keys(cells).map(function (address) {
    const match = /^L(\d+)$/.exec(address); return match ? Number(match[1]) : 0;
  }).filter(function (row) { return row >= 11; }).sort(function (a, b) { return a - b; });
  if (rowNumbers.length > 5000) throw new Error('Jumlah baris report melebihi batas 5.000 item.');
  const rows = [], seenRows = {}, invalidQty = [], origins = {}, deliveries = {}, destinations = {}, dates = {};
  const primaryOriginName = cleanText_(cells.E11, 160), primaryDestinationName = cleanText_(cells.G11, 160);
  let lastDestinationName = primaryDestinationName;
  rowNumbers.forEach(function (rowNumber) {
    if (seenRows[rowNumber]) return;
    seenRows[rowNumber] = true;
    const code = String(cells['L' + rowNumber] || '').trim().toUpperCase();
    if (!code) return;
    const qty = parseGoodsReceiptNumber_(cells['N' + rowNumber]);
    if (!isFinite(qty) || qty < 0) { invalidQty.push(code + ' baris ' + rowNumber); return; }
    if (qty <= 0.0000001) return;
    const originName = cleanText_(cells['E' + rowNumber], 160) || primaryOriginName;
    if (!originName) throw new Error('Outlet asal pada kolom E baris 11 tidak dapat dibaca. Download ulang report langsung dari ESB tanpa menyimpan ulang file.');
    const destinationName = cleanText_(cells['G' + rowNumber], 160) || lastDestinationName || primaryDestinationName;
    if (!destinationName) throw new Error('Outlet tujuan pada kolom G baris ' + rowNumber + ' kosong.');
    lastDestinationName = destinationName;
    const gdNumber = cleanText_(cells['A' + rowNumber], 100);
    if (!gdNumber) throw new Error('No. GD pada kolom A baris ' + rowNumber + ' kosong.');
    const transferNumber = cleanText_(cells['C' + rowNumber], 100) || gdNumber;
    const transactionDate = parseGoodsDeliveryDate_(cells['B' + rowNumber], rowNumber);
    rows.push({
      sourceRow: rowNumber, transactionDate: transactionDate, gdNumber: gdNumber, transferNumber: transferNumber,
      originName: originName, destinationName: destinationName,
      category: cleanText_(cells['J' + rowNumber], 100), name: cleanText_(cells['K' + rowNumber], 180),
      code: code, unit: cleanText_(cells['M' + rowNumber], 40).toUpperCase(), qty: qty
    });
    origins[normalizeStoreName_(originName)] = originName;
    deliveries[gdNumber] = true;
    destinations[normalizeStoreName_(destinationName)] = true;
    dates[transactionDate] = true;
  });
  if (invalidQty.length) throw new Error('QTY tidak valid pada: ' + invalidQty.slice(0, 8).join(', ') + '.');
  const originKeys = Object.keys(origins);
  if (originKeys.length !== 1) throw new Error('Semua baris kolom E wajib memiliki satu outlet asal yang sama. Ditemukan: ' + originKeys.map(function (key) { return origins[key]; }).join(', ') + '.');
  if (!rows.length) throw new Error('Tidak ada baris Goods Delivery dengan QTY lebih dari 0. Data harus dimulai pada baris 11.');
  return {
    outletName: origins[originKeys[0]], rows: rows, transactionDates: Object.keys(dates),
    deliveryCount: Object.keys(deliveries).length, destinationCount: Object.keys(destinations).length
  };
}

/**
 * Reads a Goods Delivery report by its header labels. The sample supplied by
 * the user has the header on row 11, but this remains valid if ESB moves it.
 */
function parseGoodsDeliveryReport_(base64, fileName, allowMultipleOutlets) {
  const cells = extractReportCells_(base64, fileName, 'Goods Delivery');
  const header = findReportHeader_(cells, [
    'GOODS DELIVERY NUMBER', 'GOODS DELIVERY DATE', 'ORIGIN', 'DESTINATION',
    'PRODUCT NAME', 'PRODUCT CODE', 'UNIT', 'QTY'
  ]);
  const rows = [], invalidQty = [], origins = {}, deliveries = {}, destinations = {}, dates = {};
  let lastOrigin = '', lastDestination = '';
  reportDataRows_(cells, header, 'PRODUCT CODE').forEach(function (rowNumber) {
    const code = String(reportCell_(cells, header, 'PRODUCT CODE', rowNumber) || '').trim().toUpperCase();
    if (!code) return;
    const qty = parseReportNumber_(reportCell_(cells, header, 'QTY', rowNumber));
    if (!isFinite(qty) || qty < 0) {
      invalidQty.push(code + ' · baris ' + rowNumber);
      return;
    }
    if (qty <= 0.0000001) return;
    const origin = cleanText_(reportCell_(cells, header, 'ORIGIN', rowNumber), 160) || lastOrigin;
    const destination = cleanText_(reportCell_(cells, header, 'DESTINATION', rowNumber), 160) || lastDestination;
    if (!origin) throw new Error('Origin tidak ditemukan pada baris ' + rowNumber + '.');
    if (!destination) throw new Error('Destination tidak ditemukan pada baris ' + rowNumber + '.');
    lastOrigin = origin;
    lastDestination = destination;
    const gdNumber = cleanText_(reportCell_(cells, header, 'GOODS DELIVERY NUMBER', rowNumber), 100);
    if (!gdNumber) throw new Error('Goods Delivery Number kosong pada baris ' + rowNumber + '.');
    const transferNumber = cleanText_(cells['C' + rowNumber], 100) || gdNumber;
    const transactionDate = parseReportDate_(reportCell_(cells, header, 'GOODS DELIVERY DATE', rowNumber), 'TRANSACTION', rowNumber, 'Goods Delivery');
    rows.push({
      sourceRow: rowNumber, transactionDate: transactionDate, gdNumber: gdNumber, transferNumber: transferNumber,
      originName: origin, destinationName: destination,
      category: cleanText_(reportCell_(cells, header, 'SUB CATEGORY', rowNumber), 100) ||
        cleanText_(reportCell_(cells, header, 'CATEGORY', rowNumber), 100),
      name: cleanText_(reportCell_(cells, header, 'PRODUCT NAME', rowNumber), 180),
      code: code, unit: cleanText_(reportCell_(cells, header, 'UNIT', rowNumber), 40).toUpperCase(), qty: qty
    });
    origins[normalizeStoreName_(origin)] = origin;
    destinations[normalizeStoreName_(destination)] = destination;
    deliveries[gdNumber] = true;
    dates[transactionDate] = true;
  });
  if (invalidQty.length) throw new Error('QTY Goods Delivery tidak valid pada ' + invalidQty.slice(0, 8).join(', ') + '.');
  const originKeys = Object.keys(origins);
  if (!allowMultipleOutlets && originKeys.length !== 1) throw new Error('Goods Delivery harus berisi tepat satu Origin. Ditemukan: ' +
    originKeys.map(function (key) { return origins[key]; }).join(', ') + '.');
  if (!rows.length) throw new Error('Tidak ada baris Goods Delivery dengan QTY lebih dari 0 setelah header baris ' + header.row + '.');
  return {
    outletName: origins[originKeys[0]], outletNames: originKeys.map(function (key) { return origins[key]; }), rows: rows, transactionDates: Object.keys(dates),
    deliveryCount: Object.keys(deliveries).length, destinationCount: Object.keys(destinations).length,
    headerRow: header.row
  };
}

function parseGoodsDeliveryDate_(value, rowNumber) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  const serial = Number(text);
  if (isFinite(serial) && serial > 20000 && serial < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
    return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
  }
  let match = /^(\d{2})[-\/]([01]\d)[-\/](\d{4})$/.exec(text);
  if (match) return normalizeDate_(match[3] + '-' + match[2] + '-' + match[1], false);
  match = /^(\d{4})[-\/]([01]\d)[-\/](\d{2})$/.exec(text);
  if (match) return normalizeDate_(match[1] + '-' + match[2] + '-' + match[3], false);
  throw new Error('Tanggal Goods Delivery pada kolom B baris ' + rowNumber + ' tidak valid.');
}

function normalizeGoodsDeliverySkipRows_(value) {
  const map = {};
  (Array.isArray(value) ? value : []).forEach(function (row) {
    const number = Math.floor(Number(row));
    if (isFinite(number) && number >= 1 && number <= 100000) map[number] = true;
  });
  return map;
}

function goodsDeliveryDuplicateKey_(item) {
  const qty = Math.round(Number(item.qty || 0) * 1000000) / 1000000;
  const itemKey = String(item.itemCode || item.itemName || '').trim().replace(/\s+/g, ' ').toUpperCase();
  return String(item.outlet || '').trim().toUpperCase() + '|' + String(item.transactionDate || '').slice(0, 10) + '|' +
    String(item.gdNumber || '').trim().toUpperCase() + '|' + itemKey + '|' + qty.toFixed(6);
}

function findGoodsDeliveryDuplicateRows_(outlet, sourceItems) {
  if (!sourceItems || !sourceItems.length) return [];
  const dates = sourceItems.map(function (item) { return item.transactionDate; }).sort();
  const sql = 'SELECT CAST(event_date AS STRING) AS event_date, item_code, ANY_VALUE(item_name) AS item_name, ' +
    'SUM(qty) AS qty, ANY_VALUE(unit) AS unit, source_hash, source_file, source_row, CAST(MIN(created_at) AS STRING) AS created_at ' +
    'FROM ' + stockCardTable_() + ' ' +
    'WHERE record_type = \'MOVEMENT\' AND outlet = @outlet AND direction = \'OUT\' AND movement_type = \'Transfer Out Antar Outlet\' ' +
    'AND event_date BETWEEN CAST(@startDate AS DATE) AND CAST(@endDate AS DATE) ' +
    'GROUP BY event_date, item_code, source_hash, source_file, source_row';
  const existingByHash = {};
  runNamedQuery_(sql, { outlet: outlet, startDate: dates[0], endDate: dates[dates.length - 1] }).forEach(function (row) {
    const hash = String(row.source_hash || '');
    if (hash && !existingByHash[hash]) existingByHash[hash] = {
      existingFile: String(row.source_file || ''), existingRow: Number(row.source_row || 0), existingCreatedAt: String(row.created_at || '')
    };
  });
  const seenInFile = {}, duplicates = [];
  sourceItems.slice().sort(function (a, b) { return a.sourceRow - b.sourceRow; }).forEach(function (item) {
    const hash = item.rowHash || digest_(goodsDeliveryDuplicateKey_(item)), existing = existingByHash[hash], earlier = seenInFile[hash];
    if (existing || earlier) {
      duplicates.push({
        sourceRow: item.sourceRow, transactionDate: item.transactionDate, gdNumber: item.gdNumber,
        itemCode: item.itemCode, itemName: item.itemName, qty: item.qty, unit: item.unit,
        matchType: existing ? 'DATABASE' : 'FILE', existingFile: existing ? existing.existingFile : '',
        existingRow: existing ? existing.existingRow : earlier.sourceRow,
        existingCreatedAt: existing ? existing.existingCreatedAt : ''
      });
    } else seenInFile[hash] = item;
  });
  return duplicates;
}

function getStockTransferHistory(token, requestedOutlet) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const allowed = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, allowed);
    return { outlet: outlet, transfers: readStockTransferHistory_(outlet) };
  });
}

function readStockTransfer_(transferId, outlet) {
  const sql = 'SELECT ' + stockTransferSelectFields_() + ' ' +
    'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_transfers` WHERE transfer_id = @transferId AND (to_outlet = @outlet OR from_outlet = @outlet) ORDER BY created_at, status, item_name, expiry_date';
  const rows = runNamedQuery_(sql, { transferId: transferId, outlet: outlet });
  return buildStockTransferFromRows_(rows);
}

function readTransferPhotoData_(transferId) {
  const sql = 'SELECT photo_data_json FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_transfers` ' +
    'WHERE transfer_id = @transferId AND photo_data_json IS NOT NULL AND LENGTH(photo_data_json) > 0 LIMIT 1';
  const rows = runNamedQuery_(sql, { transferId: transferId });
  if (!rows.length) return [];
  try {
    const photos = JSON.parse(String(rows[0].photo_data_json || '[]'));
    if (!Array.isArray(photos)) return [];
    return photos.slice(0, 5).map(function (photo) {
      const mimeType = String(photo && photo.mimeType || '').toLowerCase();
      const base64 = String(photo && photo.base64 || '').replace(/^data:[^;]+;base64,/, '');
      if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) < 0 || !base64) return '';
      return 'data:' + mimeType + ';base64,' + base64;
    }).filter(Boolean);
  } catch (error) {
    return [];
  }
}

function readStockTransferHistory_(outlet) {
  const sql = 'SELECT ' + stockTransferSelectFields_() + ' ' +
    'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_transfers` WHERE from_outlet = @outlet OR to_outlet = @outlet ORDER BY created_at DESC';
  const grouped = {};
  runNamedQuery_(sql, { outlet: outlet }).forEach(function (row) {
    const id = String(row.transfer_id || '');
    if (!id) return;
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(row);
  });
  return Object.keys(grouped).map(function (id) {
    const transfer = buildStockTransferFromRows_(grouped[id]);
    if (transfer) transfer.direction = transfer.fromOutlet === outlet ? 'OUT' : 'IN';
    return transfer;
  }).filter(Boolean).sort(function (a, b) {
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

function stockTransferSelectFields_() {
  return 'event_id, transfer_id, status, from_outlet, from_location, to_outlet, to_location, item_code, category, item_name, unit, qty, received_qty, note, expiry_date, delivery_date, created_by, created_by_name, created_at, accepted_by, accepted_by_name, accepted_at, received_at, storage_entered_at, product_temperature, rejected_by, rejected_by_name, rejected_at, rejection_reason, receipt_no, photo_file_ids, photo_count';
}

function buildStockTransferFromRows_(rows) {
  if (!rows || !rows.length) return null;
  const pending = rows.filter(function (row) { return String(row.status || '') === 'PENDING'; });
  if (!pending.length) return null;
  const first = pending[0];
  const transfer = {
    transferId: String(first.transfer_id || ''), status: 'PENDING', fromOutlet: String(first.from_outlet || ''),
    fromLocation: String(first.from_location || ''), toOutlet: String(first.to_outlet || ''), toLocation: String(first.to_location || ''),
    createdBy: String(first.created_by || ''), createdByName: String(first.created_by_name || first.created_by || ''),
    createdAt: String(first.created_at || ''), deliveryDate: String(first.delivery_date || '').slice(0, 10), receiptNo: '', photoFileIds: [], photoCount: 0, items: []
  };
  transfer.photoCount = pending.reduce(function (count, row) { return Math.max(count, Number(row.photo_count || 0)); }, 0);
  try {
    const parsedPhotoIds = JSON.parse(String(first.photo_file_ids || '[]'));
    if (Array.isArray(parsedPhotoIds)) transfer.photoFileIds = parsedPhotoIds.map(String).filter(Boolean).slice(0, 5);
  } catch (error) {
    transfer.photoFileIds = [];
  }
  if (!transfer.photoCount) transfer.photoCount = transfer.photoFileIds.length;
  pending.forEach(function (row) {
    transfer.items.push({
      lineId: String(row.event_id || ''), code: String(row.item_code || ''), category: String(row.category || ''),
      name: String(row.item_name || ''), unit: String(row.unit || ''), qty: Number(row.qty || 0), receivedQty: null,
      note: String(row.note || ''), expiryDate: String(row.expiry_date || '')
    });
  });
  const accepted = rows.filter(function (row) { return String(row.status || '') === 'ACCEPTED'; });
  const rejected = rows.filter(function (row) { return String(row.status || '') === 'REJECTED'; });
  if (accepted.length) {
    transfer.status = 'ACCEPTED';
    transfer.toLocation = String(accepted[0].to_location || '');
    transfer.acceptedBy = String(accepted[0].accepted_by || '');
    transfer.acceptedByName = String(accepted[0].accepted_by_name || accepted[0].accepted_by || '');
    transfer.acceptedAt = String(accepted[0].accepted_at || accepted[0].created_at || '');
    transfer.receivedAt = String(accepted[0].received_at || '');
    transfer.storageEnteredAt = String(accepted[0].storage_entered_at || '');
    transfer.productTemperature = accepted[0].product_temperature === null || accepted[0].product_temperature === undefined ? null : Number(accepted[0].product_temperature);
    transfer.receiptNo = String(accepted[0].receipt_no || '');
    const receivedQueues = {};
    accepted.forEach(function (row) {
      const key = stockTransferLineKey_(row.item_code, row.expiry_date);
      if (!receivedQueues[key]) receivedQueues[key] = [];
      receivedQueues[key].push({
        qty: Number(row.received_qty === null || row.received_qty === undefined ? row.qty : row.received_qty),
        receivedAt: String(row.received_at || ''),
        storageEnteredAt: String(row.storage_entered_at || ''),
        productTemperature: row.product_temperature === null || row.product_temperature === undefined ? null : Number(row.product_temperature)
      });
    });
    transfer.items.forEach(function (item) {
      const queue = receivedQueues[stockTransferLineKey_(item.code, item.expiryDate)] || [];
      const receipt = queue.length ? queue.shift() : null;
      item.receivedQty = receipt ? receipt.qty : Number(item.qty || 0);
      item.receivedAt = receipt ? receipt.receivedAt : transfer.receivedAt;
      item.storageEnteredAt = receipt ? receipt.storageEnteredAt : transfer.storageEnteredAt;
      item.productTemperature = receipt ? receipt.productTemperature : transfer.productTemperature;
    });
  } else if (rejected.length) {
    transfer.status = 'REJECTED';
    transfer.rejectedBy = String(rejected[0].rejected_by || '');
    transfer.rejectedByName = String(rejected[0].rejected_by_name || rejected[0].rejected_by || '');
    transfer.rejectedAt = String(rejected[0].rejected_at || rejected[0].created_at || '');
    transfer.rejectionReason = String(rejected[0].rejection_reason || '');
    transfer.receiptNo = String(rejected[0].receipt_no || '');
  }
  transfer.receiptNo = transfer.receiptNo || stockTransferReceiptNumber_(transfer);
  return transfer;
}

function stockTransferLineKey_(code, expiryDate) {
  return String(code || '').trim().toUpperCase() + '|' + String(expiryDate || '').slice(0, 10);
}

function stockTransferReceiptNumber_(transfer) {
  const datePart = String(transfer.createdAt || todayIso_()).slice(0, 10).replace(/[^0-9]/g, '') || todayIso_().replace(/-/g, '');
  const idPart = String(transfer.transferId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'TRANSFER';
  return 'BKR-TRF-' + datePart + '-' + idPart;
}

function receiptHtmlEscape_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function transferReceiptDate_(value, withTime) {
  if (!value) return '-';
  let date;
  if (value instanceof Date) date = value;
  else if (/^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(String(value).trim())) {
    const numeric = Number(String(value).trim());
    date = new Date(numeric < 100000000000 ? numeric * 1000 : numeric);
  } else date = new Date(value);
  if (isNaN(date.getTime())) return String(value).slice(0, 19);
  return Utilities.formatDate(date, 'Asia/Jakarta', withTime ? 'dd MMM yyyy, HH:mm' : 'dd MMM yyyy');
}

function bakerzinReceiptLogo_() {
  const logoPng = 'iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAAAXNSR0IB2cksfwAAAAlwSFlzAAALEwAACxMBAJqcGAAAf/ZJREFUeJzsnQd4FVX+hocAgQRC' +
    'C6EESASVqvRejHREqlIEXQEbKq7/XV0sIKBgWLu7IipKEQsoSFeQIiDFpShSXamhh9AJhPTk/31DBmM2uZl7c5MA870895lwk3tn5sw5v/OeM2fOKWAIIYQQ' +
    'wnEUyO8DEEIIIUTeIwEQQgghHIgEQAghhHAgEgAhhBDCgUgAhBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQ' +
    'woFIAIQQQggHIgEQQgghHIgEQAghhHAgEgAhhBDCgUgAhBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFI' +
    'AIQQQggHIgEQQgghHIgEQAghhHAgEgAhhBDCgUgAhBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQ' +
    'QggHIgEQQgghHIgEQAghhHAgEgAhhBDCgUgAhBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQQggH' +
    'IgEQQgghHIgEQAghhHAgEgAhhBDCgUgAhBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQQggHIgEQ' +
    'QgghHIgEQAghhHAgEgAhhBDCgUgAhBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQQggHIgEQQggh' +
    'HIgEQAghhHAgEgAhhBDCgUgAhBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQQggHIgEQQgghHIgE' +
    'QAghhHAgEgAhhBDCgUgAhBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQQggHIgEQQgghHIgEQAgh' +
    'hHAgEgAhhBDCgUgAhBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQQggHIgEQQgghHIgEQAghhHAg' +
    'EgAhhBDCgUgAhBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQQggHIgEQQgghHIgEQAghhHAgEgAh' +
    'hBDCgUgAhBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQQggHIgEQQgghHIgEQAghhHAgEgAhhBDC' +
    'gUgAhBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQQggHIgEQQgghHIgEQAghhHAgEgAhhBDCgUgA' +
    'hBBCCAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQQggHIgEQQgghHIgEQAghhHAgEgAhhBDCgUgAhBBC' +
    'CAciARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQQggHIgEQQgghHIgEQAghhHAgEgAhhBDCgUgAhBBCCAci' +
    'ARBCCCEciARACCGEcCASACGEEMKBSACEEEIIByIBEEIIIRyIBEAIIYRwIBIAIYQQwoFIAIQQQggHIgEQQgghHIgEQAghhHAgEgAhhBDCgUgAhBBCCAciARBC' +
    'CHHNcnjP1urYhEUe2NHhbOTBzn7FS/23co1GS32L+v+I938MqV4/Jb+P8XpFAiCEEOKaY828SWWxqZ6aklTbSEm+PSb6bIPLly40DChVbke1+m2WFvErLgHI' +
    'IRIAIYQQ1xwQgObYPHXpXFTDc5H7i8ddvhSQlJQcULpC6OZ6Yb2X+hUvJQHIIRIAIYQQ+c729d+VxOa2mPOng4/v22YkJSXWLeIfMCA+5sLN0aePGvFxsUZK' +
    'SooRGHzzhkYd71vqH1BaApBDJABCCCHyHQgA7/U/CwFoRwG4cOq4f2JSQmByUkKR5MQEIzU1BS/DKFtJAuAtJABCCCHyje8mjymOTaMCBQvdUbBg4Xvi42Lq' +
    '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' +
    '4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAh' +
    'AgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIA' +
    'AAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAA' +
    'HiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4i' +
    'AAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAA' +
    'AOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADg' +
    'IQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CEC' +
    'AAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAA' +
    'AB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAeIgAAAOAhAgAAAB4iAAAA4CECAAAAHiIAAADgIQIAAAAe' +
    'IgAAAOAhAgAAAB4iAAAA4CECAAAAHvp/ZoWGr7ycqgsAAAAASUVORK5CYII=';
  return '<div class="brand-logo-crop"><img class="brand-logo" alt="Bakerzin" src="data:image/png;base64,' + logoPng + '"></div>';
}

function buildTransferReceiptPdf_(transfer) {
  const receiptNo = transfer.receiptNo || stockTransferReceiptNumber_(transfer);
  const status = String(transfer.status || 'PENDING');
  const statusTitle = status === 'ACCEPTED' ? 'DITERIMA' : status === 'REJECTED' ? 'DITOLAK' : 'BELUM DITERIMA';
  const statusDescription = status === 'ACCEPTED' ? 'Penerimaan telah dikonfirmasi secara elektronik.' : status === 'REJECTED' ? 'Kiriman ditolak dan stok dikembalikan ke pengirim.' : 'Dokumen ini belum merupakan bukti penerimaan final.';
  const statusClass = status === 'ACCEPTED' ? 'accepted' : 'pending';
  let sentTotal = 0, receivedTotal = 0;
  const rows = transfer.items.map(function (item, index) {
    const sent = Number(item.qty || 0), hasReceived = status === 'ACCEPTED' && item.receivedQty !== null && item.receivedQty !== undefined;
    const received = hasReceived ? Number(item.receivedQty || 0) : null;
    sentTotal += sent;
    if (received !== null) receivedTotal += received;
    const variance = received === null ? '-' : formatQty_(received - sent);
    return '<tr><td>' + (index + 1) + '</td><td><b>' + receiptHtmlEscape_(item.code) + '</b><br><span>' + receiptHtmlEscape_(item.name) + '</span></td>' +
      '<td>' + receiptHtmlEscape_(item.unit) + '</td><td class="num">' + formatQty_(sent) + '</td><td class="num">' + (received === null ? '-' : formatQty_(received)) + '</td>' +
      '<td class="num ' + (received !== null && Math.abs(received - sent) > 0.0000001 ? 'variance' : '') + '">' + variance + '</td>' +
      '<td>' + receiptHtmlEscape_(status === 'ACCEPTED' && item.productTemperature !== null && item.productTemperature !== undefined && item.productTemperature !== '' ? formatQty_(item.productTemperature) + ' °C' : '-') + '</td>' +
      '<td>' + receiptHtmlEscape_(item.expiryDate ? transferReceiptDate_(item.expiryDate, false) : 'Tidak dicatat') + '</td><td>' + receiptHtmlEscape_(item.note || '-') + '</td></tr>';
  }).join('');
  const receiverName = status === 'ACCEPTED' ? (transfer.acceptedByName || transfer.acceptedBy || '-') : status === 'REJECTED' ? (transfer.rejectedByName || transfer.rejectedBy || '-') : 'Belum dikonfirmasi';
  const processedAt = status === 'ACCEPTED' ? transfer.acceptedAt : status === 'REJECTED' ? transfer.rejectedAt : '';
  const rejection = status === 'REJECTED' ? '<div class="reason"><b>ALASAN PENOLAKAN</b><br>' + receiptHtmlEscape_(transfer.rejectionReason || '-') + '</div>' : '';
  const receiverStamp = status === 'ACCEPTED' ? '<div class="party-stamp">WELL RECEIVED BY<small>' +
    receiptHtmlEscape_(receiverName) + '</small></div>' : '';
  let photoDataUrls = Array.isArray(transfer.photoDataUrls) ? transfer.photoDataUrls : [];
  if (!photoDataUrls.length) photoDataUrls = (Array.isArray(transfer.photoFileIds) ? transfer.photoFileIds : []).map(transferPhotoDataUrl_).filter(Boolean);
  const photoCards = photoDataUrls.map(function (dataUrl, index) {
    return dataUrl ? '<div class="photo-card"><img src="' + dataUrl + '"><div>Foto ' + (index + 1) + '</div></div>' : '';
  }).filter(Boolean).join('');
  const photos = photoCards ? '<div class="photos"><div class="photos-title">FOTO PENGIRIMAN</div><div class="photo-grid">' + photoCards + '</div></div>' : '';
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#292326;font-size:9px;margin:0}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #9f172b;padding-bottom:14px}.logo{width:205px;height:62px}.brand-logo-crop{width:205px;height:62px;overflow:hidden}.brand-logo{display:block;width:205px;height:205px;margin-top:-74px}.doc-title{text-align:right}.doc-title h1{font-size:18px;margin:0 0 5px}.doc-title b{color:#9f172b}.stamp{margin:16px 0;padding:12px 16px;border:2px solid #b21f35;color:#b21f35;background:#fff2f4;text-align:center;font-weight:800;font-size:15px;letter-spacing:2px}.stamp.accepted{border-color:#247a4a;color:#247a4a;background:#effaf3}.stamp small{display:block;margin-top:5px;font-size:8px;letter-spacing:0;font-weight:600}.meta-grid{display:table;width:100%;table-layout:fixed;margin:14px 0}.meta{display:table-cell;width:50%;border:1px solid #e1dadd;padding:11px;vertical-align:top}.meta:first-child{border-right:0}.label{font-size:7px;color:#8a777d;font-weight:800;letter-spacing:1px}.meta h3{margin:5px 0 7px;font-size:13px}.meta p{margin:3px 0;line-height:1.4}.party-stamp{display:inline-block;margin-top:10px;padding:7px 11px;border:2px solid #247a4a;border-radius:5px;color:#247a4a;background:#effaf3;font-size:10px;font-weight:800;letter-spacing:1px;transform:rotate(-2deg)}.party-stamp small{display:block;margin-top:4px;font-size:7px;font-weight:600;letter-spacing:0}.summary{display:table;width:100%;margin:0 0 14px;background:#f7f3f4}.summary div{display:table-cell;padding:9px 11px}.summary b{display:block;font-size:12px;margin-top:3px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{background:#8d1b2e;color:#fff;font-size:7px;letter-spacing:.5px;padding:8px 5px;text-align:left}td{border-bottom:1px solid #e7e0e2;padding:8px 5px;vertical-align:top;line-height:1.35}td span{color:#655a5e}.num{text-align:right}.variance{color:#b21f35;font-weight:800}.item-receipt-detail td{padding-top:4px;padding-bottom:8px;background:#faf7f8;color:#5f5257;font-size:8px}.photos{margin-top:16px;page-break-inside:avoid}.photos-title{font-weight:800;color:#8d1b2e;letter-spacing:1px;margin-bottom:8px}.photo-grid{font-size:0}.photo-card{display:inline-block;width:31.5%;margin:0 1.8% 9px 0;border:1px solid #ddd4d7;padding:4px;vertical-align:top;page-break-inside:avoid}.photo-card:nth-child(3n){margin-right:0}.photo-card img{display:block;width:100%;height:115px;object-fit:cover}.photo-card div{padding:4px 2px 1px;font-size:7px;color:#6e6166}.reason{margin-top:14px;padding:11px;border-left:4px solid #b21f35;background:#fff2f4;line-height:1.5}.declaration{margin:16px 0;color:#5d5357;line-height:1.55}.footer{margin-top:22px;border-top:1px solid #d8cfd2;padding-top:8px;color:#88787e;font-size:7px;display:flex;justify-content:space-between}</style></head><body>' +
    '<div class="header"><div class="logo">' + bakerzinReceiptLogo_() + '</div><div class="doc-title"><h1>E-TRANSFER GOODS</h1><b>' + receiptHtmlEscape_(receiptNo) + '</b><div>Transfer ID: ' + receiptHtmlEscape_(transfer.transferId) + '</div></div></div>' +
    '<div class="stamp ' + statusClass + '">' + statusTitle + '<small>' + statusDescription + '</small></div>' +
    '<div class="meta-grid"><div class="meta"><span class="label">PENGIRIM</span><h3>' + receiptHtmlEscape_(transfer.fromOutlet) + '</h3><p>Lokasi: ' + receiptHtmlEscape_(transfer.fromLocation || '-') + '</p><p>Nama: ' + receiptHtmlEscape_(transfer.createdByName || '-') + '</p><p>NIK: ' + receiptHtmlEscape_(transfer.createdBy || '-') + '</p><p>Dikirim: ' + receiptHtmlEscape_(transferReceiptDate_(transfer.createdAt, true)) + '</p></div>' +
    '<div class="meta"><span class="label">PENERIMA</span><h3>' + receiptHtmlEscape_(transfer.toOutlet) + '</h3><p>Lokasi: ' + receiptHtmlEscape_(transfer.toLocation || 'Belum dipilih') + '</p><p>Nama: ' + receiptHtmlEscape_(receiverName) + '</p><p>NIK: ' + receiptHtmlEscape_(status === 'ACCEPTED' ? transfer.acceptedBy : status === 'REJECTED' ? transfer.rejectedBy : '-') + '</p><p>Diproses: ' + receiptHtmlEscape_(processedAt ? transferReceiptDate_(processedAt, true) : 'Belum diproses') + '</p>' + (status === 'ACCEPTED' ? '<p>Waktu Terima: ' + receiptHtmlEscape_(transferReceiptDate_(transfer.receivedAt, true)) + '</p><p>Waktu Masuk Storage: ' + receiptHtmlEscape_(transferReceiptDate_(transfer.storageEnteredAt, true)) + '</p>' : '') + receiverStamp + '</div></div>' +
    '<div class="summary"><div><span class="label">JUMLAH BARIS</span><b>' + transfer.items.length + '</b></div><div><span class="label">TOTAL QTY DIKIRIM</span><b>' + formatQty_(sentTotal) + '</b></div><div><span class="label">TOTAL QTY DITERIMA</span><b>' + (status === 'ACCEPTED' ? formatQty_(receivedTotal) : '-') + '</b></div></div>' +
    '<table><thead><tr><th style="width:4%">NO</th><th style="width:20%">ITEM</th><th style="width:7%">UNIT</th><th style="width:9%">DIKIRIM</th><th style="width:9%">DITERIMA</th><th style="width:8%">SELISIH</th><th style="width:9%">SUHU</th><th style="width:14%">EXPIRY</th><th style="width:20%">CATATAN</th></tr></thead><tbody>' + rows + '</tbody></table>' + rejection + photos +
    '<div class="declaration">Dokumen elektronik ini merupakan bukti operasional internal Bakerzin. Identitas pengguna, tanggal, jam, nomor dokumen, serta rincian kuantitas tersimpan sebagai jejak audit. Dokumen ini tidak memerlukan tanda tangan manual.</div>' +
    '<div class="footer"><span>BAKERZIN - Stock Transfer Control</span><span>Dibuat: ' + receiptHtmlEscape_(transferReceiptDate_(new Date(), true)) + '</span></div></body></html>';
  const blob = HtmlService.createHtmlOutput(html).getBlob().getAs(MimeType.PDF);
  return blob.setName(cleanExportName_('Tanda_Terima_' + receiptNo) + '.pdf');
}

function ensureStockConversionSheet_() {
  return ensureSheet_(CONFIG.STOCK_CONVERSION_SHEET, ['ITEM_CODE', 'ITEM_NAME', 'FROM_UNIT', 'TO_UNIT', 'FACTOR', 'ACTIVE', 'UPDATED_BY', 'UPDATED_AT']);
}

function upsertStockConversionRows_(entries, employee) {
  const sheet = ensureStockConversionSheet_(), existing = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues().forEach(function (row, index) {
      const key = stockConversionKey_(row[0], row[2], row[3]);
      if (key) existing[key] = index + 2;
    });
  }
  const additions = [], now = new Date();
  (entries || []).forEach(function (entry) {
    const key = stockConversionKey_(entry.itemCode, entry.fromUnit, entry.toUnit);
    const values = [entry.itemCode, entry.itemName, normalizeUnit_(entry.fromUnit), normalizeUnit_(entry.toUnit), Number(entry.factor), true, employee.nik, now];
    if (existing[key]) sheet.getRange(existing[key], 1, 1, 8).setValues([values]);
    else additions.push(values);
  });
  if (additions.length) sheet.getRange(sheet.getLastRow() + 1, 1, additions.length, 8).setValues(additions);
}

function stockConversionKey_(itemCode, fromUnit, toUnit) {
  const code = String(itemCode || '').trim().toUpperCase();
  const from = normalizeUnit_(fromUnit);
  const to = normalizeUnit_(toUnit);
  return code && from && to ? code + '|' + from + '|' + to : '';
}

function readStockUnitConversions_() {
  const cached = readScriptJsonCache_('stock-unit-conversions');
  if (cached) return cached;
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

function showcaseSeedRows_() {
  return [
    ['CHOCOLATE M','CAKE & DESSERT','MACARON','MACAROON CHOCO MACAROON','WIP FOOD','WIP FOOD','PCS',2],
    ['GALAXY M','CAKE & DESSERT','MACARON','MACAROON GALAXI','WIP FOOD','WIP FOOD','PCS',1],
    ['RASPBERRY M','CAKE & DESSERT','MACARON','MACAROON RASPBERRY MACAROON','WIP FOOD','WIP FOOD','PCS',2],
    ['BLUEBERRY M','CAKE & DESSERT','MACARON','MACAROON BLUEBERRY MACAROON','WIP FOOD','WIP FOOD','PCS',1],
    ['ISPAHAN M','CAKE & DESSERT','MACARON','MACAROON ISPAHAN MACAROON','WIP FOOD','WIP FOOD','PCS',1],
    ['PISTACHIO M','CAKE & DESSERT','MACARON','MACAROON PISTCHIO MACAROON','WIP FOOD','WIP FOOD','PCS',1],
    ['CARAMEL M','CAKE & DESSERT','MACARON','MACAROON CARAMEL','WIP FOOD','WIP FOOD','PCS',1],
    ['FORET NOIR M','CAKE & DESSERT','MACARON','MACAROON FORET NOIR MACAROON','WIP FOOD','WIP FOOD','PCS',1],
    ['GREENTEA M','CAKE & DESSERT','MACARON','MACAROON GREEN TEA MACAROON','WIP FOOD','WIP FOOD','PCS',1],
    ['CURACAO M','CAKE & DESSERT','MACARON','BLUE LAGOON MACAROON','WIP FOOD','WIP FOOD','PCS',1],
    ['COOKIES & CREAM M','CAKE & DESSERT','MACARON','COOKIES AND CREAM MACAROON','WIP FOOD','WIP FOOD','PCS',3],
    ['RED VELVET M','CAKE & DESSERT','MACARON','RED VELVET MACAROON','WIP FOOD','WIP FOOD','PCS',2],
    ['MACADAMIA ALMOND CROISSANT','PASTRY','PASTRY','Butter Croissant@90gr','WIP FOOD','WIP FOOD','PCS',1],
    ['ALMOND CROISSANT','PASTRY','PASTRY','Butter Croissant@90gr','WIP FOOD','WIP FOOD','PCS',1],
    ['CROISSANT CHOCO CHIPS COOKIES','PROMO','PASTRY','Butter Croissant @60gr','WIP FOOD','WIP FOOD','PCS',1],
    ['CROISSANT DOUBLE CHOCO CHIPS','PROMO','PASTRY','Butter Croissant @60gr','WIP FOOD','WIP FOOD','PCS',1],
    ['TRIPLE CHOCO DANISH','PASTRY','PASTRY','Choc Manjari Danish','PASTRY AND CAKES','FINISHED GOODS','PCS',1],
    ['BUTTER CROISSANT','PASTRY','PASTRY','Butter Croissant@90gr','WIP FOOD','WIP FOOD','PCS',1],
    ['CINNAMON ROLL','PASTRY','PASTRY','Cinamon roll','PASTRY AND CAKES','FINISHED GOODS','PCS',1],
    ['CROISSANT MARTABAK','PASTRY','PASTRY','CROISANT MARTABAK','PASTRY AND CAKES','FINISHED GOODS','PCS',1],
    ['PAIN AU CHOCOLATE','PASTRY','PASTRY','Danish Chocolate@80GR','WIP FOOD','WIP FOOD','PCS',1],
    ['BEEF SAUSAGE HONEY MUSTARD','PASTRY','PASTRY','Danish Sausage','WIP FOOD','WIP FOOD','PCS',1],
    ['CROISSANT MATCHA COOKIES','PROMO','PASTRY','Butter Croissant @60gr','WIP FOOD','WIP FOOD','PCS',1],
    ['NEWYORK CHEESECAKE SLICE','CAKE & DESSERT','SLICE CAKE','New York Cheese Slice','PASTRY AND CAKES','FINISHED GOODS','BOX@12SLICE',0.0833],
    ['RED VELVET SLICE','CAKE & DESSERT','SLICE CAKE','New red velvet cake SLICE','PASTRY AND CAKES','FINISHED GOODS','Box@10slice',0.1],
    ['BLUEBERRY CHEESECAKE SLICE','CAKE & DESSERT','SLICE CAKE','Blueberry Cheese Cake Slice new','PASTRY AND CAKES','FINISHED GOODS','BOX@12SLICE',0.0833],
    ['CHOCOLATE AMER','CAKE & DESSERT','SLICE CAKE','CHOCOLATE AMER SLICE','WIP FOOD','WIP FOOD','SLICE',1],
    ['EARL GREY PEACH CAKE SLICE','CAKE & DESSERT','SLICE CAKE','EARL GREY PEACH CAKE','WIP FOOD','WIP FOOD','WHOLE',0.13],
    ['OREO CHEESECAKE SLICE','CAKE & DESSERT','SLICE CAKE','New Oreo Cheese Slice','PASTRY AND CAKES','FINISHED GOODS','BOX@12SLICE',0.0833],
    ['TIRAMISU SLICE','CAKE & DESSERT','SLICE CAKE','New Tiramisu whole Slice','PASTRY AND CAKES','FINISHED GOODS','BOX@8SLICE',0.125],
    ['MATCHA JASMINE SLICE','CAKE & DESSERT','SLICE CAKE','Matcha jasmine strawberry slice','PASTRY AND CAKES','FINISHED GOODS','Box@10slice',0.1],
    ['FORET NOIR','CAKE & DESSERT','SLICE CAKE','FORET NOIR SLICE','WIP FOOD','WIP FOOD','SLICE',1],
    ['BLUBERRY LEMON CAKE SLICE','CAKE & DESSERT','SLICE CAKE','BLUEBERRY LEMON CREAM CHEESE','WIP FOOD','WIP FOOD','WHOLE',0.13],
    ['CHOCO AVOCADO SLICE','CAKE & DESSERT','SLICE CAKE','Choc Avocado Manjari Cake SLICE','PASTRY AND CAKES','FINISHED GOODS','SLICE',1],
    ['HAZELNUT CHOCO SLICE','CAKE & DESSERT','SLICE CAKE','HAZELNUT WHOLE','FOOD','GROCERIES','GR',0.1],
    ['BISCOFF CARAMEL CAKE SLICE','CAKE & DESSERT','SLICE CAKE','BISCOFF CAKE','WIP FOOD','WIP FOOD','WHOLE',0.13],
    ['CLASSIC COFFEE CAKE SLICE','CAKE & DESSERT','SLICE CAKE','TIRAMISU CAKE1222','WIP FOOD','WIP FOOD','WHOLE',0.13],
    ['CHOCOLATE CHARLOTTE CAKE SLICE','CAKE & DESSERT','SLICE CAKE','CHOCOLATE CHARLOTTE','WIP FOOD','WIP FOOD','WHOLE',0.13],
    ['BLUEBERRY CHEESECAKE','CAKE & DESSERT','SLICE CAKE','BLUEBERRY CHEESE CAKE SLICE','WIP FOOD','WIP FOOD','SLICE',1],
    ['NEW YORK CHEESECAKE','CAKE & DESSERT','SLICE CAKE','NEWYORK CHEESE CK SLICE','WIP FOOD','WIP FOOD','SLICE',1],
    ['UBE BANANA MOUSSE TART SLICE','CAKE & DESSERT','SLICE CAKE','Ube Banana Tart Cake SLICE','PASTRY AND CAKES','FINISHED GOODS','Box@10slice',0.1],
    ['MATCHA CHEESECAKE SLICE','CAKE & DESSERT','SLICE CAKE','FROMAGE MATCHA SLICE','PASTRY AND CAKES','FINISHED GOODS','BOX@8SLICE',0.125],
    ['CLASSIC COFFEE CAKE WHOLE','CAKE & DESSERT','WHOLE CAKE','TIRAMISU CAKE1222','WIP FOOD','WIP FOOD','WHOLE',1],
    ['RED VELVET WHOLE','CAKE & DESSERT','WHOLE CAKE','New Red Velvet Cake D.23 cm','PASTRY AND CAKES','FINISHED GOODS','WHL',1],
    ['BLUBERRY LEMON CAKE WHOLE','CAKE & DESSERT','WHOLE CAKE','BLUEBERRY LEMON CREAM CHEESE','WIP FOOD','WIP FOOD','WHOLE',1],
    ['BISCOFF CARAMEL CAKE WHOLE','CAKE & DESSERT','WHOLE CAKE','BISCOFF CAKE','WIP FOOD','WIP FOOD','WHOLE',1],
    ['CHOCOLATE AMER 20','CAKE & DESSERT','WHOLE CAKE','CHOCOLATE AMER SIZE 20CM','WIP FOOD','WIP FOOD','WHOLE',1],
    ['BLUEBERRY CHEESECAKE WHOLE','CAKE & DESSERT','WHOLE CAKE','Blueberry Cheese Cake New D23','PASTRY AND CAKES','FINISHED GOODS','WHOLE',1],
    ['CHOCOLATE AMER 17','CAKE & DESSERT','WHOLE CAKE','CHOCOLATE AMER SIZE 17CM','WIP FOOD','WIP FOOD','WHOLE',1],
    ['TIRAMISU WHOLE','CAKE & DESSERT','WHOLE CAKE','New Tiramisu whole D.20','PASTRY AND CAKES','FINISHED GOODS','WHL',1],
    ['CHOCOLATE CHARLOTTE CAKE WHOLE','CAKE & DESSERT','WHOLE CAKE','CHOCOLATE CHARLOTTE','WIP FOOD','WIP FOOD','WHOLE',1],
    ['AVOCADO COFFEE CAKE','CAKE & DESSERT','WHOLE CAKE','Avocado Cake CO D.20 cm','PASTRY AND CAKES','FINISHED GOODS','WHL',1],
    ['CHOCOLATE AMER 28','CAKE & DESSERT','WHOLE CAKE','CHOCOLATE AMER SIZE 28CM','WIP FOOD','WIP FOOD','WHOLE',1],
    ['CHOCOLATE TIRAMISU CAKE','CAKE & DESSERT','WHOLE CAKE','Coffe Cake CO D.20cm','PASTRY AND CAKES','FINISHED GOODS','WHL',1],
    ['CHOCOLATE AMER 24','CAKE & DESSERT','WHOLE CAKE','CHOCOLATE AMER SIZE 24CM','WIP FOOD','WIP FOOD','WHOLE',1],
    ['EARL GREY PEACH CAKE WHOLE','CAKE & DESSERT','WHOLE CAKE','EARL GREY PEACH CAKE','WIP FOOD','WIP FOOD','WHOLE',1],
    ['NEWYORK CHEESECAKE WHOLE','CAKE & DESSERT','WHOLE CAKE','New York Cheese New D23 cm','PASTRY AND CAKES','FINISHED GOODS','WHL',1],
    ['HAZELNUT CHOCO WHOLE','CAKE & DESSERT','WHOLE CAKE','Hazelnut Chocolate New D20 cm','PASTRY AND CAKES','FINISHED GOODS','WHL',1],
    ['CHOCO AVOCADO WHOLE','CAKE & DESSERT','WHOLE CAKE','Choco Avocado Manjari Cake','PASTRY AND CAKES','FINISHED GOODS','WHL',1],
    ['OREO CHEESECAKE WHOLE','CAKE & DESSERT','WHOLE CAKE','New Oreo Cheese Cake D23 cm','PASTRY AND CAKES','FINISHED GOODS','WHL',1],
    ['FORET NOIR 22','CAKE & DESSERT','WHOLE CAKE','FORET NOIR WHOLE','WIP FOOD','WIP FOOD','WHOLE',1]
  ];
}

function ensureShowcaseSheet_() {
  // Kode Item sengaja ditambahkan di kolom I agar referensi sumber A/C/D/G/H tidak bergeser.
  const headers = ['Menu','Menu Category','Menu Category Detail','Product','Product Category','Product Sub Category','Unit','Qty','Kode Item'];
  const sheet = ensureSheet_(CONFIG.SHOWCASE_SHEET, headers);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (sheet.getLastRow() < 2) {
    // An empty MENU_SHOWCASE is valid. Do not restore defaults automatically;
    // this lets operations temporarily disable Showcase by clearing its rows.
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  } else {
    const rowCount = sheet.getLastRow() - 1;
    const names = sheet.getRange(2, 1, rowCount, 1).getDisplayValues();
    const codes = sheet.getRange(2, 9, rowCount, 1).getDisplayValues();
    let changed = false;
    const completedCodes = codes.map(function (row, index) {
      const existing = cleanText_(row[0], 80).toUpperCase();
      if (existing || !cleanText_(names[index][0], 180)) return [existing];
      changed = true;
      return [showcaseItemCode_(names[index][0])];
    });
    if (changed) sheet.getRange(2, 9, rowCount, 1).setValues(completedCodes);
  }
  return sheet;
}

/** Restores the original Showcase menu only when run manually from Apps Script. */
function restoreDefaultShowcaseMenu() {
  const lock = acquireStockWriteLock_();
  try {
    const sheet = ensureShowcaseSheet_();
    if (sheet.getLastRow() >= 2) {
      throw new Error('MENU_SHOWCASE masih memiliki data. Kosongkan baris data sebelum memulihkan menu bawaan.');
    }
    const rows = showcaseSeedRows_().map(function (row) { return row.concat(showcaseItemCode_(row[0])); });
    sheet.getRange(2, 1, rows.length, 9).setValues(rows);
    sheet.getRange(2, 8, rows.length, 1).setNumberFormat('0.0000');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, 9);
    SpreadsheetApp.flush();
    return { restored: true, sheetName: CONFIG.SHOWCASE_SHEET, itemCount: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function showcaseItemCode_(menuName) {
  return 'SC-' + digest_(normalizeStoreName_(menuName)).slice(0, 10).toUpperCase();
}

function showcaseUnitForCategory_(category) {
  const units = {
    'MACARON': 'PCS',
    'PASTRY': 'PCS',
    'SLICE CAKE': 'SLICE',
    'WHOLE CAKE': 'WHOLE',
    'BUTTER TTEOK': 'PCS'
  };
  return units[normalizeStockCategory_(category)] || 'PCS';
}

function readShowcaseItems_() {
  const sheet = ensureShowcaseSheet_();
  if (sheet.getLastRow() < 2) return [];
  const seenCodes = {}, seenNames = {};
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues().map(function (row, index) {
    const name = cleanText_(row[0], 180);
    const productQty = Number(row[7]);
    if (!name || !cleanText_(row[3], 180) || !isFinite(productQty) || productQty <= 0) return null;
    const code = cleanText_(row[8], 80).toUpperCase() || showcaseItemCode_(name);
    const nameKey = name.toLowerCase();
    if (seenNames[nameKey]) throw new Error('Nama Menu Showcase "' + name + '" digunakan lebih dari sekali pada baris ' + seenNames[nameKey] + ' dan ' + (index + 2) + '.');
    if (seenCodes[code]) throw new Error('Kode Item Showcase "' + code + '" digunakan lebih dari sekali pada baris ' + seenCodes[code] + ' dan ' + (index + 2) + '.');
    seenNames[nameKey] = index + 2;
    seenCodes[code] = index + 2;
    const categoryColumnC = cleanText_(row[2], 100);
    return {
      code: code, category: categoryColumnC || cleanText_(row[1], 100) || 'SHOWCASE',
      name: name, unit: showcaseUnitForCategory_(categoryColumnC), active: true, showcase: true, sourceRow: index + 2,
      menuCategory: cleanText_(row[1], 100), productName: cleanText_(row[3], 180),
      productCategory: cleanText_(row[4], 100), productSubCategory: cleanText_(row[5], 100),
      productUnit: cleanText_(row[6], 40), productQty: productQty
    };
  }).filter(Boolean);
}

function isShowcaseLocation_(location) {
  return normalizeLocation_(location).toLowerCase() === 'showcase';
}

function findShowcaseItem_(itemKey) {
  const wanted = String(itemKey || '').trim().toLowerCase();
  const items = readShowcaseItems_();
  for (let i = 0; i < items.length; i++) {
    if (items[i].code.toLowerCase() === wanted || items[i].name.toLowerCase() === wanted) return items[i];
  }
  throw new Error('Item Showcase tidak ditemukan pada sheet ' + CONFIG.SHOWCASE_SHEET + '.');
}

function findStockItemForLocation_(location, itemKey) {
  return isShowcaseLocation_(location) ? findShowcaseItem_(itemKey) : findStockMasterItem_(itemKey);
}

function showcaseProductNameMap_() {
  const map = {};
  readShowcaseItems_().forEach(function (item) { map[normalizeStoreName_(item.productName)] = true; });
  return map;
}

function readStockMaster_(includeInactive) {
  const cacheKey = includeInactive ? 'stock-master-all' : 'stock-master-active';
  const cached = readScriptJsonCache_(cacheKey);
  if (cached) return cached;
  const sheet = ensureStockMasterSheet_();
  if (sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues();
  const result = rows.filter(function (r) {
    return String(r[0] || '').trim() && String(r[2] || '').trim() && (includeInactive || String(r[4] || '').trim() === '' || truthy_(r[4]));
  }).map(function (r) {
    return { code: String(r[0]).trim().toUpperCase(), category: String(r[1] || 'Uncategorized').trim(), name: String(r[2]).trim(), unit: String(r[3] || '').trim(), active: String(r[4] || '').trim() === '' || truthy_(r[4]) };
  }).sort(function (a, b) { return a.category.localeCompare(b.category) || a.name.localeCompare(b.name); });
  writeScriptJsonCache_(cacheKey, result, 600);
  return result;
}

function findStockMasterItem_(itemKey) {
  const wanted = String(itemKey || '').trim().toLowerCase();
  const items = readStockMaster_();
  for (let i = 0; i < items.length; i++) if (items[i].code.toLowerCase() === wanted || items[i].name.toLowerCase() === wanted) return items[i];
  throw new Error('Item tidak ditemukan atau tidak aktif pada sheet STOCK_ITEMS.');
}

function readStockItemsWithQty_(outlet, location) {
  const showcaseLocation = isShowcaseLocation_(location);
  const master = showcaseLocation ? readShowcaseItems_() : readStockMaster_();
  if (!master.length) return [];
  const hiddenItems = readStockHiddenMap_(outlet, location);
  const rows = readStockBalanceRows_(outlet, location);
  const codeQty = {}, nameQty = {}, legacyNameQty = {};
  rows.forEach(function (r) {
    const rowName = String(r.item_name || '').trim().toLowerCase();
    if (rowName) nameQty[rowName] = Number(nameQty[rowName] || 0) + Number(r.current_qty || 0);
    if (String(r.item_code || '').trim()) codeQty[String(r.item_code).toLowerCase()] = Number(r.current_qty || 0);
    else legacyNameQty[String(r.item_name).toLowerCase()] = Number(r.current_qty || 0);
  });
  return master.map(function (item) {
    return {
      code: item.code, category: item.category, name: item.name, unit: item.unit,
      qty: showcaseLocation ? Number(nameQty[item.name.toLowerCase()] || 0) : (codeQty[item.code.toLowerCase()] || 0) + (legacyNameQty[item.name.toLowerCase()] || 0), hidden: Boolean(hiddenItems[item.code]),
      showcase: Boolean(item.showcase), productName: item.productName || '', productUnit: item.productUnit || '', productQty: Number(item.productQty || 0)
    };
  });
}

function stockItemsCacheKey_(outlet, location) {
  return 'stock-items-fast-v1-' + digest_(String(outlet || '').trim().toUpperCase() + '|' + normalizeLocation_(location).toLowerCase()).slice(0, 28);
}

function readStockItemsWithQtyCached_(outlet, location) {
  const key = stockItemsCacheKey_(outlet, location);
  const cached = readScriptJsonCache_(key);
  if (cached) return cached;
  const items = readStockItemsWithQty_(outlet, location);
  writeScriptJsonCache_(key, items, 45);
  return items;
}

function invalidateStockItemCachesForRows_(rows) {
  const keys = {}, monitorKeys = {};
  (rows || []).forEach(function (entry) {
    const row = entry && entry.json ? entry.json : entry;
    if (!row || !row.outlet || !row.location) return;
    keys[stockItemsCacheKey_(row.outlet, row.location)] = true;
    const date = String(row.event_date || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) monitorKeys['stock-upload-monitor-v1-' + date.slice(0, 7)] = true;
  });
  removeScriptCacheKeys_(Object.keys(keys).concat(Object.keys(monitorKeys)));
}

function stockNoExpiryCategorySeed_() {
  return [
    'KITCHEN EQUIPMENT',
    'KITCHENWARE TOOLS',
    'MARKETING AND DESIGN COST',
    'MEDICINE',
    'NCG',
    'NON CONSUMABLE GOODS',
    'OTHERS',
    'STATIONARY',
    'TAKE AWAY ITEMS'
  ];
}

function normalizeStockCategory_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function ensureStockNoExpiryCategorySheet_() {
  const sheet = ensureSheet_(CONFIG.STOCK_NO_EXPIRY_CATEGORY_SHEET, ['CATEGORY']);
  sheet.getRange(1, 1).setValue('CATEGORY').setFontWeight('bold').setBackground('#9f172b').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  if (sheet.getLastRow() < 2) {
    const rows = stockNoExpiryCategorySeed_().map(function (category) { return [category]; });
    sheet.getRange(2, 1, rows.length, 1).setValues(rows);
    sheet.autoResizeColumn(1);
  }
  return sheet;
}

function readStockNoExpiryCategoryMap_() {
  const sheet = ensureStockNoExpiryCategorySheet_(), map = {};
  if (sheet.getLastRow() < 2) return map;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(function (row) {
    const category = normalizeStockCategory_(row[0]);
    if (category) map[category] = true;
  });
  return map;
}

function readRemainingStockLots_(outlet, location, itemCode, itemName) {
  const sql = latestStockMovementCte_() + ' SELECT record_id, COALESCE(NULLIF(logical_id, \'\'), record_id) AS logical_id, ' +
    'event_date, direction, qty, movement_type, info, production_date, expiry_date, source_arrival_date, created_at ' +
    'FROM latest WHERE outlet = @outlet AND location = @location AND ((item_code = @itemCode AND @itemCode != \'\') OR (LOWER(item_name) = LOWER(@itemName))) ' +
    'ORDER BY event_date, created_at';
  const history = runNamedQuery_(sql, { outlet: outlet, location: location, itemCode: String(itemCode || '').trim().toUpperCase(), itemName: itemName }, { useQueryCache: false }).map(function (row) {
    return {
      recordId: String(row.record_id || ''), logicalId: String(row.logical_id || row.record_id || ''),
      date: String(row.event_date || ''), direction: String(row.direction || ''), qty: Number(row.qty || 0),
      movementType: String(row.movement_type || ''), info: String(row.info || ''),
      productionDate: String(row.production_date || ''), expiryDate: String(row.expiry_date || ''),
      sourceArrivalDate: String(row.source_arrival_date || ''), createdAt: String(row.created_at || '')
    };
  });
  const snapshots = calculateFifoSnapshots_(history), dates = Object.keys(snapshots).sort();
  return dates.length ? snapshots[dates[dates.length - 1]].filter(function (lot) { return Number(lot.qty || 0) > 0.0000001; }) : [];
}

function readRemainingStockLotsBatch_(outlet, location, items) {
  const codes = (items || []).map(function (item) { return String(item.code || '').trim().toUpperCase(); })
    .filter(function (code, index, values) { return code && code.indexOf('|') < 0 && values.indexOf(code) === index; });
  const result = {};
  codes.forEach(function (code) { result[code] = []; });
  if (!codes.length) return result;
  // Filter partition dan item sebelum QUALIFY agar batch tidak memindai seluruh ledger.
  const sql = 'WITH latest AS (SELECT * FROM ' + stockCardTable_() + ' WHERE record_type = \'MOVEMENT\' ' +
    'AND outlet = @outlet AND location = @location AND item_code IN UNNEST(SPLIT(@itemCodes, \'|\')) ' +
    'QUALIFY ROW_NUMBER() OVER (PARTITION BY COALESCE(NULLIF(logical_id, \'\'), record_id) ' +
    'ORDER BY COALESCE(version, 1) DESC, created_at DESC) = 1) ' +
    'SELECT item_code, record_id, COALESCE(NULLIF(logical_id, \'\'), record_id) AS logical_id, ' +
    'event_date, direction, qty, movement_type, info, production_date, expiry_date, source_arrival_date, created_at ' +
    'FROM latest ORDER BY item_code, event_date, created_at';
  const historyByCode = {};
  runNamedQuery_(sql, { outlet: outlet, location: location, itemCodes: codes.join('|') }, { useQueryCache: false }).forEach(function (row) {
    const code = String(row.item_code || '').trim().toUpperCase();
    if (!result.hasOwnProperty(code)) return;
    if (!historyByCode[code]) historyByCode[code] = [];
    historyByCode[code].push({
      recordId: String(row.record_id || ''), logicalId: String(row.logical_id || row.record_id || ''),
      date: String(row.event_date || ''), direction: String(row.direction || ''), qty: Number(row.qty || 0),
      movementType: String(row.movement_type || ''), info: String(row.info || ''),
      productionDate: String(row.production_date || ''), expiryDate: String(row.expiry_date || ''),
      sourceArrivalDate: String(row.source_arrival_date || ''), createdAt: String(row.created_at || '')
    });
  });
  codes.forEach(function (code) {
    const snapshots = calculateFifoSnapshots_(historyByCode[code] || []), dates = Object.keys(snapshots).sort();
    result[code] = dates.length ? snapshots[dates[dates.length - 1]].filter(function (lot) { return Number(lot.qty || 0) > 0.0000001; }) : [];
  });
  return result;
}

function readStockExpiryAlerts_(outlet, location) {
  const sql = latestStockMovementCte_() + ' SELECT record_id, COALESCE(NULLIF(logical_id, \'\'), record_id) AS logical_id, ' +
    'item_code, item_name, event_date, direction, qty, movement_type, info, production_date, expiry_date, source_arrival_date, created_at ' +
    'FROM latest WHERE outlet = @outlet AND location = @location ORDER BY event_date, created_at';
  const grouped = {};
  runNamedQuery_(sql, { outlet: outlet, location: location }, { useQueryCache: false }).forEach(function (row) {
    const code = String(row.item_code || '').trim().toUpperCase();
    const name = String(row.item_name || '').trim();
    const key = code || 'NAME|' + name.toLowerCase();
    if (!key || key === 'NAME|') return;
    if (!grouped[key]) grouped[key] = { code: code, name: name, history: [] };
    grouped[key].history.push({
      recordId: String(row.record_id || ''), logicalId: String(row.logical_id || row.record_id || ''),
      date: String(row.event_date || ''), direction: String(row.direction || ''), qty: Number(row.qty || 0),
      movementType: String(row.movement_type || ''), info: String(row.info || ''),
      productionDate: String(row.production_date || ''), expiryDate: String(row.expiry_date || ''),
      sourceArrivalDate: String(row.source_arrival_date || ''), createdAt: String(row.created_at || '')
    });
  });
  const masterByCode = {}, masterByName = {}, excludedCategories = readStockNoExpiryCategoryMap_();
  (isShowcaseLocation_(location) ? readShowcaseItems_() : readStockMaster_(true)).forEach(function (item) {
    masterByCode[String(item.code || '').toUpperCase()] = item;
    masterByName[String(item.name || '').trim().toLowerCase()] = item;
  });
  const today = todayIso_(), limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + 30);
  const nearLimit = Utilities.formatDate(limitDate, 'Asia/Jakarta', 'yyyy-MM-dd');
  const missingExpiry = [], nearExpiry = [];
  Object.keys(grouped).forEach(function (key) {
    const entry = grouped[key], snapshots = calculateFifoSnapshots_(entry.history), dates = Object.keys(snapshots).sort();
    const masterItem = masterByCode[entry.code] || masterByName[entry.name.toLowerCase()] || {};
    if (!masterItem.code || masterItem.active === false) return;
    if (excludedCategories[normalizeStockCategory_(masterItem.category)]) return;
    const lots = dates.length ? snapshots[dates[dates.length - 1]].filter(function (lot) { return Number(lot.qty || 0) > 0.0000001; }) : [];
    if (!lots.length) return;
    const missingQty = lots.reduce(function (sum, lot) { return sum + (!String(lot.expiryDate || '').slice(0, 10) ? Number(lot.qty || 0) : 0); }, 0);
    const upcomingDates = lots.map(function (lot) { return String(lot.expiryDate || '').slice(0, 10); })
      .filter(function (date) { return date && date >= today && date <= nearLimit; }).sort();
    if (missingQty > 0.0000001) missingExpiry.push({ code: entry.code, name: entry.name, unit: String(masterItem.unit || ''), qty: missingQty });
    if (upcomingDates.length) nearExpiry.push({ code: entry.code, name: entry.name, unit: String(masterItem.unit || ''), expiryDate: upcomingDates[0] });
  });
  missingExpiry.sort(function (a, b) { return a.name.localeCompare(b.name); });
  nearExpiry.sort(function (a, b) { return a.expiryDate.localeCompare(b.expiryDate) || a.name.localeCompare(b.name); });
  return { missingExpiry: missingExpiry, nearExpiry: nearExpiry, nearExpiryDays: 30 };
}

function saveShowcaseInboundMovement_(outlet, showcaseItem, menuQty, payload, employee) {
  const product = findStockMasterItem_(showcaseItem.productName);
  const fromUnit = normalizeUnit_(showcaseItem.productUnit);
  const toUnit = normalizeUnit_(product.unit);
  const factor = resolveUnitConversionFactor_(product.code, fromUnit, toUnit, {}, readStockUnitConversions_());
  if (!factor) {
    throw new Error(showcaseItem.name + ': unit Product pada ' + CONFIG.SHOWCASE_SHEET + ' (' + showcaseItem.productUnit +
      ') berbeda dari unit Master Stock ' + product.code + ' (' + product.unit + '). Tambahkan konversi unit terlebih dahulu.');
  }
  const productQty = Math.round(Number(menuQty) * Number(showcaseItem.productQty) * factor * 1000000) / 1000000;
  if (!isFinite(productQty) || productQty <= 0) throw new Error('QTY Product Showcase tidak valid pada baris ' + showcaseItem.sourceRow + '.');
  const eventDate = normalizeDate_(payload.eventDate, true);
  const productionDate = normalizeDate_(payload.productionDate, false);
  const note = cleanText_(payload.info, 220);
  const transferId = Utilities.getUuid();
  const now = new Date();
  const lock = acquireStockWriteLock_();
  try {
    const showcaseCurrent = getCurrentStock_(outlet, 'Showcase', showcaseItem.code, showcaseItem.name).qty;
    const detail = showcaseItem.name + ' ' + formatQty_(menuQty) + ' PCS · Product ' + product.name + ' ' + formatQty_(productQty) + ' ' + product.unit;
    const rows = [], showcaseRows = [];
    const productPerMenu = Number(showcaseItem.productQty) * factor;
    const allocatedLots = allocateTransferLots_(outlet, 'Store', product, productQty);
    let assignedMenuQty = 0;
    allocatedLots.forEach(function (lot, lotIndex) {
      rows.push(stockTransferMovementRow_(transferId, outlet, 'Store', product, 'OUT', lot.qty, 'Transfer Out',
        'Transfer To Showcase · Dari Store · Keluar utk Produk: ' + showcaseItem.name + ' · ' + detail + (note ? ' · ' + note : ''), lot.expiryDate, employee, now, eventDate, lot.productionDate));
      const isLast = lotIndex === allocatedLots.length - 1;
      const remainingMenuQty = Math.max(0, Number(menuQty) - assignedMenuQty);
      const menuLotQty = isLast
        ? Math.round(remainingMenuQty * 1000000) / 1000000
        : Math.min(remainingMenuQty, Math.round((Number(lot.qty) / productPerMenu) * 1000000) / 1000000);
      assignedMenuQty += menuLotQty;
      if (menuLotQty <= 0.0000001) return;
      const showcaseRow = stockTransferMovementRow_(transferId, outlet, 'Showcase', showcaseItem, 'IN', menuLotQty, 'Transfer In',
        'Transfer From Store · Ke Showcase · ' + product.name + ' ' + formatQty_(lot.qty) + ' ' + product.unit + (note ? ' · ' + note : ''),
        lot.expiryDate, employee, now, eventDate, productionDate || lot.productionDate);
      showcaseRow.json.source_arrival_date = lot.sourceDate || null;
      showcaseRows.push(showcaseRow);
      rows.push(showcaseRow);
    });
    insertStockCardRows_(rows);
    const movements = showcaseRows.map(function (showcaseRow) {
      return {
        recordId: showcaseRow.json.record_id, logicalId: showcaseRow.json.logical_id, version: 1, date: eventDate,
        direction: 'IN', qty: Number(showcaseRow.json.qty), movementType: 'Transfer In', info: showcaseRow.json.info,
        productionDate: String(showcaseRow.json.production_date || ''), expiryDate: String(showcaseRow.json.expiry_date || ''), sourceArrivalDate: String(showcaseRow.json.source_arrival_date || ''),
        createdBy: employee.nik, createdByUser: employee.name + ' · ' + employee.nik,
        createdAt: now.toISOString(), transferId: transferId, systemGenerated: true
      };
    });
    return {
      saved: true, transferred: true, outlet: outlet, location: 'Showcase', sourceLocation: 'Store',
      itemCode: showcaseItem.code, itemName: showcaseItem.name, currentQty: showcaseCurrent + Number(menuQty),
      sourceItemCode: product.code, sourceItemName: product.name, sourceQty: productQty,
      movement: movements[0] || null, movements: movements
    };
  } finally {
    lock.releaseLock();
  }
}

function stockBalanceStateKey_(kind, outlet, location) {
  const scope = String(outlet || '').trim().toUpperCase() + '|' + normalizeLocation_(location).toLowerCase();
  return 'stock-balance-' + kind + '-' + digest_(scope).slice(0, 24);
}

function markStockBalanceDirty_(rows) {
  const properties = PropertiesService.getScriptProperties();
  const updates = {};
  const timestamp = String(Date.now()) + '-' + Utilities.getUuid().slice(0, 8);
  (rows || []).forEach(function (entry) {
    const row = entry && entry.json ? entry.json : entry;
    if (!row || row.record_type !== 'MOVEMENT' || !row.outlet || !row.location) return;
    updates[stockBalanceStateKey_('dirty', row.outlet, row.location)] = JSON.stringify({ token: timestamp, outlet: row.outlet, location: row.location });
  });
  if (Object.keys(updates).length) properties.setProperties(updates, false);
}

function stockUploadTypeForMovement_(movementType) {
  const type = String(movementType || '');
  return type === 'Goods Receipt' ? 'goodsReceipt' : type === 'Terjual' ? 'salesUsage' : type === 'Transfer Out Antar Outlet' ? 'goodsDelivery' : '';
}

function stockUploadSummaryDirtyKey_(outlet, eventDate, uploadType) {
  return 'stock-upload-summary-dirty-' + digest_([String(outlet || '').toUpperCase(), eventDate, uploadType].join('|')).slice(0, 24);
}

function markStockUploadSummaryDirty_(rows) {
  const properties = PropertiesService.getScriptProperties(), updates = {}, token = String(Date.now()) + '-' + Utilities.getUuid().slice(0, 8);
  (rows || []).forEach(function (entry) {
    const row = entry && entry.json ? entry.json : entry;
    const uploadType = row && stockUploadTypeForMovement_(row.movement_type), eventDate = String(row && row.event_date || '').slice(0, 10);
    if (!uploadType || !row.outlet || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return;
    if (row.record_type === 'MOVEMENT' && !row.source_file) return;
    const key = stockUploadSummaryDirtyKey_(row.outlet, eventDate, uploadType);
    updates[key] = JSON.stringify({ token: token, outlet: String(row.outlet).toUpperCase(), eventDate: eventDate, uploadType: uploadType, movementType: row.movement_type });
  });
  if (Object.keys(updates).length) properties.setProperties(updates, false);
}

function insertStockCardRows_(rows) {
  markStockBalanceDirty_(rows);
  markStockUploadSummaryDirty_(rows);
  insertAll_(stockCardTableId_(), rows);
  mirrorStockCardRows_(rows);
  // Refresh the marker after a successful insert so a concurrent rebuild cannot clear it too early.
  markStockBalanceDirty_(rows);
  markStockUploadSummaryDirty_(rows);
  invalidateStockItemCachesForRows_(rows);
  invalidateFastStockHistoryRows_(rows);
}

function stockCardMirrorTableId_() {
  const configured = String(PropertiesService.getScriptProperties().getProperty('STOCK_CARD_MIRROR_TABLE_ID') || '').trim();
  return /^[A-Za-z0-9_]+$/.test(configured) ? configured : '';
}

function mirrorStockCardRows_(rows) {
  const mirrorTableId = stockCardMirrorTableId_();
  if (!mirrorTableId || mirrorTableId === stockCardTableId_()) return;
  try {
    insertAll_(mirrorTableId, rows);
    PropertiesService.getScriptProperties().deleteProperty('STOCK_CARD_MIRROR_LAST_ERROR');
  } catch (error) {
    // The primary write has succeeded. Keep the app available and make the migration gap auditable/recoverable.
    PropertiesService.getScriptProperties().setProperty('STOCK_CARD_MIRROR_LAST_ERROR', JSON.stringify({
      at: new Date().toISOString(), tableId: mirrorTableId,
      message: String(error && error.message ? error.message : error)
    }));
    console.error('Mirror stock card gagal; jalankan syncStockCardV2Migration: ' + error.message);
  }
}

function rebuildStockUploadDailySummary_(state, expectedRaw) {
  const summary = '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_upload_daily_summary`';
  const sql = 'BEGIN TRANSACTION; DELETE FROM ' + summary + ' WHERE outlet = @outlet AND event_date = CAST(@eventDate AS DATE) AND upload_type = @uploadType; ' +
    'INSERT INTO ' + summary + ' (event_date, outlet, upload_type, actual_item_count, marker_count, last_upload, last_user, updated_at) ' +
    'SELECT CAST(@eventDate AS DATE), @outlet, @uploadType, ' +
    'COUNTIF(record_type = \'MOVEMENT\' AND item_code IS NOT NULL AND item_code != \'\' AND source_file IS NOT NULL AND source_file != \'\'), ' +
    'COUNTIF(record_type = \'IMPORT\'), MAX(created_at), ARRAY_AGG(created_by IGNORE NULLS ORDER BY created_at DESC LIMIT 1)[SAFE_OFFSET(0)], CURRENT_TIMESTAMP() ' +
    'FROM ' + stockCardTable_() + ' WHERE outlet = @outlet AND event_date = CAST(@eventDate AS DATE) AND movement_type = @movementType; COMMIT TRANSACTION;';
  runNamedQuery_(sql, {
    outlet: state.outlet, eventDate: state.eventDate,
    uploadType: state.uploadType, movementType: state.movementType
  }, { useQueryCache: false });
  const properties = PropertiesService.getScriptProperties(), key = stockUploadSummaryDirtyKey_(state.outlet, state.eventDate, state.uploadType);
  if (String(properties.getProperty(key) || '') === String(expectedRaw || '')) properties.deleteProperty(key);
  removeScriptCacheKeys_(['stock-upload-monitor-v1-' + state.eventDate.slice(0, 7)]);
}

/** Run once after deployment, then only the small dirty slices are refreshed. */
function backfillStockUploadDailySummary() {
  ensureStockCardInfrastructure_();
  const summary = '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_upload_daily_summary`';
  const sql = 'TRUNCATE TABLE ' + summary + '; INSERT INTO ' + summary +
    ' (event_date, outlet, upload_type, actual_item_count, marker_count, last_upload, last_user, updated_at) ' +
    'SELECT event_date, outlet, CASE movement_type WHEN \'Goods Receipt\' THEN \'goodsReceipt\' WHEN \'Terjual\' THEN \'salesUsage\' ELSE \'goodsDelivery\' END, ' +
    'COUNTIF(record_type = \'MOVEMENT\' AND item_code IS NOT NULL AND item_code != \'\' AND source_file IS NOT NULL AND source_file != \'\'), ' +
    'COUNTIF(record_type = \'IMPORT\'), MAX(created_at), ARRAY_AGG(created_by IGNORE NULLS ORDER BY created_at DESC LIMIT 1)[SAFE_OFFSET(0)], CURRENT_TIMESTAMP() ' +
    'FROM ' + stockCardTable_() + ' WHERE movement_type IN (\'Goods Receipt\', \'Terjual\', \'Transfer Out Antar Outlet\') GROUP BY event_date, outlet, movement_type';
  runNamedQuery_(sql, {}, { useQueryCache: false });
  removeScriptCacheKeys_(['stock-upload-monitor-v1-' + todayIso_().slice(0, 7)]);
  return { completed: true, table: 'stock_upload_daily_summary', sourceTable: stockCardTableId_() };
}

/** Run once after deployment so the first Stock Card view can use compact balances immediately. */
function backfillStockBalanceSummaries() {
  ensureStockCardInfrastructure_();
  const table = '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_balances`';
  const sql = 'TRUNCATE TABLE ' + table + '; INSERT INTO ' + table +
    ' (outlet, location, item_code, item_name, current_qty, updated_at) ' + latestStockMovementCte_() +
    ' SELECT outlet, location, item_code, item_name, SUM(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END), CURRENT_TIMESTAMP() ' +
    'FROM latest GROUP BY outlet, location, item_code, item_name; SELECT DISTINCT outlet, location FROM ' + table;
  const scopes = runNamedQuery_(sql, {}, { useQueryCache: false });
  const properties = PropertiesService.getScriptProperties(), all = properties.getProperties(), cacheKeys = [];
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('stock-balance-ready-') === 0 || key.indexOf('stock-balance-dirty-') === 0) properties.deleteProperty(key);
  });
  scopes.forEach(function (scope) {
    properties.setProperty(stockBalanceStateKey_('ready', scope.outlet, scope.location), '1');
    cacheKeys.push(stockItemsCacheKey_(scope.outlet, scope.location));
  });
  removeScriptCacheKeys_(cacheKeys);
  return { completed: true, scopeCount: scopes.length, table: 'stock_balances', sourceTable: stockCardTableId_() };
}

function readStockLedgerBalanceRows_(outlet, location) {
  const sql = latestStockMovementCte_() + ' SELECT item_code, item_name, SUM(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END) AS current_qty ' +
    'FROM latest WHERE outlet = @outlet AND location = @location GROUP BY item_code, item_name';
  return runNamedQuery_(sql, { outlet: outlet, location: location }, { useQueryCache: false });
}

function rebuildStockBalanceSummary_(outlet, location, expectedDirtyToken) {
  const table = '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_balances`';
  const sql = 'BEGIN TRANSACTION; ' +
    'DELETE FROM ' + table + ' WHERE outlet = @outlet AND location = @location; ' +
    'INSERT INTO ' + table + ' (outlet, location, item_code, item_name, current_qty, updated_at) ' +
    latestStockMovementCte_() + ' SELECT @outlet, @location, item_code, item_name, ' +
    'SUM(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END), CURRENT_TIMESTAMP() ' +
    'FROM latest WHERE outlet = @outlet AND location = @location GROUP BY item_code, item_name; ' +
    'COMMIT TRANSACTION;';
  runNamedQuery_(sql, { outlet: outlet, location: location }, { useQueryCache: false });

  const properties = PropertiesService.getScriptProperties();
  const readyKey = stockBalanceStateKey_('ready', outlet, location);
  const dirtyKey = stockBalanceStateKey_('dirty', outlet, location);
  properties.setProperty(readyKey, '1');
  if (String(properties.getProperty(dirtyKey) || '') === String(expectedDirtyToken || '')) {
    properties.deleteProperty(dirtyKey);
  }
  removeScriptCacheKeys_([stockItemsCacheKey_(outlet, location)]);
}

function readStockBalanceRows_(outlet, location) {
  const properties = PropertiesService.getScriptProperties();
  const readyKey = stockBalanceStateKey_('ready', outlet, location);
  const ready = properties.getProperty(readyKey) === '1';
  try {
    // The item list must never wait for a complete ledger scan. Serve the compact
    // balance summary immediately; a one-minute trigger refreshes dirty scopes.
    const sql = 'SELECT item_code, item_name, current_qty FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_balances` ' +
      'WHERE outlet = @outlet AND location = @location';
    const summaryRows = runNamedQuery_(sql, { outlet: outlet, location: location });
    if (ready || summaryRows.length) return summaryRows;
    return readStockLedgerBalanceRows_(outlet, location);
  } catch (error) {
    console.error('Ringkasan stok gagal digunakan; membaca stock_card sebagai cadangan. ' + error.message);
    return readStockLedgerBalanceRows_(outlet, location);
  }
}

/** Refreshes compact balances in the background; install it every one minute. */
function refreshDirtyStockBalances() {
  const properties = PropertiesService.getScriptProperties();
  const all = properties.getProperties();
  Object.keys(all).filter(function (key) { return key.indexOf('stock-balance-dirty-') === 0; }).slice(0, 8).forEach(function (key) {
    try {
      const raw = String(all[key] || '');
      const state = raw.charAt(0) === '{' ? JSON.parse(raw) : null;
      if (!state || !state.outlet || !state.location) return;
      rebuildStockBalanceSummary_(state.outlet, state.location, raw);
    } catch (error) {
      console.error('Gagal memperbarui ringkasan saldo: ' + error.message);
    }
  });
  const refreshed = PropertiesService.getScriptProperties().getProperties();
  Object.keys(refreshed).filter(function (key) { return key.indexOf('stock-upload-summary-dirty-') === 0; }).slice(0, 12).forEach(function (key) {
    try {
      const raw = String(refreshed[key] || ''), state = raw.charAt(0) === '{' ? JSON.parse(raw) : null;
      if (!state || !state.outlet || !state.eventDate || !state.uploadType || !state.movementType) return;
      rebuildStockUploadDailySummary_(state, raw);
    } catch (error) {
      console.error('Gagal memperbarui ringkasan monitoring upload: ' + error.message);
    }
  });
  try { processMissingExpiryUploadJobs(); }
  catch (expiryError) { console.error('Gagal menjalankan antrean Expired Date: ' + expiryError.message); }
}

function ensureStockMaintenanceTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'refreshDirtyStockBalances';
  });
  if (!exists) ScriptApp.newTrigger('refreshDirtyStockBalances').timeBased().everyMinutes(1).create();
}

/** Run once manually after deployment to install the background balance refresh. */
function installStockMaintenanceTrigger() {
  ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === 'refreshDirtyStockBalances';
  }).forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  ensureStockMaintenanceTrigger_();
  return { installed: true, handler: 'refreshDirtyStockBalances', intervalMinutes: 1 };
}

/** Run once after deploying delivery_date to preserve the original date on older pending transfers. */
function backfillStockTransferDeliveryDates() {
  ensureStockCardInfrastructure_();
  const transfers = '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_transfers`';
  const card = stockCardTable_();
  const sql = 'UPDATE ' + transfers + ' AS target SET delivery_date = source.delivery_date FROM (' +
    'SELECT transfer_id, MIN(event_date) AS delivery_date FROM ' + card + ' ' +
    'WHERE transfer_id IS NOT NULL AND transfer_id != \'\' AND direction = \'OUT\' ' +
    'AND movement_type IN (\'Transfer Out\', \'Transfer Out Antar Outlet\') GROUP BY transfer_id' +
    ') AS source WHERE target.transfer_id = source.transfer_id AND target.delivery_date IS NULL';
  runNamedQuery_(sql, {}, { useQueryCache: false });
  return { completed: true, field: 'stock_transfers.delivery_date' };
}

function stockCardMigrationTable_() {
  return '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card_v2`';
}

function ensureStockCardV2Table_() {
  let existing = null;
  try {
    existing = BigQuery.Tables.get(CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID, 'stock_card_v2');
  } catch (error) {
    if (!/not found|Not found|404/.test(String(error))) throw error;
  }
  if (!existing) {
    const source = BigQuery.Tables.get(CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID, 'stock_card');
    BigQuery.Tables.insert({
      tableReference: {
        projectId: CONFIG.BQ_PROJECT_ID,
        datasetId: CONFIG.BQ_DATASET_ID,
        tableId: 'stock_card_v2'
      },
      schema: JSON.parse(JSON.stringify(source.schema)),
      timePartitioning: { type: 'DAY', field: 'event_date' },
      clustering: { fields: ['outlet', 'location', 'item_code', 'record_type'] },
      description: 'Stock card partitioned by event_date. Created by safe v2 migration.'
    }, CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID);
    existing = BigQuery.Tables.get(CONFIG.BQ_PROJECT_ID, CONFIG.BQ_DATASET_ID, 'stock_card_v2');
  }
  const partitionField = existing.timePartitioning && existing.timePartitioning.field;
  if (partitionField !== 'event_date') {
    throw new Error('stock_card_v2 sudah ada tetapi bukan dipartisi berdasarkan event_date. Hapus/ubah nama tabel v2 yang salah terlebih dahulu; stock_card lama tidak disentuh.');
  }
  return existing;
}

function syncStockCardV2Migration() {
  ensureStockCardInfrastructure_();
  ensureStockCardV2Table_();
  const source = '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card`';
  const target = stockCardMigrationTable_();
  const sql = 'MERGE ' + target + ' AS target USING ' + source + ' AS source ON target.record_id = source.record_id ' +
    'WHEN NOT MATCHED THEN INSERT ROW';
  runNamedQuery_(sql, {}, { useQueryCache: false });
  PropertiesService.getScriptProperties().deleteProperty('STOCK_CARD_MIRROR_LAST_ERROR');
  return auditStockCardV2Migration();
}

function stockCardMigrationStats_(tableId) {
  const table = '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.' + tableId + '`';
  const rows = runNamedQuery_(
    'SELECT COUNT(*) AS row_count, COUNT(DISTINCT record_id) AS record_count, ' +
    'COALESCE(SUM(qty), 0) AS qty_total, CAST(MIN(event_date) AS STRING) AS min_date, ' +
    'CAST(MAX(event_date) AS STRING) AS max_date FROM ' + table,
    {}, { useQueryCache: false }
  );
  const row = rows[0] || {};
  return {
    tableId: tableId,
    rowCount: Number(row.row_count || 0),
    recordCount: Number(row.record_count || 0),
    qtyTotal: Number(row.qty_total || 0),
    minDate: String(row.min_date || ''),
    maxDate: String(row.max_date || '')
  };
}

function auditStockCardV2Migration() {
  ensureStockCardV2Table_();
  const oldStats = stockCardMigrationStats_('stock_card');
  const newStats = stockCardMigrationStats_('stock_card_v2');
  const matched = oldStats.rowCount === newStats.rowCount &&
    oldStats.recordCount === newStats.recordCount &&
    Math.abs(oldStats.qtyTotal - newStats.qtyTotal) < 0.000001 &&
    oldStats.minDate === newStats.minDate && oldStats.maxDate === newStats.maxDate;
  return {
    matched: matched,
    safeToActivate: matched,
    activeTable: stockCardTableId_(),
    mirrorTable: stockCardMirrorTableId_(),
    oldTable: oldStats,
    newTable: newStats,
    mirrorLastError: PropertiesService.getScriptProperties().getProperty('STOCK_CARD_MIRROR_LAST_ERROR') || ''
  };
}

/** Step 1: create v2, enable dual-write, copy all existing rows, and return the audit result. */
function prepareStockCardV2Migration() {
  ensureStockCardInfrastructure_();
  if (stockCardTableId_() === 'stock_card_v2') {
    throw new Error('stock_card_v2 sudah aktif. Gunakan auditStockCardV2Migration untuk pemeriksaan atau rollbackStockCardV2Migration untuk kembali.');
  }
  ensureStockCardV2Table_();
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('STOCK_CARD_TABLE_ID', 'stock_card');
  properties.setProperty('STOCK_CARD_MIRROR_TABLE_ID', 'stock_card_v2');
  properties.setProperty('STOCK_CARD_MIGRATION_PREPARED_AT', new Date().toISOString());
  CacheService.getScriptCache().remove('stock-card-infrastructure-v16');
  return syncStockCardV2Migration();
}

/** Step 2: sync once more and switch reads/writes only when every audit total matches. */
function activateStockCardV2AfterAudit() {
  const audit = syncStockCardV2Migration();
  if (!audit.safeToActivate) {
    throw new Error('Migrasi belum cocok. stock_card tetap aktif. Periksa hasil audit lalu jalankan syncStockCardV2Migration lagi.');
  }
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('STOCK_CARD_TABLE_ID', 'stock_card_v2');
  properties.setProperty('STOCK_CARD_MIRROR_TABLE_ID', 'stock_card');
  properties.setProperty('STOCK_CARD_MIGRATION_ACTIVATED_AT', new Date().toISOString());
  properties.deleteProperty('STOCK_CARD_MIRROR_LAST_ERROR');
  CacheService.getScriptCache().remove('stock-card-infrastructure-v16');
  return { activated: true, activeTable: 'stock_card_v2', rollbackMirror: 'stock_card', audit: audit };
}

/** Emergency rollback: old table becomes active immediately; v2 remains mirrored and no table is deleted. */
function rollbackStockCardV2Migration() {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('STOCK_CARD_TABLE_ID', 'stock_card');
  properties.setProperty('STOCK_CARD_MIRROR_TABLE_ID', 'stock_card_v2');
  properties.setProperty('STOCK_CARD_MIGRATION_ROLLED_BACK_AT', new Date().toISOString());
  CacheService.getScriptCache().remove('stock-card-infrastructure-v16');
  return { rolledBack: true, activeTable: 'stock_card', mirrorTable: 'stock_card_v2' };
}

/** Optional final step after the agreed observation period. Both tables remain in BigQuery. */
function finishStockCardV2Migration() {
  if (stockCardTableId_() !== 'stock_card_v2') throw new Error('stock_card_v2 belum aktif; finalisasi dibatalkan.');
  const audit = auditStockCardV2Migration();
  if (!audit.matched) throw new Error('Audit tabel lama dan v2 tidak cocok; finalisasi dibatalkan.');
  PropertiesService.getScriptProperties().deleteProperty('STOCK_CARD_MIRROR_TABLE_ID');
  PropertiesService.getScriptProperties().setProperty('STOCK_CARD_MIGRATION_FINISHED_AT', new Date().toISOString());
  return { finished: true, activeTable: 'stock_card_v2', oldTablePreserved: true };
}

function ensureStockVisibilitySheet_() {
  return ensureSheet_(CONFIG.STOCK_VISIBILITY_SHEET,
    ['OUTLET', 'LOCATION', 'ITEM_CODE', 'HIDDEN', 'UPDATED_BY', 'UPDATED_AT']);
}

function readStockHiddenMap_(outlet, location) {
  const sheet = ensureStockVisibilitySheet_();
  const map = {};
  if (sheet.getLastRow() < 2) return map;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getDisplayValues();
  rows.forEach(function (row) {
    if (String(row[0] || '').trim().toUpperCase() !== String(outlet || '').trim().toUpperCase()) return;
    if (normalizeLocation_(row[1]).toLowerCase() !== normalizeLocation_(location).toLowerCase()) return;
    const code = String(row[2] || '').trim().toUpperCase();
    if (code) map[code] = truthy_(row[3]);
  });
  return map;
}

function readCurrentStockCodeQtyMap_(outlet, location) {
  const sql = latestStockMovementCte_() + ' SELECT item_code, SUM(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END) AS current_qty ' +
    'FROM latest WHERE outlet = @outlet AND location = @location AND item_code IS NOT NULL AND item_code != \'\' GROUP BY item_code';
  const map = {};
  runNamedQuery_(sql, { outlet: outlet, location: location }, { useQueryCache: false }).forEach(function (row) {
    map[String(row.item_code || '').trim().toUpperCase()] = Number(row.current_qty || 0);
  });
  return map;
}

function getCurrentStock_(outlet, location, itemCode, itemName) {
  const itemCondition = isShowcaseLocation_(location)
    ? 'item_name = @item'
    : '((item_code = @code) OR ((item_code IS NULL OR item_code = \'\') AND item_name = @item))';
  const sql = latestStockMovementCte_() + ' SELECT COUNT(*) AS movement_count, COALESCE(SUM(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END), 0) AS current_qty ' +
    'FROM latest WHERE outlet = @outlet AND location = @location ' +
    'AND ' + itemCondition;
  const rows = runNamedQuery_(sql, { outlet: outlet, location: location, code: itemCode, item: itemName }, { useQueryCache: false });
  return { count: rows.length ? Number(rows[0].movement_count || 0) : 0, qty: rows.length ? Number(rows[0].current_qty || 0) : 0 };
}

function enrichShowcaseHistoryLots_(history, outlet, showcaseItem) {
  const needsEnrichment = history.some(function (row) {
    return row.direction === 'IN' && row.transferId && !row.sourceArrivalDate;
  });
  if (!needsEnrichment) return history;
  let product;
  try { product = findStockMasterItem_(showcaseItem.productName); } catch (error) { return history; }
  const fromUnit = normalizeUnit_(showcaseItem.productUnit);
  const toUnit = normalizeUnit_(product.unit);
  const factor = resolveUnitConversionFactor_(product.code, fromUnit, toUnit, {}, readStockUnitConversions_());
  const productPerMenu = Number(showcaseItem.productQty) * factor;
  if (!isFinite(productPerMenu) || productPerMenu <= 0) return history;
  const storeHistory = readLatestStockHistory_(outlet, 'Store', product);
  calculateFifoSnapshots_(storeHistory);
  const lotsByTransfer = {};
  storeHistory.forEach(function (row) {
    if (row.direction !== 'OUT' || !row.transferId) return;
    const lots = row.fifoUsageLots && row.fifoUsageLots.length ? row.fifoUsageLots : [{
      qty: row.qty, expiryDate: row.expiryDate || '', sourceDate: ''
    }];
    if (!lotsByTransfer[row.transferId]) lotsByTransfer[row.transferId] = [];
    lots.forEach(function (lot) { lotsByTransfer[row.transferId].push(lot); });
  });
  const enriched = [];
  history.forEach(function (row) {
    const productLots = row.direction === 'IN' && row.transferId && !row.sourceArrivalDate ? lotsByTransfer[row.transferId] : null;
    if (!productLots || !productLots.length) {
      enriched.push(row);
      return;
    }
    let assignedMenuQty = 0;
    productLots.forEach(function (lot, index) {
      const remainingMenuQty = Math.max(0, Number(row.qty) - assignedMenuQty);
      const isLast = index === productLots.length - 1;
      const menuLotQty = isLast
        ? Math.round(remainingMenuQty * 1000000) / 1000000
        : Math.min(remainingMenuQty, Math.round((Number(lot.qty) / productPerMenu) * 1000000) / 1000000);
      assignedMenuQty += menuLotQty;
      if (menuLotQty <= 0.0000001) return;
      const clone = Object.assign({}, row);
      clone.recordId = row.recordId + '-lot-' + (index + 1);
      clone.logicalId = row.logicalId + '-lot-' + (index + 1);
      clone.qty = menuLotQty;
      clone.expiryDate = String(lot.expiryDate || row.expiryDate || '');
      clone.sourceArrivalDate = String(lot.sourceDate || '');
      enriched.push(clone);
    });
  });
  return enriched;
}

function latestStockMovementCte_() {
  return 'WITH latest AS (SELECT * FROM ' + stockCardTable_() + ' ' +
    'WHERE record_type = \'MOVEMENT\' QUALIFY ROW_NUMBER() OVER (' +
    'PARTITION BY COALESCE(NULLIF(logical_id, \'\'), record_id) ORDER BY COALESCE(version, 1) DESC, created_at DESC) = 1)';
}

function readLatestStockHistory_(outlet, location, item, onlyLogicalId) {
  const itemCondition = isShowcaseLocation_(location)
    ? 'item_name = @item'
    : '((item_code = @code) OR ((item_code IS NULL OR item_code = \'\') AND item_name = @item))';
  let sql = latestStockMovementCte_() + ' SELECT record_id, COALESCE(NULLIF(logical_id, \'\'), record_id) AS logical_id, COALESCE(version, 1) AS version, ' +
    'event_date, direction, qty, movement_type, info, production_date, expiry_date, source_arrival_date, transfer_id, supplier, source_file, source_row, created_by, created_at FROM latest ' +
    'WHERE outlet = @outlet AND location = @location AND ' + itemCondition + ' ';
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
      movementType: String(r.movement_type || ''), info: String(r.info || ''), productionDate: String(r.production_date || ''), expiryDate: String(r.expiry_date || ''),
      sourceArrivalDate: String(r.source_arrival_date || ''), supplier: String(r.supplier || ''),
      sourceFile: String(r.source_file || ''), sourceRow: Number(r.source_row || 0),
      transferId: String(r.transfer_id || ''), systemGenerated: Boolean(r.transfer_id),
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
    if (movement.direction !== 'IN' && movement.direction !== 'OUT') return;
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
    const createdCompare = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    if (createdCompare) return createdCompare;
    const directionCompare = (a.direction === 'IN' ? 0 : 1) - (b.direction === 'IN' ? 0 : 1);
    if (directionCompare) return directionCompare;
    return String(a.logicalId || a.recordId || a.transferId || '').localeCompare(String(b.logicalId || b.recordId || b.transferId || ''));
  });
  const lots = [], uncoveredQueue = [], snapshots = {};
  function sortLots() {
    lots.sort(function (a, b) {
      return String(a.expiryDate || '9999-12-31').localeCompare(String(b.expiryDate || '9999-12-31')) ||
        String(a.sourceDate || '').localeCompare(String(b.sourceDate || '')) ||
        String(a.showcaseDate || '').localeCompare(String(b.showcaseDate || ''));
    });
  }
  movements.forEach(function (movement) {
    const qty = Number(movement.qty || 0);
    movement.fifoUsageLots = [];
    movement.fifoUncovered = 0;
    if (movement.direction === 'LOT' && movement.movementType === 'Lot Balance Override') {
      let override = null;
      try { override = JSON.parse(String(movement.info || '')); } catch (error) { override = null; }
      if (override && Array.isArray(override.lots)) {
        lots.length = 0;
        uncoveredQueue.length = 0;
        override.lots.forEach(function (lot) {
          const lotQty = Number(lot.qty || 0);
          if (lotQty > 0.0000001) lots.push({ qty: lotQty, productionDate: '', expiryDate: String(lot.expiryDate || ''), sourceDate: String(lot.arrivalDate || ''), showcaseDate: String(lot.stockInDate || '') });
        });
        sortLots();
      }
    } else if (movement.direction === 'IN') {
      const incomingLot = {
        productionDate: String(movement.productionDate || ''),
        expiryDate: String(movement.expiryDate || ''),
        sourceDate: String(movement.sourceArrivalDate || movement.date || ''),
        showcaseDate: String(movement.date || '')
      };
      let incomingRemaining = qty;
      while (incomingRemaining > 0.0000001 && uncoveredQueue.length) {
        const debt = uncoveredQueue[0], covered = Math.min(incomingRemaining, debt.qty);
        debt.movement.fifoUsageLots.push({
          qty: covered, productionDate: incomingLot.productionDate, expiryDate: incomingLot.expiryDate,
          sourceDate: incomingLot.sourceDate, showcaseDate: incomingLot.showcaseDate
        });
        debt.qty -= covered;
        debt.movement.fifoUncovered = Math.max(0, Number(debt.movement.fifoUncovered || 0) - covered);
        incomingRemaining -= covered;
        if (debt.qty <= 0.0000001) uncoveredQueue.shift();
      }
      if (incomingRemaining > 0.0000001) lots.push({
        qty: incomingRemaining,
        productionDate: incomingLot.productionDate,
        expiryDate: incomingLot.expiryDate,
        sourceDate: incomingLot.sourceDate,
        showcaseDate: incomingLot.showcaseDate
      });
      sortLots();
    } else if (movement.direction === 'OUT') {
      sortLots();
      let remaining = qty;
      for (let i = 0; i < lots.length && remaining > 0.0000001; i++) {
        if (lots[i].qty <= 0.0000001) continue;
        const taken = Math.min(lots[i].qty, remaining);
        lots[i].qty -= taken;
        remaining -= taken;
        if (taken > 0.0000001) {
          movement.fifoUsageLots.push({
            qty: taken,
            productionDate: lots[i].productionDate,
            expiryDate: lots[i].expiryDate,
            sourceDate: lots[i].sourceDate,
            showcaseDate: lots[i].showcaseDate
          });
        }
      }
      movement.fifoUncovered = Math.max(0, remaining);
      if (remaining > 0.0000001) uncoveredQueue.push({ movement: movement, qty: remaining });
      for (let i = lots.length - 1; i >= 0; i--) {
        if (lots[i].qty <= 0.0000001) lots.splice(i, 1);
      }
    }
    snapshots[String(movement.date || '')] = lots.filter(function (lot) { return lot.qty > 0.0000001; }).map(function (lot) {
      return { qty: lot.qty, productionDate: lot.productionDate, expiryDate: lot.expiryDate, sourceDate: lot.sourceDate, showcaseDate: lot.showcaseDate };
    });
  });
  return snapshots;
}

function incomingFefoWarning_(outlet, location, item, incomingExpiryDate) {
  const incoming = String(incomingExpiryDate || '').slice(0, 10);
  if (!incoming) return null;
  const history = readLatestStockHistory_(outlet, location, item);
  const snapshots = calculateFifoSnapshots_(history);
  const dates = Object.keys(snapshots).sort();
  const existingLots = dates.length ? snapshots[dates[dates.length - 1]] : [];
  const expiries = existingLots.map(function (lot) { return String(lot.expiryDate || '').slice(0, 10); }).filter(Boolean).sort();
  if (!expiries.length || incoming >= expiries[0]) return null;
  return { itemCode: item.code, itemName: item.name, incomingExpiryDate: incoming, existingExpiryDate: expiries[0] };
}

function reconcileFifoLots_(lots, balance) {
  const target = Math.max(0, Number(balance || 0));
  let reconciled = (lots || []).filter(function (lot) { return Number(lot.qty) > 0.0000001; }).map(function (lot) {
    return { qty: Number(lot.qty), productionDate: lot.productionDate || '', expiryDate: lot.expiryDate || '', sourceDate: lot.sourceDate || '', showcaseDate: lot.showcaseDate || '' };
  });
  if (target <= 0.0000001) return [];
  let total = reconciled.reduce(function (sum, lot) { return sum + lot.qty; }, 0);
  let excess = total - target;
  for (let i = 0; i < reconciled.length && excess > 0.0000001; i++) {
    const removed = Math.min(reconciled[i].qty, excess);
    reconciled[i].qty -= removed;
    excess -= removed;
  }
  reconciled = reconciled.filter(function (lot) { return lot.qty > 0.0000001; });
  total = reconciled.reduce(function (sum, lot) { return sum + lot.qty; }, 0);
  if (total < target - 0.0000001) reconciled.push({ qty: target - total, productionDate: '', expiryDate: '', sourceDate: '', showcaseDate: '' });
  return reconciled;
}

function fifoDetailText_(lots, unit, location) {
  if (!lots.length) return 'Stok habis';
  return lots.map(function (lot) {
    return formatQty_(lot.qty) + ' ' + (unit || '') +
      (lot.productionDate ? ' | Prd: ' + lot.productionDate : '') +
      ' | Stock In: ' + (lot.showcaseDate || lot.sourceDate || '-') +
      ' | Arrival: ' + (lot.sourceDate || '-') +
      ' | Exp: ' + (lot.expiryDate || '-');
  }).join('\n');
}

function rejectInterOutletStockTransfer(token, transferId, requestedOutlet, reason) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const allowed = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, allowed);
    transferId = cleanText_(transferId, 100);
    reason = cleanText_(reason, 500);
    if (!reason) throw new Error('Alasan penolakan wajib diisi untuk keperluan audit.');
    const lock = acquireStockWriteLock_();
    try {
      const matches = readPendingStockTransfers_(outlet).filter(function (transfer) { return transfer.transferId === transferId; });
      if (!matches.length) throw new Error('Transfer sudah diproses atau tidak ditemukan untuk outlet ini.');
      const transfer = matches[0], now = new Date(), eventDate = todayIso_(), stockRows = [];
      transfer.items.forEach(function (line) {
        const item = { code: line.code, category: line.category, name: line.name, unit: line.unit };
        stockRows.push(stockTransferMovementRow_(transferId, transfer.fromOutlet, transfer.fromLocation, item, 'IN', line.qty, 'Transfer In',
          'Transfer From ' + outlet + ' · Ke ' + transfer.fromOutlet + ' / ' + transfer.fromLocation + ' · No Transfer ' + stockTransferReceiptNumber_(transfer) +
          ' · Pengembalian karena ditolak · ' + reason, line.expiryDate, employee, now, eventDate, line.productionDate));
      });
      if (stockRows.length) insertStockCardRows_(stockRows);
      const eventId = Utilities.getUuid(), receiptNo = stockTransferReceiptNumber_(transfer);
      insertAll_('stock_transfers', [{ insertId: eventId, json: {
        event_id: eventId, transfer_id: transferId, status: 'REJECTED', from_outlet: transfer.fromOutlet, from_location: transfer.fromLocation,
        to_outlet: outlet, to_location: null, created_by: transfer.createdBy, created_by_name: transfer.createdByName,
        created_at: now.getTime() / 1000, rejected_by: employee.nik, rejected_by_name: employee.name,
        rejected_at: now.getTime() / 1000, rejection_reason: reason, receipt_no: receiptNo, delivery_date: transfer.deliveryDate || null
      }}]);
      transfer.status = 'REJECTED';
      transfer.rejectedBy = employee.nik;
      transfer.rejectedByName = employee.name;
      transfer.rejectedAt = now.toISOString();
      transfer.rejectionReason = reason;
      transfer.receiptNo = receiptNo;
      return { rejected: true, transferId: transferId, receipt: transfer };
    } finally { lock.releaseLock(); }
  });
}

function exportTransferReceipt(token, transferId, requestedOutlet) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const allowed = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, allowed);
    transferId = cleanText_(transferId, 100);
    const transfer = readStockTransfer_(transferId, outlet);
    if (!transfer) throw new Error('Data transfer tidak ditemukan.');
    transfer.photoDataUrls = readTransferPhotoData_(transferId);
    const blob = buildTransferReceiptPdf_(transfer);
    return { fileName: blob.getName(), mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
  });
}

function stockMovementInfo_(movements) {
  return movements.map(function (movement) {
    const labels = { Terjual: 'Sold', Waste: 'Waste', Pemakaian: 'Usage', 'Transfer Out': 'Stock Out', 'Transfer Out Antar Outlet': 'Stock Out', 'Stock Adjustment': 'Adjustment', Others: 'Other' };
    const title = movement.direction === 'IN' ? 'IN' : (labels[movement.movementType] || movement.movementType || 'OUT');
    let text = title + ': ' + formatQty_(movement.qty);
    const lots = movement.direction === 'IN' ? [{
      showcaseDate: movement.date, sourceDate: movement.sourceArrivalDate || movement.date, productionDate: movement.productionDate || '', expiryDate: movement.expiryDate || ''
    }] : (movement.fifoUsageLots || []);
    (lots.length ? lots : [{ showcaseDate: '', sourceDate: '', productionDate: '', expiryDate: '' }]).forEach(function (lot) {
      const stockIn = lot.showcaseDate || lot.sourceDate || '-', arrival = lot.sourceDate || '-';
      const sameDate = stockIn !== '-' && arrival !== '-' && String(stockIn).slice(0, 10) === String(arrival).slice(0, 10);
      if (lot.productionDate) text += '\nPrd: ' + lot.productionDate;
      text += movement.direction === 'IN' || sameDate
        ? '\nArrival: ' + arrival + ' | Exp: ' + (lot.expiryDate || '-')
        : '\nStock In: ' + stockIn + ' | Arrival: ' + arrival + ' | Exp: ' + (lot.expiryDate || '-');
    });
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

function buildStockXlsxBlobLegacy_(fileName, title, meta, headers, rows) {
  let temporarySpreadsheet = null;
  try {
    // Gunakan mesin export resmi Google Sheets agar struktur XLSX selalu valid
    // untuk Microsoft Excel. File sementara dibuang pada blok finally.
    temporarySpreadsheet = SpreadsheetApp.create('TEMP_EXPORT_' + Utilities.getUuid());
    const sheet = temporarySpreadsheet.getSheets()[0];
    sheet.setName('Stock Card');
    const columnCount = Math.max(1, headers.length);
    const dataRows = rows.length ? rows : [['Tidak ada data pada periode ini.']];
    const allRows = [[title], [meta], [], headers].concat(dataRows).map(function (row) {
      const normalized = [];
      for (let index = 0; index < columnCount; index++) {
        const value = row[index];
        normalized.push(value === undefined || value === null ? '' : value);
      }
      return normalized;
    });

    sheet.getRange(1, 1, allRows.length, columnCount).setValues(allRows);
    if (columnCount > 1) {
      sheet.getRange(1, 1, 1, columnCount).merge();
      sheet.getRange(2, 1, 1, columnCount).merge();
    }
    sheet.setFrozenRows(4);
    sheet.getRange(1, 1, 1, columnCount)
      .setBackground('#7f1d32').setFontColor('#ffffff').setFontWeight('bold').setFontSize(16)
      .setVerticalAlignment('middle');
    sheet.setRowHeight(1, 34);
    sheet.getRange(2, 1, 1, columnCount).setFontColor('#5f5558').setFontSize(10);
    sheet.getRange(4, 1, 1, columnCount)
      .setBackground('#9f172b').setFontColor('#ffffff').setFontWeight('bold');
    if (allRows.length > 4) {
      sheet.getRange(5, 1, allRows.length - 4, columnCount)
        .setVerticalAlignment('top').setWrap(true);
    }
    headers.forEach(function (header, index) {
      if (['QTY', 'Masuk', 'Stock In', 'IN', 'Keluar', 'OUT', 'Balance'].indexOf(header) >= 0 && allRows.length > 4) {
        sheet.getRange(5, index + 1, allRows.length - 4, 1).setNumberFormat('#,##0.00');
      }
      const width = index === 2 || index === 4 ? 260 : index === 0 ? 140 : 160;
      sheet.setColumnWidth(index + 1, width);
    });
    if (headers.length && allRows.length >= 4) {
      sheet.getRange(4, 1, Math.max(1, allRows.length - 3), columnCount).createFilter();
    }
    SpreadsheetApp.flush();

    const exportUrl = 'https://docs.google.com/spreadsheets/d/' + temporarySpreadsheet.getId() + '/export?format=xlsx';
    const response = UrlFetchApp.fetch(exportUrl, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('Google Sheets export merespons HTTP ' + response.getResponseCode() + '.');
    }
    const blob = response.getBlob();
    const bytes = blob.getBytes();
    if (bytes.length < 4 || bytes[0] !== 80 || bytes[1] !== 75) {
      throw new Error('Hasil export bukan file XLSX yang valid.');
    }
    return blob
      .setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setName(fileName);
  } catch (error) {
    throw new Error('File Excel gagal dibuat: ' + error.message);
  } finally {
    if (temporarySpreadsheet) {
      try { DriveApp.getFileById(temporarySpreadsheet.getId()).setTrashed(true); } catch (cleanupError) {}
    }
  }
}

function buildStockXlsxBlob_(fileName, title, meta, headers, rows) {
  return buildStockXlsxPackage_(fileName, title, meta, headers, rows);
}

function buildStockXlsxPackage_(fileName, title, meta, headers, rows) {
  const allRows = [[title], [meta], [], headers].concat(rows.length ? rows : [['Tidak ada data pada periode ini.']]);
  const numericHeaders = {};
  headers.forEach(function (header, index) {
    if (['QTY', 'QTY On Stock Card', 'QTY Stock Actual', 'Masuk', 'Stock In', 'IN', 'Keluar', 'OUT', 'Balance'].indexOf(header) >= 0) numericHeaders[index] = true;
  });
  const sheetRows = allRows.map(function (row, rowIndex) {
    const cells = [];
    for (let col = 0; col < headers.length; col++) {
      const value = row[col] === undefined || row[col] === null ? '' : row[col];
      const ref = xlsxColumn_(col + 1) + (rowIndex + 1);
      let style = rowIndex === 0 ? 1 : rowIndex === 1 ? 2 : rowIndex === 3 ? 3 : 4;
      if (rowIndex >= 4 && numericHeaders[col] && value !== '' && isFinite(Number(value))) {
        style = 5;
        cells.push('<c r="' + ref + '" s="' + style + '"><v>' + Number(value) + '</v></c>');
      } else if (value === '') {
        cells.push('<c r="' + ref + '" s="' + style + '"/>');
      } else {
        cells.push('<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' +
          xmlEscape_(String(value)) + '</t></is></c>');
      }
    }
    return '<row r="' + (rowIndex + 1) + '"' + (rowIndex === 0 ? ' ht="26" customHeight="1"' : '') + '>' + cells.join('') + '</row>';
  }).join('');
  const lastColumn = xlsxColumn_(headers.length);
  const lastRow = allRows.length;
  const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:' + lastColumn + lastRow + '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>' +
    '<cols>' + headers.map(function (_, index) { const width = index === 2 || index === 4 ? 34 : index === 0 ? 18 : 20; return '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>'; }).join('') + '</cols>' +
    '<sheetData>' + sheetRows + '</sheetData><autoFilter ref="A4:' + lastColumn + lastRow + '"/><mergeCells count="2"><mergeCell ref="A1:' + lastColumn + '1"/><mergeCell ref="A2:' + lastColumn + '2"/></mergeCells></worksheet>';
  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="16"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7F1D32"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF9F172B"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border/><border><bottom style="thin"><color rgb="FFE5E7EB"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const files = [
    Utilities.newBlob('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>', 'application/xml', '[Content_Types].xml'),
    Utilities.newBlob('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>', 'application/xml', '_rels/.rels'),
    Utilities.newBlob('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Stock Card" sheetId="1" r:id="rId1"/></sheets></workbook>', 'application/xml', 'xl/workbook.xml'),
    Utilities.newBlob('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>', 'application/xml', 'xl/_rels/workbook.xml.rels'),
    Utilities.newBlob(sheetXml, 'application/xml', 'xl/worksheets/sheet1.xml'),
    Utilities.newBlob(stylesXml, 'application/xml', 'xl/styles.xml'),
    Utilities.newBlob('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>', 'application/xml', 'xl/sharedStrings.xml')
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
function xmlEscape_(value) {
  // XML 1.0 melarang sebagian besar control character. Nilai tersebut dapat
  // muncul dari catatan/import dan membuat Excel membuang seluruh worksheet.
  return String(value === undefined || value === null ? '' : value)
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, '')
    .replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; });
}
function xlsxColumn_(number) { let name = ''; while (number > 0) { const remainder = (number - 1) % 26; name = String.fromCharCode(65 + remainder) + name; number = Math.floor((number - 1) / 26); } return name; }

function cleanExportName_(value) {
  return String(value || 'Stock_Card').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 120) || 'Stock_Card';
}

function readStockLocations_(outlet) {
  const cacheKey = 'stock-locations-' + String(outlet || '').trim().toUpperCase();
  const cached = readScriptJsonCache_(cacheKey);
  if (cached) return cached;
  const locations = ['Store', 'Gudang', 'Showcase'];
  const sheet = ensureSheet_(CONFIG.STOCK_LOCATION_SHEET, ['OUTLET', 'LOCATION', 'ACTIVE', 'CREATED_BY', 'CREATED_AT']);
  if (sheet.getLastRow() < 2) return locations;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
  rows.forEach(function (r) {
    if (String(r[0] || '').trim().toUpperCase() !== outlet || (String(r[2] || '').trim() && !truthy_(r[2]))) return;
    const name = normalizeLocation_(r[1]);
    if (name && locations.map(function (v) { return v.toLowerCase(); }).indexOf(name.toLowerCase()) < 0) locations.push(name);
  });
  const result = locations.slice(0, 2).concat(locations.slice(2).sort());
  writeScriptJsonCache_(cacheKey, result, 600);
  return result;
}

function readActiveOutlets_() {
  const cached = readScriptJsonCache_('stock-active-outlets');
  if (cached) return cached;
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.EMP_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return ['BIHQ'];
  const rows = sheet.getRange(2, 3, sheet.getLastRow() - 1, 7).getDisplayValues();
  const map = {};
  rows.forEach(function (r) {
    const outlet = String(r[0] || '').trim().toUpperCase();
    const status = String(r[6] || '').trim().toLowerCase();
    if (outlet && status !== 'resign') map[outlet] = true;
  });
  const result = Object.keys(map).sort();
  writeScriptJsonCache_('stock-active-outlets', result, 600);
  return result;
}

function readScriptJsonCache_(key) {
  try {
    const value = CacheService.getScriptCache().get(String(key || ''));
    return value ? JSON.parse(value) : null;
  } catch (error) { return null; }
}

function writeScriptJsonCache_(key, value, ttlSeconds) {
  try {
    const json = JSON.stringify(value);
    if (json.length < 95000) CacheService.getScriptCache().put(String(key || ''), json, Number(ttlSeconds || 300));
  } catch (error) { /* Cache is optional and must never block the app. */ }
}

function removeScriptCacheKeys_(keys) {
  try { CacheService.getScriptCache().removeAll(keys || []); } catch (error) { /* no-op */ }
}

function acquireStockWriteLock_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Sistem sedang menyimpan transaksi lain. Silakan coba lagi; data Anda belum disimpan.');
  return lock;
}

/**
 * A short global gate only claims a named lease; the actual work then runs in
 * parallel for different outlets. The same outlet remains serialized.
 */
function acquireStockScopeLock_(scope, waitMs) {
  const key = 'stock-scope-lock-' + digest_(String(scope || '')).slice(0, 32);
  const token = Utilities.getUuid(), deadline = Date.now() + Math.max(1000, Number(waitMs || 10000));
  const properties = PropertiesService.getScriptProperties();
  while (Date.now() < deadline) {
    const gate = LockService.getScriptLock();
    if (gate.tryLock(1000)) {
      try {
        const raw = properties.getProperty(key), lease = raw ? JSON.parse(raw) : null;
        if (!lease || Number(lease.expiresAt || 0) <= Date.now()) {
          properties.setProperty(key, JSON.stringify({ token: token, scope: String(scope || ''), expiresAt: Date.now() + 180000 }));
          return {
            releaseLock: function () {
              const releaseGate = LockService.getScriptLock();
              if (!releaseGate.tryLock(3000)) return;
              try {
                const currentRaw = properties.getProperty(key), current = currentRaw ? JSON.parse(currentRaw) : null;
                if (current && current.token === token) properties.deleteProperty(key);
              } finally { releaseGate.releaseLock(); }
            }
          };
        }
      } finally { gate.releaseLock(); }
    }
    Utilities.sleep(180 + Math.floor(Math.random() * 140));
  }
  throw new Error('Sistem sedang menyimpan transaksi lain untuk outlet ini. Tunggu sebentar lalu coba lagi; data Anda belum disimpan.');
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

function isTransferMovementType_(movementType) {
  return ['Transfer In', 'Transfer Out', 'Transfer Out Antar Outlet'].indexOf(String(movementType || '')) >= 0;
}

function ensureTransferMovementInfo_(direction, movementType, value) {
  let info = cleanText_(value, 300);
  if (!isTransferMovementType_(movementType)) return info;
  if (!info) throw new Error('Keterangan asal atau tujuan wajib diisi untuk transaksi transfer.');
  const incoming = String(direction || '').toUpperCase() === 'IN';
  const hasCounterpart = incoming ? /(?:Transfer From|(?:^|[·|])\s*Dari)\s+/i.test(info) : /(?:Transfer To|(?:^|[·|])\s*Ke)\s+/i.test(info);
  if (!hasCounterpart) info = (incoming ? 'Transfer From ' : 'Transfer To ') + info;
  return cleanText_(info, 300);
}

function validateMovementType_(direction, type) {
  const allowedIn = ['Opening Stock', 'Supplier In', 'Vendor In', 'Transfer In', 'Goods Receipt', 'Production', 'Stock Adjustment', 'Others'];
  const allowedOut = ['Terjual', 'Pemakaian', 'Waste', 'Transfer Out', 'Transfer Out Antar Outlet', 'Stock Adjustment', 'Others'];
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
  return Number(qty || 0).toFixed(2).replace(/\.?0+$/, '');
}

// ---------- Employee, session, and password helpers ----------

function readEmployeeNameMap_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('employee-name-map-v1');
  if (cached) {
    try { return JSON.parse(cached); } catch (error) { console.warn('Cache nama karyawan rusak: ' + error.message); }
  }
  const map = {};
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.EMP_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return map;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues();
  rows.forEach(function (row) {
    const nik = normalizeNik_(row[0]);
    if (nik) map[nik] = String(row[1] || '').trim() || nik;
  });
  try { cache.put('employee-name-map-v1', JSON.stringify(map), 600); } catch (error) { console.warn(error.message); }
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
        position: normalizeEmployeePosition_(values[i][4]),
        grade: String(values[i][5] || '').trim().toUpperCase(),
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
  const session = { nik: employee.nik, issuedAt: Date.now(), persistent: true };
  persistSession_(token, session);
  CacheService.getScriptCache().put(sessionKey_(token), JSON.stringify(session), CONFIG.SESSION_TTL_SECONDS);
  return sessionPayload_(employee, token);
}

function sessionPayload_(employee, token) {
  return { token: token, expiresIn: null, persistent: true, user: userView_(employee) };
}

function userView_(employee) {
  return { nik: employee.nik, name: employee.name, outlet: employee.outlet, isAdmin: employee.outlet === 'BIHQ' };
}

function requireSession_(token) {
  if (!token) throw new Error('Sesi tidak ditemukan. Silakan login kembali.');
  let raw = CacheService.getScriptCache().get(sessionKey_(token)), session = raw ? JSON.parse(raw) : null;
  if (!session) session = readPersistentSession_(token);
  if (!session) throw new Error('Sesi tidak aktif. Silakan login kembali.');
  // Migrasi otomatis bagi pengguna yang sudah login sebelum sesi persisten dipasang.
  if (!session.persistent) {
    session.persistent = true;
    persistSession_(token, session);
  }
  raw = JSON.stringify(session);
  CacheService.getScriptCache().put(sessionKey_(token), raw, CONFIG.SESSION_TTL_SECONDS);
  return session;
}

function requireAdmin_(token) {
  const session = requireSession_(token);
  const employee = findEmployee_(session.nik);
  assertEmployeeActive_(employee);
  if (employee.outlet !== 'BIHQ') throw new Error('Fitur ini hanya dapat diakses oleh admin BIHQ.');
  return employee;
}

function sessionKey_(token) { return 'session:' + String(token); }

function ensureSessionSheet_() {
  return ensureSheet_(CONFIG.SESSION_SHEET, ['TOKEN_HASH', 'NIK', 'CREATED_AT', 'ACTIVE', 'LOGGED_OUT_AT']);
}

function persistentSessionHash_(token) { return digest_('persistent-session|' + String(token || '')); }

function findPersistentSessionRows_(sheet, tokenHash) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(tokenHash).matchEntireCell(true).findAll();
}

function persistSession_(token, session) {
  const sheet = ensureSessionSheet_(), tokenHash = persistentSessionHash_(token), matches = findPersistentSessionRows_(sheet, tokenHash);
  const activeExists = matches.some(function (cell) { return truthy_(sheet.getRange(cell.getRow(), 4).getDisplayValue()); });
  if (!activeExists) sheet.appendRow([tokenHash, normalizeNik_(session.nik), new Date(Number(session.issuedAt || Date.now())), true, '']);
}

function readPersistentSession_(token) {
  const sheet = ensureSessionSheet_(), matches = findPersistentSessionRows_(sheet, persistentSessionHash_(token));
  for (let i = matches.length - 1; i >= 0; i--) {
    const row = matches[i].getRow(), values = sheet.getRange(row, 2, 1, 3).getDisplayValues()[0];
    if (truthy_(values[2])) return { nik: normalizeNik_(values[0]), issuedAt: new Date(values[1] || 0).getTime() || Date.now(), persistent: true };
  }
  return null;
}

function deactivatePersistentSession_(token) {
  const sheet = ensureSessionSheet_(), matches = findPersistentSessionRows_(sheet, persistentSessionHash_(token));
  matches.forEach(function (cell) {
    const row = cell.getRow();
    if (truthy_(sheet.getRange(row, 4).getDisplayValue())) sheet.getRange(row, 4, 1, 2).setValues([[false, new Date()]]);
  });
}

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

function ensureNewsSheet_() {
  return ensureSheet_(CONFIG.NEWS_SHEET,
    ['ID', 'TITLE', 'CONTENT', 'IMAGE_URL', 'LINK_URL', 'PUBLISHED_AT', 'ACTIVE', 'CREATED_BY']);
}

function findNewsRow_(sheet, newsId) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === newsId) return i + 2;
  return 0;
}

function driveFileIdFromUrl_(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  const patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/];
  for (let i = 0; i < patterns.length; i++) {
    const match = url.match(patterns[i]);
    if (match && match[1]) return match[1];
  }
  return '';
}

function normalizeNewsImageUrl_(value) {
  const url = safeUrl_(value);
  if (!url) return '';
  if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(url)) return url;
  const fileId = driveFileIdFromUrl_(url);
  if (!fileId) throw new Error('Link Google Drive gambar tidak valid. Gunakan link berbagi file dari Google Drive.');
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w1600';
}

function ensureNewsImageFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const existingId = String(properties.getProperty('NEWS_IMAGE_FOLDER_ID') || '');
  if (existingId) {
    try { return DriveApp.getFolderById(existingId); }
    catch (error) { properties.deleteProperty('NEWS_IMAGE_FOLDER_ID'); }
  }
  const folder = DriveApp.createFolder('BAKERZIN_NEWS_IMAGES');
  properties.setProperty('NEWS_IMAGE_FOLDER_ID', folder.getId());
  return folder;
}

function prepareTransferPhotoData_(uploads) {
  uploads = Array.isArray(uploads) ? uploads : [];
  if (!uploads.length) return [];
  if (uploads.length > 5) throw new Error('Maksimal 5 foto pengiriman.');
  const allowed = ['image/jpeg', 'image/png', 'image/webp'], prepared = [];
  let totalBytes = 0;
  uploads.forEach(function (upload, index) {
    upload = upload || {};
    const mimeType = String(upload.mimeType || '').toLowerCase();
    if (allowed.indexOf(mimeType) < 0) throw new Error('Foto ' + (index + 1) + ' harus berformat JPG, PNG, atau WEBP.');
    const raw = String(upload.base64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!raw) throw new Error('Foto ' + (index + 1) + ' tidak dapat dibaca.');
    const bytes = Utilities.base64Decode(raw);
    if (bytes.length > 300 * 1024) throw new Error('Foto ' + (index + 1) + ' terlalu besar setelah kompresi. Maksimal 300 KB.');
    totalBytes += bytes.length;
    if (totalBytes > 1500 * 1024) throw new Error('Total foto setelah kompresi maksimal 1,5 MB.');
    prepared.push({ mimeType: mimeType, base64: Utilities.base64Encode(bytes) });
  });
  return prepared;
}

function transferPhotoDataUrl_(fileId) {
  try {
    const blob = DriveApp.getFileById(String(fileId)).getBlob();
    const mimeType = String(blob.getContentType() || 'image/jpeg');
    if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType.toLowerCase()) < 0) return '';
    return 'data:' + mimeType + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (error) {
    return '';
  }
}

function saveNewsImageUpload_(upload, newsId) {
  upload = upload || {};
  const mimeType = String(upload.mimeType || '').toLowerCase();
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.indexOf(mimeType) < 0) throw new Error('Format gambar harus JPG, PNG, WEBP, atau GIF.');
  const raw = String(upload.base64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!raw) throw new Error('File gambar upload tidak dapat dibaca.');
  const bytes = Utilities.base64Decode(raw);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Ukuran gambar maksimal 5 MB.');
  const originalName = String(upload.fileName || 'image').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-90);
  const blob = Utilities.newBlob(bytes, mimeType, 'news-' + newsId.slice(0, 8) + '-' + originalName);
  const file = ensureNewsImageFolder_().createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {
    file.setTrashed(true);
    throw new Error('Gambar tidak dapat dipublikasikan karena kebijakan berbagi Google Drive. Hubungi admin Google Workspace.');
  }
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(file.getId()) + '&sz=w1600';
}

function resolveNewsImage_(payload, existingUrl, newsId) {
  if (truthy_(payload.removeImage)) return '';
  if (payload.imageUpload && payload.imageUpload.base64) return saveNewsImageUpload_(payload.imageUpload, newsId);
  const suppliedUrl = String(payload.imageUrl || '').trim();
  return suppliedUrl ? normalizeNewsImageUrl_(suppliedUrl) : String(existingUrl || '');
}

function readNews_(publicOnly) {
  const sheet = ensureNewsSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues()
    .filter(function (r) { return truthy_(r[6]); })
    .map(function (r) {
      const item = { id: String(r[0]), title: String(r[1]), content: String(r[2]), imageUrl: String(r[3] || ''), linkUrl: String(r[4] || ''), publishedAt: dateIso_(r[5]) };
      if (!publicOnly) item.createdBy = String(r[7] || '');
      return item;
    }).sort(function (a, b) { return b.publishedAt.localeCompare(a.publishedAt); }).slice(0, publicOnly ? 20 : 100);
}

function ensurePageSheet_() {
  const headers = ['ID', 'TITLE', 'ICON', 'ACTIVE', 'CREATED_AT', 'CREATED_BY'];
  const sheet = ensureSheet_(CONFIG.PAGE_SHEET, headers);
  if (String(sheet.getRange(1, 3).getDisplayValue() || '').trim().toUpperCase() === 'DESCRIPTION') {
    const oldRows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
    const migrated = oldRows.filter(function (row) { return String(row[0] || '').trim() && String(row[1] || '').trim(); })
      .map(function (row) { return [row[0], row[1], row[4] || 'description', row[6], row[7], row[8]]; });
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#9f172b').setFontColor('#ffffff');
    if (migrated.length) sheet.getRange(2, 1, migrated.length, headers.length).setValues(migrated);
  }
  return sheet;
}

function readNavigationPages_() {
  const sheet = ensurePageSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues().map(function (row) {
    return {
      id: String(row[0]), title: String(row[1] || ''), icon: cleanTaskIcon_(row[2], 'PAGE', ''),
      active: truthy_(row[3]), createdAt: dateIso_(row[4])
    };
  }).filter(function (page) { return page.active && page.title; })
    .sort(function (a, b) { return a.title.localeCompare(b.title); });
}

function normalizeEmployeePosition_(value) { return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase(); }

function employeeGradeSort_(value) {
  const text = String(value || '').trim().toUpperCase(), match = text.match(/(\d+)\s*([A-Z]*)/);
  return { number: match ? Number(match[1]) : -1, suffix: match ? match[2] : text, text: text };
}

function readEmployeePositions_() {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.EMP_SHEET), map = {};
  if (!sheet || sheet.getLastRow() < 2) return [];
  sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(9, sheet.getLastColumn())).getDisplayValues().forEach(function (row) {
    const position = normalizeEmployeePosition_(row[4]), grade = String(row[5] || '').trim().toUpperCase();
    if (!position || String(row[8] || '').trim().toLowerCase() === 'resign') return;
    const candidate = employeeGradeSort_(grade), current = map[position] && employeeGradeSort_(map[position].grade);
    if (!map[position] || candidate.number > current.number || (candidate.number === current.number && candidate.suffix.localeCompare(current.suffix) < 0)) {
      map[position] = { position: position, grade: grade };
    }
  });
  return Object.keys(map).map(function (key) { return map[key]; }).sort(function (a, b) {
    const left = employeeGradeSort_(a.grade), right = employeeGradeSort_(b.grade);
    return right.number - left.number || left.suffix.localeCompare(right.suffix) || a.position.localeCompare(b.position);
  });
}

function ensureSubpageVisibilitySheet_() {
  const headers = ['TASK_ID', 'POSITION', 'ENABLED', 'UPDATED_AT', 'UPDATED_BY'];
  const sheet = ensureSheet_(CONFIG.SUBPAGE_VISIBILITY_SHEET, headers);
  if (String(sheet.getRange(1, 1).getDisplayValue() || '').trim().toUpperCase() !== 'TASK_ID') {
    // Hapus konfigurasi versi lama yang keliru memakai Navigation Page sebagai baris.
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#9f172b').setFontColor('#ffffff');
  }
  return sheet;
}

function readSubpageVisibilityState_() {
  const sheet = ensureSubpageVisibilitySheet_(), state = { configured: {}, allowed: {} };
  if (sheet.getLastRow() < 2) return state;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues().forEach(function (row) {
    const taskId = String(row[0] || '').trim(), position = normalizeEmployeePosition_(row[1]);
    if (!taskId || !position) return;
    state.configured[taskId] = true;
    if (truthy_(row[2])) state.allowed[taskId + '|' + position] = true;
  });
  return state;
}

function readPagesForEmployee_(employee) { return readNavigationPages_(); }

function readAllActiveTasks_() {
  const sheet = ensureTaskSheet_();
  if (sheet.getLastRow() < 2) return [];
  const frequencyOrder = { DAILY: 1, WEEKLY: 2, MONTHLY: 3, YEARLY: 4 };
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues().map(taskFromRow_)
    .filter(function (task) { return task.active; })
    .sort(function (a, b) { return Number(frequencyOrder[a.frequency] || 99) - Number(frequencyOrder[b.frequency] || 99) || a.title.localeCompare(b.title); });
}

function taskVisibleForEmployeePosition_(task, employee, stateOverride) {
  if (employee.outlet === 'BIHQ') return true;
  const state = stateOverride || readSubpageVisibilityState_(), position = normalizeEmployeePosition_(employee.position);
  return !state.configured[task.id] || Boolean(position && state.allowed[task.id + '|' + position]);
}

function readTasksForEmployee_(employee) {
  const state = employee.outlet === 'BIHQ' ? null : readSubpageVisibilityState_();
  return readAllActiveTasks_().filter(function (task) {
    return taskApplies_(task, employee) && taskVisibleForEmployeePosition_(task, employee, state);
  });
}

function taskFromRow_(r) {
  const frequency = String(r[5]).toUpperCase();
  const type = String(r[3]).toUpperCase();
  const target = String(r[4] || '');
  return {
    id: String(r[0]), title: String(r[1]), description: String(r[2] || ''), type: type,
    target: target, frequency: frequency, periodKey: currentPeriodKey_(frequency), audience: String(r[6] || 'ALL').toUpperCase(),
    dueLabel: String(r[7] || ''), active: truthy_(r[8]), createdAt: dateIso_(r[9]), icon: cleanTaskIcon_(r[11], type, target),
    pageId: String(r[12] || '')
  };
}

function ensureTaskSheet_() {
  const headers = ['ID', 'TITLE', 'DESCRIPTION', 'TYPE', 'TARGET', 'FREQUENCY', 'AUDIENCE', 'DUE_LABEL', 'ACTIVE', 'CREATED_AT', 'CREATED_BY', 'ICON', 'PAGE_ID'];
  const sheet = ensureSheet_(CONFIG.TASK_SHEET, headers);
  const currentIconHeader = String(sheet.getRange(1, 12).getDisplayValue() || '').trim().toUpperCase();
  if (currentIconHeader !== 'ICON') {
    sheet.getRange(1, 12).setValue('ICON').setFontWeight('bold').setBackground('#9f172b').setFontColor('#ffffff');
  }
  if (String(sheet.getRange(1, 13).getDisplayValue() || '').trim().toUpperCase() !== 'PAGE_ID') {
    sheet.getRange(1, 13).setValue('PAGE_ID').setFontWeight('bold').setBackground('#9f172b').setFontColor('#ffffff');
  }
  const existingTargets = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 5, sheet.getLastRow() - 1, 1).getDisplayValues().map(function (row) {
    return String(row[0] || '').trim().toLowerCase();
  });
  if (existingTargets.indexOf('showcaselog') < 0) {
    sheet.appendRow([
      'SHOWCASE_LOG_DAILY', 'Showcase Log', 'Input harian Stock In, Sold, dan Waste untuk Showcase.',
      'FORM', 'showcaselog', 'DAILY', 'ALL', 'Hari ini', true, new Date(), 'SYSTEM', 'storefront'
    ]);
  }
  return sheet;
}

function cleanTaskIcon_(value, type, target) {
  const allowed = [
    'add_link','analytics','archive','assignment','bakery_dining','barcode_scanner','calendar_month','category','checklist','cloud','dashboard','dataset','description','download','edit_document','event','fact_check','folder','grade','grid_view','group','home','inventory','inventory_2','kitchen','link','list_alt','local_dining','local_shipping','location_on','monitoring','move_to_inbox','package_2','payments','point_of_sale','print','qr_code','receipt_long','restaurant','scale','schedule','search','settings','shopping_basket','shopping_cart','storage','store','storefront','task_alt','unarchive','upload','view_list','warehouse','widgets','work'
  ];
  const icon = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (allowed.indexOf(icon) >= 0) return icon;
  if (String(target || '') === 'StockCard') return 'inventory_2';
  if (String(target || '').toLowerCase() === 'showcaselog') return 'storefront';
  return String(type || '').toUpperCase() === 'FORM' ? 'assignment' : 'link';
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
  const sheet = ensureTaskSheet_();
  if (sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();
  for (let i = 0; i < rows.length; i++) if (String(rows[i][0]) === String(taskId)) return taskFromRow_(rows[i]);
  return null;
}

function taskApplies_(task, employee) {
  const audience = String(task.audience || 'ALL').toUpperCase().split(',').map(function (v) { return v.trim(); });
  return audience.indexOf('ALL') >= 0 || audience.indexOf(employee.outlet) >= 0 || audience.indexOf(employee.nik) >= 0;
}

function readActiveAssigneesByOutlet_() {
  const map = {};
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.EMP_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return map;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(9, sheet.getLastColumn())).getDisplayValues();
  rows.forEach(function (row) {
    const nik = normalizeNik_(row[0]);
    const outlet = String(row[2] || '').trim().toUpperCase();
    const status = String(row[8] || '').trim().toLowerCase();
    if (!nik || !outlet || status === 'resign') return;
    if (!map[outlet]) map[outlet] = [];
    map[outlet].push(nik);
  });
  return map;
}

function taskAppliesToOutlet_(task, outlet, employeeNiks) {
  const audience = String(task.audience || 'ALL').toUpperCase().split(',').map(function (value) { return value.trim(); }).filter(Boolean);
  if (audience.indexOf('ALL') >= 0 || audience.indexOf(outlet) >= 0) return true;
  return (employeeNiks || []).some(function (nik) { return audience.indexOf(nik) >= 0; });
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

function ensureBigQueryTable_(tableId, fields, partitionField, clusteringFields) {
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
    if (clusteringFields && clusteringFields.length) table.clustering = { fields: clusteringFields.slice(0, 4) };
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

function runNamedQuery_(query, params, options) {
  const queryParameters = Object.keys(params || {}).map(function (name) {
    return { name: name, parameterType: { type: 'STRING' }, parameterValue: { value: String(params[name]) } };
  });
  const request = {
    query: query, useLegacySql: false, location: CONFIG.BQ_LOCATION,
    parameterMode: 'NAMED', queryParameters: queryParameters, maxResults: 10000,
    useQueryCache: !(options && options.useQueryCache === false)
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

function mergeStockUploadCompletions_(completionMap, tasks, outlet) {
  const map = completionMap || {};
  const stockTasks = (tasks || []).filter(function (task) {
    return task.type === 'FORM' && task.target === 'StockCard' && task.frequency === 'DAILY';
  });
  if (!stockTasks.length || !outlet) return map;
  try {
    const query = 'SELECT CAST(event_date AS STRING) AS period_key ' +
      'FROM ' + stockCardTable_() + ' ' +
      'WHERE record_type IN (\'MOVEMENT\', \'IMPORT\') AND outlet = @outlet ' +
      'AND movement_type IN (\'Goods Receipt\', \'Terjual\') ' +
      'AND source_file IS NOT NULL AND source_file != \'\' GROUP BY event_date ' +
      'HAVING MAX(IF(movement_type = \'Goods Receipt\', 1, 0)) = 1 ' +
      'AND MAX(IF(movement_type = \'Terjual\', 1, 0)) = 1';
    runNamedQuery_(query, { outlet: outlet }).forEach(function (row) {
      const periodKey = String(row.period_key || '').slice(0, 10);
      if (!periodKey) return;
      stockTasks.forEach(function (task) {
        if (taskExistedForPeriod_(task, task.frequency, periodKey)) {
          map[task.id + '|' + periodKey] = map[task.id + '|' + periodKey] || 'AUTO_UPLOADS';
        }
      });
    });
  } catch (error) {
    if (!/not found|Not found|404/.test(String(error))) {
      console.error('Progress upload historis gagal dibaca: ' + (error && error.message ? error.message : error));
    }
  }
  return map;
}

function readCurrentOutletCompletionMap_(periodKeys) {
  const map = {};
  try {
    const query = 'SELECT outlet, task_id, period_key, MAX(completed_at) AS completed_at ' +
      'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.task_completions` ' +
      'WHERE period_key IN (@currentDaily, @currentWeekly, @currentMonthly, @currentYearly, ' +
      '@previousDaily, @previousWeekly, @previousMonthly, @previousYearly) ' +
      'GROUP BY outlet, task_id, period_key';
    const rows = runNamedQuery_(query, {
      currentDaily: periodKeys.CURRENT.DAILY,
      currentWeekly: periodKeys.CURRENT.WEEKLY,
      currentMonthly: periodKeys.CURRENT.MONTHLY,
      currentYearly: periodKeys.CURRENT.YEARLY,
      previousDaily: periodKeys.PREVIOUS.DAILY,
      previousWeekly: periodKeys.PREVIOUS.WEEKLY,
      previousMonthly: periodKeys.PREVIOUS.MONTHLY,
      previousYearly: periodKeys.PREVIOUS.YEARLY
    });
    rows.forEach(function (row) {
      map[String(row.outlet || '').toUpperCase() + '|' + String(row.task_id || '') + '|' + String(row.period_key || '')] = row.completed_at || true;
    });
  } catch (error) {
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

function previousPeriodKey_(frequency) {
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const currentKey = currentPeriodKey_(frequency);
  if (frequency === 'YEARLY') return String(Number(currentKey) - 1);
  if (frequency === 'MONTHLY') {
    const monthParts = currentKey.split('-');
    const previousMonth = new Date(Number(monthParts[0]), Number(monthParts[1]) - 2, 15, 12, 0, 0);
    return Utilities.formatDate(previousMonth, tz, 'yyyy-MM');
  }
  const dayParts = currentKey.split('-');
  const currentStart = new Date(Number(dayParts[0]), Number(dayParts[1]) - 1, Number(dayParts[2]), 12, 0, 0);
  currentStart.setDate(currentStart.getDate() - (frequency === 'WEEKLY' ? 7 : 1));
  return Utilities.formatDate(currentStart, tz, 'yyyy-MM-dd');
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
