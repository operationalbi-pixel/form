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
  PUSH_TOKEN_SHEET: 'APP_PUSH_TOKENS',
  STORE_CODE_SHEET: 'STORE CODE',
  STOCK_MASTER_SHEET: 'STOCK_ITEMS',
  STOCK_LOCATION_SHEET: 'STOCK_LOCATIONS',
  STOCK_CONVERSION_SHEET: 'STOCK_UNIT_CONVERSIONS',
  STOCK_DEFAULT_UNIT_LOG_SHEET: 'STOCK_DEFAULT_UNIT_LOG',
  SALES_PRODUCT_MAPPING_SHEET: 'SALES_PRODUCT_MAPPINGS',
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
  const isMobileRequest = Boolean(e && e.parameter && e.parameter.mobilePayload);
  try {
    const raw = isMobileRequest ? e.parameter.mobilePayload : e && e.parameter && e.parameter.payload || e && e.postData && e.postData.contents || '{}';
    request = JSON.parse(String(raw));
    const actions = apiActions_();
    const action = String(request.action || '');
    if (!Object.prototype.hasOwnProperty.call(actions, action)) {
      const denied = { ok: false, error: 'Aksi API tidak diizinkan: ' + action };
      return isMobileRequest ? mobileJsonOutput_(denied) : htmlBridgeOutput_(request.requestId, denied);
    }
    const args = Array.isArray(request.args) ? request.args : [];
    const response = actions[action].apply(null, args);
    return isMobileRequest ? mobileJsonOutput_(response) : htmlBridgeOutput_(request.requestId, response);
  } catch (error) {
    const response = { ok: false, error: error && error.message ? error.message : String(error) };
    return isMobileRequest ? mobileJsonOutput_(response) : htmlBridgeOutput_(request.requestId, response);
  }
}

function apiActions_() {
  return Object.freeze({
    getPublicBootstrap: getPublicBootstrap,
    checkNik: checkNik,
    activateAccount: activateAccount,
    login: login,
    resumeSession: resumeSession,
    beritaAcaraHandoff: createBeritaAcaraHandoff,
    consumeBeritaAcaraHandoff: consumeBeritaAcaraHandoff,
    logout: logout,
    getAppData: getAppData,
    mobileNotifications: getMobileNotifications,
    registerPushToken: registerMobilePushToken,
    outletProgress: getOutletProgress,
    markTaskComplete: markTaskComplete,
    adminAddNews: adminAddNews,
    adminUpdateNews: adminUpdateNews,
    adminDeleteNews: adminDeleteNews,
    adminAddItem: adminAddItem,
    adminAddPage: adminAddPage,
    adminPageVisibility: getAdminPageVisibility,
    adminSavePageVisibility: saveAdminPageVisibility,
    lostFoundBootstrap: getLostFoundBootstrap,
    lostFoundOutlets: getLostFoundOutlets,
    lostFoundItems: getLostFoundItems,
    lostFoundItemDetail: getLostFoundItemDetail,
    lostFoundSave: saveLostFoundItem,
    lostFoundUpdate: updateLostFoundItem,
    lostFoundProcess: processLostFoundItem,
    salesAnalysisBootstrap: getSalesAnalysisBootstrap,
    salesAnalysisDashboard: getSalesAnalysisDashboard,
    salesAnalysisTargets: getSalesAnalysisTargets,
    salesAnalysisSaveTargets: saveSalesAnalysisTargets,
    salesAnalysisSaveDaily: saveSalesAnalysisDaily,
    salesAnalysisSaveWeekly: saveSalesAnalysisWeekly,
    salesAnalysisSaveMonthly: saveSalesAnalysisMonthly,
    salesAnalysisSaveGlobal: saveSalesAnalysisGlobal,
    salesAnalysisAddGlobal: addSalesAnalysisGlobalItem,
    salesAnalysisDeleteGlobal: deleteSalesAnalysisGlobalItem,
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
    recalculateFifoFefo: recalculateStockFifoFefo,
    expiryTemplate: downloadMissingExpiryTemplate,
    expiryUpload: uploadMissingExpiryExcel,
    expiryUploadStatus: getMissingExpiryUploadStatus,
    history: getStockHistory,
    verifyUsage: previewSalesCogsUpload,
    previewSalesRepair: previewSalesCogsRepair,
    repairSalesUpload: repairSalesCogsUpload,
    saveSalesProductMappings: saveSalesProductMappings,
    verifyItemJournal: previewItemJournalUpload,
    uploadItemJournal: uploadItemJournal,
    mockRecallList: getMockRecallList,
    mockRecallDetail: getMockRecallDetail,
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
    wipHistory: getWipProductionHistory,
    wipCancel: cancelWipProduction,
    transferOptions: getStockTransferOptions,
    transferLocal: transferStockWithinOutlet,
    transferOutlet: createInterOutletStockTransfer,
    pendingTransfers: getPendingStockTransfers,
    transferHistory: getStockTransferHistory,
    acceptTransfer: acceptInterOutletStockTransfer,
    rejectTransfer: rejectInterOutletStockTransfer,
    exportTransferReceipt: exportTransferReceipt,
    uploadUsage: uploadSalesCogs,
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

/** Creates a short-lived, one-time sign-on code for the separate Berita Acara Web App. */
function createBeritaAcaraHandoff(token) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    const handoff = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    CacheService.getScriptCache().put('ba-handoff:' + handoff, JSON.stringify({ nik: employee.nik, issuedAt: Date.now() }), 300);
    return { handoff: handoff, expiresIn: 300 };
  });
}

/** Consumed server-to-server by the Berita Acara Apps Script. A code can only be used once. */
function consumeBeritaAcaraHandoff(handoff) {
  return safe_(function () {
    handoff = String(handoff || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(handoff)) throw new Error('Kode akses Berita Acara tidak valid.');
    const cache = CacheService.getScriptCache(), key = 'ba-handoff:' + handoff, raw = cache.get(key);
    cache.remove(key);
    if (!raw) throw new Error('Kode akses Berita Acara sudah dipakai atau kedaluwarsa. Silakan buka kembali dari BI-Space.');
    const data = JSON.parse(raw);
    if (!data.issuedAt || Date.now() - Number(data.issuedAt) > 300000) throw new Error('Kode akses Berita Acara telah kedaluwarsa.');
    const employee = findEmployee_(normalizeNik_(data.nik));
    assertEmployeeActive_(employee);
    const position = normalizeEmployeePosition_(employee.position);
    return {
      NIK: employee.nik,
      NAME: employee.name,
      OUTLET: employee.outlet,
      POSITION: position,
      GRADE: employee.grade,
      ROLE: employee.outlet === 'BIHQ' || position === 'AREA MANAGER' || position === 'FNB' ? 'APPROVER' : 'OUTLET'
    };
  });
}

function mobileJsonOutput_(response) {
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
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
      sendRealtimeMobilePush_({}, {
        id: 'NEWS:' + newsId,
        type: 'NEWS',
        title: title,
        body: content,
        url: linkUrl || 'https://operationalbi-pixel.github.io/form/'
      });
      return { news: readNews_(false), newsId: newsId };
    } finally { lock.releaseLock(); }
  });
}

/** Lightweight notification feed used by the signed BI-Space Android application. */
function getMobileNotifications(token) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    const notifications = [];

    readNews_(false).slice(0, 30).forEach(function (item) {
      notifications.push({
        id: 'NEWS:' + item.id,
        type: 'NEWS',
        title: item.title || 'Informasi terbaru',
        body: item.content || 'Ada informasi terbaru di BI-Space.',
        createdAt: item.publishedAt || new Date().toISOString(),
        url: item.linkUrl || 'https://operationalbi-pixel.github.io/form/'
      });
    });

    if (employee.outlet !== 'BIHQ') {
      ensureStockCardInfrastructure_();
      readPendingStockTransfers_(employee.outlet).slice(0, 30).forEach(function (transfer) {
        notifications.push({
          id: 'TRANSFER:' + transfer.transferId,
          type: 'TRANSFER',
          title: 'Transfer masuk dari ' + transfer.fromOutlet,
          body: String((transfer.items || []).length) + ' item menunggu diterima di ' + transfer.toOutlet + '.',
          createdAt: transfer.createdAt || new Date().toISOString(),
          url: 'https://operationalbi-pixel.github.io/form/stock-card.html'
        });
      });

      const periodKey = currentPeriodKey_('DAILY');
      const completionMap = readCompletionMap_(employee.outlet);
      const incomplete = readTasksForEmployee_(employee).filter(function (task) {
        return task.active && task.frequency === 'DAILY' && !completionMap[task.id + '|' + periodKey];
      });
      if (incomplete.length) {
        notifications.push({
          id: 'DAILY:' + employee.outlet + ':' + periodKey,
          type: 'REMINDER',
          title: incomplete.length + ' pekerjaan Daily belum selesai',
          body: 'Buka BI-Space untuk melihat pekerjaan yang masih perlu diselesaikan.',
          createdAt: new Date().toISOString(),
          url: 'https://operationalbi-pixel.github.io/form/'
        });
      }
    }

    return {
      notifications: notifications,
      generatedAt: new Date().toISOString(),
      user: userView_(employee)
    };
  });
}


function ensureMobilePushTokenSheet_() {
  const sheet = ensureSheet_(CONFIG.PUSH_TOKEN_SHEET,
    ['FCM_TOKEN', 'NIK', 'OUTLET', 'DEVICE_ID', 'PLATFORM', 'APP_VERSION', 'ACTIVE', 'UPDATED_AT']);
  sheet.setFrozenRows(1);
  return sheet;
}

function registerMobilePushToken(token, payload) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    payload = payload || {};
    const fcmToken = String(payload.fcmToken || '').trim();
    const deviceId = cleanText_(payload.deviceId, 180);
    if (!fcmToken || fcmToken.length < 40 || fcmToken.length > 4096) throw new Error('Token push perangkat tidak valid.');
    if (!deviceId) throw new Error('Identitas perangkat tidak tersedia.');
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const sheet = ensureMobilePushTokenSheet_();
      const values = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues() : [];
      let targetRow = 0;
      values.forEach(function (row, index) {
        const sameDevice = String(row[1] || '') === employee.nik && String(row[3] || '') === deviceId;
        const sameToken = String(row[0] || '') === fcmToken;
        if (sameDevice || sameToken) {
          if (!targetRow) targetRow = index + 2;
          else sheet.getRange(index + 2, 7).setValue(false);
        }
      });
      const row = [fcmToken, employee.nik, employee.outlet, deviceId,
        cleanText_(payload.platform || 'ANDROID', 40), cleanText_(payload.appVersion, 40), true, new Date()];
      if (targetRow) sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
      else sheet.appendRow(row);
      return { registered: true, outlet: employee.outlet, deviceId: deviceId };
    } finally { lock.releaseLock(); }
  });
}

function mobilePushConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const projectId = String(properties.getProperty('FCM_PROJECT_ID') || '').trim();
  const clientEmail = String(properties.getProperty('FCM_CLIENT_EMAIL') || '').trim();
  const privateKey = String(properties.getProperty('FCM_PRIVATE_KEY') || '').replace(/\\n/g, '\n').trim();
  return projectId && clientEmail && privateKey ? { projectId: projectId, clientEmail: clientEmail, privateKey: privateKey } : null;
}

function mobilePushAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('fcm-oauth-access-token-v1');
  if (cached) return cached;
  const config = mobilePushConfig_();
  if (!config) return '';
  const now = Math.floor(Date.now() / 1000);
  const encode = function (value) {
    return Utilities.base64EncodeWebSafe(typeof value === 'string' ? value : JSON.stringify(value)).replace(/=+$/g, '');
  };
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const claim = encode({
    iss: config.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const unsigned = header + '.' + claim;
  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(unsigned, config.privateKey)).replace(/=+$/g, '');
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + signature
    },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    console.error('FCM OAuth gagal: ' + response.getContentText());
    return '';
  }
  const accessToken = String(JSON.parse(response.getContentText() || '{}').access_token || '');
  if (accessToken) cache.put('fcm-oauth-access-token-v1', accessToken, 3300);
  return accessToken;
}

function readMobilePushTokens_(filter) {
  filter = filter || {};
  const sheet = ensureMobilePushTokenSheet_();
  if (sheet.getLastRow() < 2) return [];
  const seen = {};
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues().filter(function (row) {
    if (!truthy_(row[6])) return false;
    if (filter.nik && String(row[1] || '') !== String(filter.nik)) return false;
    if (filter.outlet && String(row[2] || '').toUpperCase() !== String(filter.outlet).toUpperCase()) return false;
    const token = String(row[0] || '').trim();
    if (!token || seen[token]) return false;
    seen[token] = true;
    return true;
  }).map(function (row) { return String(row[0] || '').trim(); });
}

function sendRealtimeMobilePush_(filter, notification) {
  try {
    const config = mobilePushConfig_(), accessToken = mobilePushAccessToken_();
    if (!config || !accessToken) return { configured: false, sent: 0 };
    const tokens = readMobilePushTokens_(filter);
    if (!tokens.length) return { configured: true, sent: 0 };
    notification = notification || {};
    const data = {
      id: String(notification.id || Utilities.getUuid()),
      type: String(notification.type || 'SYSTEM'),
      title: String(notification.title || 'BI-Space'),
      body: String(notification.body || ''),
      url: String(notification.url || 'https://operationalbi-pixel.github.io/form/'),
      createdAt: String(notification.createdAt || new Date().toISOString())
    };
    const endpoint = 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(config.projectId) + '/messages:send';
    const requests = tokens.slice(0, 500).map(function (deviceToken) {
      return {
        url: endpoint,
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + accessToken },
        payload: JSON.stringify({ message: {
          token: deviceToken,
          data: data,
          android: { priority: 'HIGH' }
        }}),
        muteHttpExceptions: true
      };
    });
    const responses = UrlFetchApp.fetchAll(requests);
    const sent = responses.filter(function (response) { return response.getResponseCode() >= 200 && response.getResponseCode() < 300; }).length;
    responses.forEach(function (response) {
      if (response.getResponseCode() >= 400) console.error('FCM send gagal ' + response.getResponseCode() + ': ' + response.getContentText());
    });
    return { configured: true, sent: sent, attempted: requests.length };
  } catch (error) {
    console.error('Push realtime gagal; polling Android tetap aktif: ' + error.message);
    return { configured: Boolean(mobilePushConfig_()), sent: 0, error: error.message };
  }
}

function notifyPendingStockTransfers_(pendingRows) {
  const groups = {};
  (pendingRows || []).forEach(function (entry) {
    const row = entry && entry.json ? entry.json : entry;
    if (!row || row.status !== 'PENDING' || !row.to_outlet) return;
    const key = String(row.to_outlet) + '|' + String(row.transfer_id);
    if (!groups[key]) groups[key] = { toOutlet: String(row.to_outlet), fromOutlet: String(row.from_outlet || ''), transferId: String(row.transfer_id || ''), items: {} };
    groups[key].items[String(row.item_code || row.item_name || '')] = true;
  });
  Object.keys(groups).forEach(function (key) {
    const group = groups[key], count = Object.keys(group.items).length;
    sendRealtimeMobilePush_({ outlet: group.toOutlet }, {
      id: 'TRANSFER:' + group.transferId,
      type: 'TRANSFER',
      title: 'Transfer masuk dari ' + group.fromOutlet,
      body: count + ' item menunggu diterima di ' + group.toOutlet + '.',
      url: 'https://operationalbi-pixel.github.io/form/stock-card.html'
    });
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
    const isBihq = employee.outlet === 'BIHQ';
    const outlets = isBihq ? readActiveOutlets_().filter(function (value) { return value !== 'BIHQ'; }) : [employee.outlet];
    const requested = String(requestedOutlet || '').trim().toUpperCase();
    const outlet = isBihq && !requested ? '' : resolveStockOutlet_(employee, requested, outlets);
    const eventDate = normalizeDate_(requestedDate, true);
    if (eventDate > todayIso_()) throw new Error('Tanggal Showcase Log tidak boleh melebihi hari ini.');
    const totals = outlet ? readShowcaseLogTotals_(outlet, eventDate) : {};
    // Aging hanya dibutuhkan untuk tampilan hari ini. Hari lampau tetap ringan dan tidak menjalankan query tambahan.
    const aging = outlet && eventDate === todayIso_() ? readShowcaseAgingBreakdown_(outlet, eventDate) : {};
    const items = outlet ? readShowcaseItems_().map(function (item) {
      const day = totals[item.name.toLowerCase()] || {};
      const age = aging[String(item.code || '').trim().toUpperCase()] || aging['NAME|' + String(item.name || '').trim().toLowerCase()] || {};
      const emptyAging = { fresh: 0, green: 0, yellow: 0, red: 0 };
      return {
        code: item.code, displayCode: item.sourceCode || item.code, category: item.category, name: item.name, unit: item.unit,
        previousBalance: Number(day.previousBalance || 0), balance: Number(day.balance || 0),
        previousAging: eventDate === todayIso_() ? (age.previous || emptyAging) : null,
        balanceAging: eventDate === todayIso_() ? (age.balance || emptyAging) : null,
        totalIn: Number(day.totalIn || 0), totalSold: Number(day.totalSold || 0), totalWaste: Number(day.totalWaste || 0),
        inUsers: day.inUsers || '', soldUsers: day.soldUsers || '', wasteUsers: day.wasteUsers || ''
      };
    }).sort(function (a, b) {
      return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    }) : [];
    const task = findShowcaseLogTask_();
    const tasks = readTasksForEmployee_(employee);
    const completions = outlet ? readCompletionMap_(outlet) : {};
    return {
      user: userView_(employee), outlets: outlets, selectedOutlet: outlet, eventDate: eventDate,
      items: items, progress: outlet ? readShowcaseLogProgress_(outlet, eventDate) : null, taskId: task ? task.id : '',
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
            const storeInfo = 'Transfer To Showcase untuk Produk ' + entry.item.name + ' · Dari Store · QTY Showcase ' + formatQty_(entry.inQty) + ' ' + entry.item.unit;
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

/**
 * Breakdown umur stok Showcase berdasarkan TANGGAL MASUK SHOWCASE (event_date movement IN),
 * bukan tanggal kedatangan bahan di Store. Dipakai hanya untuk tanggal hari ini.
 * Bucket:
 * - fresh  : Hari H / masuk hari ini
 * - green  : H+1 / masuk kemarin (hari ke-2 di Showcase)
 * - yellow : H+2 / masuk 2 hari lalu (hari ke-3 di Showcase)
 * - red    : >H+2 / masuk 3 hari lalu atau lebih
 */
function readShowcaseAgingBreakdown_(outlet, eventDate) {
  const sql = 'WITH scoped AS (SELECT * FROM ' + stockCardTable_() + ' WHERE record_type = \'MOVEMENT\' ' +
    'AND outlet = @outlet AND location = \'Showcase\' AND event_date <= CAST(@eventDate AS DATE)), ' +
    'latest AS (SELECT * FROM scoped QUALIFY ROW_NUMBER() OVER (' +
    'PARTITION BY COALESCE(NULLIF(logical_id, \'\'), record_id) ORDER BY COALESCE(version, 1) DESC, created_at DESC) = 1) ' +
    'SELECT record_id,item_code,item_name,unit,CAST(event_date AS STRING) AS event_date,direction,qty,movement_type,info,' +
    'CAST(expiry_date AS STRING) AS expiry_date,CAST(source_arrival_date AS STRING) AS source_arrival_date,' +
    'CAST(production_date AS STRING) AS production_date,created_at FROM latest ' +
    'WHERE direction IN (\'IN\',\'OUT\',\'LOT\') AND qty IS NOT NULL AND qty > 0 ' +
    'ORDER BY item_code,item_name,event_date,created_at,record_id';
  const states = {};

  function stateFor(row) {
    const code = String(row.item_code || '').trim().toUpperCase();
    const name = String(row.item_name || '').trim();
    const key = code ? 'CODE|' + code : 'NAME|' + name.toLowerCase();
    if (!states[key]) states[key] = { code: code, name: name, lots: [], debt: 0, previous: null, todayStarted: false };
    return states[key];
  }
  function sortLots(lots) {
    lots.sort(function (a, b) {
      return String(a.expiryDate || '9999-12-31').localeCompare(String(b.expiryDate || '9999-12-31')) ||
        String(a.sourceDate || '').localeCompare(String(b.sourceDate || '')) ||
        String(a.entryDate || '').localeCompare(String(b.entryDate || '')) ||
        Number(a.createdAt || 0) - Number(b.createdAt || 0);
    });
  }
  function cloneLots(lots) {
    return (lots || []).filter(function (lot) { return Number(lot.qty || 0) > 0.0000001; }).map(function (lot) {
      return { qty: Number(lot.qty || 0), entryDate: String(lot.entryDate || ''), expiryDate: String(lot.expiryDate || ''), sourceDate: String(lot.sourceDate || ''), createdAt: Number(lot.createdAt || 0) };
    });
  }
  function ageDays(entryDate) {
    const from = Date.parse(String(entryDate || '').slice(0, 10) + 'T00:00:00Z');
    const to = Date.parse(String(eventDate || '').slice(0, 10) + 'T00:00:00Z');
    if (!isFinite(from) || !isFinite(to)) return 3;
    return Math.max(0, Math.floor((to - from) / 86400000));
  }
  function buckets(lots) {
    const result = { fresh: 0, green: 0, yellow: 0, red: 0 };
    (lots || []).forEach(function (lot) {
      const qty = Math.max(0, Number(lot.qty || 0));
      if (qty <= 0.0000001) return;
      const age = ageDays(lot.entryDate);
      if (age <= 0) result.fresh += qty;
      else if (age === 1) result.green += qty;
      else if (age === 2) result.yellow += qty;
      else result.red += qty;
    });
    Object.keys(result).forEach(function (key) { result[key] = Math.round(result[key] * 1000000) / 1000000; });
    return result;
  }
  function applyMovement(state, row) {
    const qty = Math.max(0, Number(row.qty || 0));
    if (qty <= 0.0000001) return;
    const direction = String(row.direction || '').toUpperCase();
    if (direction === 'LOT' && String(row.movement_type || '') === 'Lot Balance Override') {
      let override = null;
      try { override = JSON.parse(String(row.info || '')); } catch (error) {}
      if (override && Array.isArray(override.lots)) {
        state.lots = override.lots.filter(function (lot) { return Number(lot.qty || 0) > 0.0000001; }).map(function (lot) {
          return {
            qty: Number(lot.qty || 0),
            entryDate: String(lot.stockInDate || lot.showcaseDate || lot.arrivalDate || row.event_date || ''),
            expiryDate: String(lot.expiryDate || ''), sourceDate: String(lot.arrivalDate || ''), createdAt: Number(row.created_at || 0)
          };
        });
        state.debt = 0;
        sortLots(state.lots);
      }
      return;
    }
    if (direction === 'IN') {
      let remaining = qty;
      if (state.debt > 0.0000001) {
        const covered = Math.min(remaining, state.debt);
        state.debt -= covered;
        remaining -= covered;
      }
      if (remaining > 0.0000001) {
        state.lots.push({
          qty: remaining, entryDate: String(row.event_date || '').slice(0, 10), expiryDate: String(row.expiry_date || '').slice(0, 10),
          sourceDate: String(row.source_arrival_date || row.event_date || '').slice(0, 10), createdAt: Number(row.created_at || 0)
        });
        sortLots(state.lots);
      }
      return;
    }
    if (direction === 'OUT') {
      let remaining = qty;
      sortLots(state.lots);
      for (let i = 0; i < state.lots.length && remaining > 0.0000001; i++) {
        const available = Math.max(0, Number(state.lots[i].qty || 0));
        if (available <= 0.0000001) continue;
        const taken = Math.min(available, remaining);
        state.lots[i].qty = available - taken;
        remaining -= taken;
      }
      state.lots = state.lots.filter(function (lot) { return Number(lot.qty || 0) > 0.0000001; });
      if (remaining > 0.0000001) state.debt += remaining;
    }
  }

  runNamedQuery_(sql, { outlet: outlet, eventDate: eventDate }, { useQueryCache: false }).forEach(function (row) {
    const state = stateFor(row), rowDate = String(row.event_date || '').slice(0, 10);
    if (rowDate === eventDate && !state.todayStarted) {
      state.previous = buckets(cloneLots(state.lots));
      state.todayStarted = true;
    }
    applyMovement(state, row);
  });

  const result = {};
  Object.keys(states).forEach(function (key) {
    const state = states[key];
    const view = { previous: state.previous || buckets(cloneLots(state.lots)), balance: buckets(cloneLots(state.lots)) };
    if (state.code) result[state.code] = view;
    if (state.name) result['NAME|' + state.name.toLowerCase()] = view;
  });
  return result;
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
    if ((row.movement_type === 'Terjual' || row.movement_type === 'Sold') && Math.abs(signedQty) > 0.0000001) { item.totalSold -= signedQty; item.soldActors[actor] = true; }
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
  // Count unique source rows instead of physical movement rows. A single report row
  // can be split into several FIFO lots, but the progress tooltip should still say
  // "1 baris di-upload", not the number of lot fragments written to Stock Card.
  const sourceRowKey = 'CONCAT(COALESCE(source_file, \'\'), \'|\', COALESCE(source_hash, \'\'), \'|\', CAST(COALESCE(source_row, 0) AS STRING))';
  const sql = 'SELECT CAST(event_date AS STRING) AS event_date, ' +
    'COUNT(DISTINCT IF(movement_type = \'Goods Receipt\', ' + sourceRowKey + ', NULL)) AS goods_receipt_rows, ' +
    'COUNT(DISTINCT IF(movement_type IN (\'Terjual\', \'Sold\'), ' + sourceRowKey + ', NULL)) AS sales_usage_rows, ' +
    'COUNT(DISTINCT IF(movement_type = \'Item Journal\', ' + sourceRowKey + ', NULL)) AS item_journal_rows, ' +
    'COUNT(DISTINCT IF(movement_type = \'Transfer Out Antar Outlet\', ' + sourceRowKey + ', NULL)) AS goods_delivery_rows ' +
    'FROM ' + stockCardTable_() + ' ' +
    'WHERE record_type = \'MOVEMENT\' AND outlet = @outlet ' +
    'AND item_code IS NOT NULL AND item_code != \'\' AND qty IS NOT NULL ' +
    'AND event_date BETWEEN CAST(@startDate AS DATE) AND CAST(@endDate AS DATE) ' +
    'AND movement_type IN (\'Goods Receipt\', \'Terjual\', \'Sold\', \'Item Journal\', \'Transfer Out Antar Outlet\') ' +
    // SHOWCASE_LOG adalah input manual Showcase, bukan Upload Usage Penjualan.
    'AND source_file IS NOT NULL AND source_file != \'\' ' +
    'AND UPPER(COALESCE(source_file, \'\')) != \'SHOWCASE_LOG\' GROUP BY event_date';
  const statusByDate = {};
  runNamedQuery_(sql, { outlet: outlet, startDate: startDate, endDate: endDate }, { useQueryCache: false }).forEach(function (row) {
    const goodsReceiptRows = Number(row.goods_receipt_rows || 0);
    const salesUsageRows = Number(row.sales_usage_rows || 0);
    const itemJournalRows = Number(row.item_journal_rows || 0);
    const goodsDeliveryRows = Number(row.goods_delivery_rows || 0);
    statusByDate[String(row.event_date || '').slice(0, 10)] = {
      goodsReceipt: goodsReceiptRows > 0, goodsReceiptRows: goodsReceiptRows,
      salesUsage: salesUsageRows > 0, salesUsageRows: salesUsageRows,
      itemJournal: itemJournalRows > 0, itemJournalRows: itemJournalRows,
      goodsDelivery: goodsDeliveryRows > 0, goodsDeliveryRows: goodsDeliveryRows
    };
  });
  const days = [];
  for (let day = 1; day <= lastDay; day++) {
    const date = monthKey + '-' + String(day).padStart(2, '0');
    const state = statusByDate[date] || {
      goodsReceipt: false, goodsReceiptRows: 0,
      salesUsage: false, salesUsageRows: 0,
      itemJournal: false, itemJournalRows: 0,
      goodsDelivery: false, goodsDeliveryRows: 0
    };
    days.push({
      day: day, date: date, future: date > today,
      goodsReceipt: state.goodsReceipt, goodsReceiptRows: state.goodsReceiptRows,
      salesUsage: state.salesUsage, salesUsageRows: state.salesUsageRows,
      itemJournal: state.itemJournal, itemJournalRows: state.itemJournalRows,
      goodsDelivery: state.goodsDelivery, goodsDeliveryRows: state.goodsDeliveryRows,
      complete: state.goodsReceipt && state.salesUsage && state.itemJournal
    });
  }
  return { monthKey: monthKey, today: today, days: days };
}

function ensureStockUploadSummaryShowcaseIsolation_() {
  const properties = PropertiesService.getScriptProperties();
  const ready = function () {
    return properties.getProperty('STOCK_UPLOAD_SUMMARY_SHOWCASE_ISOLATION_V1') === '1' &&
      properties.getProperty('STOCK_UPLOAD_SUMMARY_ITEM_JOURNAL_V1') === '1';
  };
  if (ready()) return true;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(500)) return false;
  try {
    if (ready()) return true;
    // Satu kali backfill agar histori Item Journal lama langsung ikut terbaca di monitoring BIHQ.
    backfillStockUploadDailySummary();
    return true;
  } catch (error) {
    console.error('Gagal memperbarui ringkasan progress upload: ' + error.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

/** BIHQ-only day-by-day monitoring, derived from actual item movements. */
function getStockUploadMonitoring(token, monthKey) {
  return safe_(function () {
    const employee = requireAdmin_(token);
    ensureStockUploadSummaryShowcaseIsolation_();
    monthKey = /^\d{4}-\d{2}$/.test(String(monthKey || '')) ? String(monthKey) : todayIso_().slice(0, 7);
    const cacheKey = 'stock-upload-monitor-v2-' + monthKey, cached = readScriptJsonCache_(cacheKey);
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
      if (['goodsReceipt', 'salesUsage', 'itemJournal', 'goodsDelivery'].indexOf(type) < 0) return;
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
          itemJournal: state.itemJournal || { done: false, actualRows: 0, markerWithoutData: false },
          goodsDelivery: state.goodsDelivery || { done: false, actualRows: 0, markerWithoutData: false },
          complete: Boolean(state.goodsReceipt && state.goodsReceipt.done && state.salesUsage && state.salesUsage.done && state.itemJournal && state.itemJournal.done) });
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
  notifyPendingStockTransfers_(pendingRows);
}

function markStockTaskCompleteFromUploads_(context, periodKey, completedType) {
  try {
    if (['Goods Receipt', 'Terjual', 'Sold'].indexOf(completedType) < 0) return false;
    const otherTypes = completedType === 'Goods Receipt' ? ['Terjual', 'Sold'] : ['Goods Receipt'];
    const sql = 'SELECT COUNT(*) AS total FROM ' + stockCardTable_() + ' ' +
      'WHERE record_type = \'MOVEMENT\' AND outlet = @outlet AND item_code IS NOT NULL AND item_code != \'\' AND event_date = CAST(@periodKey AS DATE) ' +
      'AND movement_type IN UNNEST(SPLIT(@movementTypes, \'|\')) AND source_file IS NOT NULL AND source_file != \'\'';
    const rows = runNamedQuery_(sql, { outlet: context.outlet, periodKey: periodKey, movementTypes: otherTypes.join('|') });
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
      notifyPendingStockTransfers_(pendingRows);
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
        const expiryProvided = Object.prototype.hasOwnProperty.call(line, 'expiryDate');
        const expiryDate = expiryProvided ? normalizeDate_(line.expiryDate, false) : '';
        if (isNaN(receivedAt.getTime())) throw new Error('Waktu Terima wajib diisi.');
        if (isNaN(storageEnteredAt.getTime())) throw new Error('Waktu Masuk Storage wajib diisi.');
        if (storageEnteredAt.getTime() < receivedAt.getTime()) throw new Error('Waktu Masuk Storage tidak boleh lebih awal dari Waktu Terima.');
        if (!isFinite(productTemperature)) throw new Error('Suhu Produk wajib diisi dengan angka untuk setiap item.');
        receivedMap[lineId] = { qty: qty, receivedAt: receivedAt, storageEnteredAt: storageEnteredAt, productTemperature: productTemperature,
          expiryProvided: expiryProvided, expiryDate: expiryDate };
      });
      const firstReceivedKey = Object.keys(receivedMap)[0];
      if (firstReceivedKey) eventDate = Utilities.formatDate(receivedMap[firstReceivedKey].receivedAt, 'Asia/Jakarta', 'yyyy-MM-dd');
      const receiptNo = stockTransferReceiptNumber_(transfer), stockRows = [], acceptedRows = [], expiryWarnings = [];
      transfer.items.forEach(function (line) {
        const receipt = receivedMap[line.lineId];
        if (!receipt) throw new Error('Lengkapi QTY, waktu penerimaan, waktu masuk storage, dan suhu untuk setiap item.');
        const receivedQty = receipt.qty;
        const originalExpiryDate = normalizeDate_(line.expiryDate, false);
        const receivedExpiryDate = receipt.expiryProvided ? receipt.expiryDate : originalExpiryDate;
        if (originalExpiryDate && receipt.expiryProvided && !receivedExpiryDate) {
          throw new Error(line.code + ' · ' + line.name + ': Expired Date yang sudah ada tidak boleh dikosongkan. Silakan edit tanggalnya bila perlu.');
        }
        const item = { code: line.code, category: line.category, name: line.name, unit: line.unit };
        if (receivedQty > 0.0000001) {
          const expiryWarning = incomingFefoWarning_(outlet, receiveLocation, item, receivedExpiryDate);
          if (expiryWarning) expiryWarnings.push(expiryWarning);
          stockRows.push(stockTransferMovementRow_(transferId, outlet, receiveLocation, item, 'IN', receivedQty, 'Transfer In',
            'Transfer From ' + transfer.fromOutlet + ' / ' + transfer.fromLocation + ' · Ke ' + outlet + ' / ' + receiveLocation +
            ' · No Transfer ' + receiptNo + ' · QTY dikirim ' + formatQty_(line.qty) +
            (receivedExpiryDate !== originalExpiryDate ? ' · Expired penerima ' + (receivedExpiryDate || 'belum dicatat') + (originalExpiryDate ? ' (asal ' + originalExpiryDate + ')' : '') : '') +
            (line.note ? ' · ' + line.note : '') + (expiryWarning ? ' | FEFO ALERT: expiry masuk ' + expiryWarning.incomingExpiryDate + ' lebih cepat dari stok existing ' + expiryWarning.existingExpiryDate : ''), receivedExpiryDate, employee, now, eventDate, line.productionDate));
        }
        const eventId = Utilities.getUuid();
        acceptedRows.push({ insertId: eventId, json: {
          event_id: eventId, transfer_id: transferId, status: 'ACCEPTED', from_outlet: transfer.fromOutlet, from_location: transfer.fromLocation,
          to_outlet: outlet, to_location: receiveLocation, item_code: line.code, category: line.category, item_name: line.name,
          unit: line.unit, qty: Number(line.qty || 0), received_qty: receivedQty, note: line.note || '', expiry_date: receivedExpiryDate || null,
          created_by: transfer.createdBy, created_by_name: transfer.createdByName, created_at: now.getTime() / 1000,
          accepted_by: employee.nik, accepted_by_name: employee.name, accepted_at: now.getTime() / 1000,
          received_at: receipt.receivedAt.getTime() / 1000, storage_entered_at: receipt.storageEnteredAt.getTime() / 1000,
          product_temperature: receipt.productTemperature, receipt_no: receiptNo, delivery_date: transfer.deliveryDate || null,
          source_event_id: line.lineId || null
        }});
        line.receivedQty = receivedQty;
        line.receivedAt = receipt.receivedAt.toISOString();
        line.storageEnteredAt = receipt.storageEnteredAt.toISOString();
        line.productTemperature = receipt.productTemperature;
        line.expiryDate = receivedExpiryDate;
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

function recalculateStockFifoFefo(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const item = findStockItemForLocation_(context.location, payload.itemCode || payload.itemName);
    const days = Number(payload.days);
    const requestedStartDate = normalizeDate_(payload.startDate, false);
    if (!requestedStartDate && [7, 30].indexOf(days) < 0) throw new Error('Pilih periode 7 hari, 30 hari, atau isi tanggal mulai rekalkulasi.');

    const lock = acquireStockWriteLock_();
    try {
      const history = readStockHistoryForFifoRecalculation_(context.outlet, context.location, item);
      if (!history.length) throw new Error('Riwayat Stock Card item ini masih kosong.');
      const today = todayIso_();
      const startDate = requestedStartDate || stockDefaultRecalcStartDate_(today, days);
      if (startDate > today) throw new Error('Tanggal mulai Recalculate tidak boleh lebih besar dari hari ini.');
      const statusBefore = stockFifoFefoStatus_(history, item);
      if (!requestedStartDate && statusBefore.recommendedStartDate && statusBefore.recommendedStartDate < startDate) {
        throw new Error('Ada perubahan histori sejak ' + statusBefore.recommendedStartDate + ' yang berada di luar periode ' + days + ' hari. Gunakan periode yang lebih panjang atau pilih Dari Tanggal Perubahan.');
      }
      // Baseline is one day before the selected start date. The marker is written there
      // so every IN/OUT from startDate onward can be replayed in FEFO order.
      const baselineDate = stockDateOffset_(startDate, -1);
      const snapshots = calculateFifoSnapshots_(history);
      const snapshotDates = Object.keys(snapshots).sort();
      const baselineSnapshotDate = snapshotDates.filter(function (date) { return date <= baselineDate; }).pop() || '';
      const currentSnapshotDate = snapshotDates.length ? snapshotDates[snapshotDates.length - 1] : '';
      const baselineBalance = stockBalanceAtDate_(history, baselineDate);
      const baselineLots = baselineSnapshotDate ? reconcileFifoLots_(snapshots[baselineSnapshotDate], baselineBalance) : [];
      const currentQty = getCurrentStock_(context.outlet, context.location, item.code, item.name).qty;
      const currentLots = currentSnapshotDate ? reconcileFifoLots_(snapshots[currentSnapshotDate], currentQty) : [];
      const recalculatedLots = applyKnownExpiryToBaselineLots_(baselineLots, currentLots);
      const now = new Date();
      const recordId = Utilities.getUuid();
      const recalculation = {
        mode: 'FEFO',
        days: requestedStartDate ? null : days,
        baselineDate: baselineDate,
        startDate: startDate,
        endDate: today,
        calculatedAt: now.toISOString(),
        requestedFromChangeDate: Boolean(requestedStartDate)
      };
      const overrideLots = recalculatedLots.map(function (lot) {
        return {
          qty: Number(lot.qty || 0),
          productionDate: String(lot.productionDate || '').slice(0, 10),
          arrivalDate: lot.sourceDate || baselineDate,
          stockInDate: lot.showcaseDate || lot.sourceDate || baselineDate,
          expiryDate: String(lot.expiryDate || '').slice(0, 10)
        };
      }).sort(compareStockLotsFefo_);
      const periodLabel = requestedStartDate ? 'Dari ' + startDate : days + ' Hari';
      const info = JSON.stringify({
        note: 'Recalculate FIFO & FEFO ' + periodLabel,
        recalculation: recalculation,
        uncoveredQty: Math.max(0, -baselineBalance),
        lots: overrideLots
      });
      insertStockCardRows_([{ insertId: recordId, json: {
        record_id: recordId, logical_id: recordId, version: 1, record_type: 'MOVEMENT',
        outlet: context.outlet, location: context.location, item_code: item.code, category: item.category,
        item_name: item.name, unit: item.unit, direction: 'LOT', qty: Math.max(0, baselineBalance),
        movement_type: 'Lot Balance Override', info: info, event_date: baselineDate,
        created_at: now.getTime() / 1000, created_by: context.employee.nik,
        source_file: 'FIFO_FEFO_RECALC', source_row: requestedStartDate ? 0 : days
      }}]);
      return {
        recalculated: true,
        mode: 'FEFO',
        itemCode: item.code,
        itemName: item.name,
        days: requestedStartDate ? null : days,
        periodLabel: periodLabel,
        baselineDate: baselineDate,
        startDate: startDate,
        endDate: today,
        baselineQty: baselineBalance,
        lotCount: overrideLots.length
      };
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
      const rawQty = factor ? safeWipMaterialQty_(recipe.qty, formulaQty, factor, recipe.code + ' · ' + recipe.name) : 0;
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

function isBakerzinHqName_(value) {
  const raw = cleanText_(value, 180);
  if (!raw) return false;
  const normalized = raw.toUpperCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized === 'BIHQ' || /^BAKERZIN\s+(HQ|HEAD\s*OFFICE)\b/.test(normalized);
}

function shouldSkipBakerzinGoodsReceiptOrigin_(origin) {
  const raw = cleanText_(origin, 180);
  return /^BAKERZIN\b/i.test(raw) && !isBakerzinHqName_(raw);
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
    if (status !== 'AUTHORIZED' || shouldSkipBakerzinGoodsReceiptOrigin_(origin)) return;
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
  if (!rows.length) throw new Error('Tidak ada baris Goods Receipt yang dapat di-upload. Hanya Status Authorized dan Origin non-Bakerzin yang diproses; Bakerzin HQ tetap dihitung.');
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
    const resolvedOrigin = fixedOrigin || cleanText_(reportCell_(cells, header, 'ORIGIN', rowNumber), 180) || lastSupplier;
    if (status !== 'AUTHORIZED' || shouldSkipBakerzinGoodsReceiptOrigin_(resolvedOrigin)) return;
    const qty = parseReportNumber_(reportCell_(cells, header, 'QTY', rowNumber));
    if (!isFinite(qty) || qty < 0) {
      invalidQty.push(code + ' · baris ' + rowNumber);
      return;
    }
    if (qty <= 0.0000001) return;
    const destination = cleanText_(reportCell_(cells, header, 'DESTINATION', rowNumber), 160) || lastDestination;
    if (!destination) throw new Error('Destination tidak ditemukan pada baris ' + rowNumber + '.');
    lastDestination = destination;
    const supplier = resolvedOrigin;
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
  if (!rows.length) throw new Error('Tidak ada baris Goods Receipt yang dapat di-upload. Hanya Status Authorized yang diproses; Origin Bakerzin selain Bakerzin HQ dilewati.');
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
  let text = String(value === null || value === undefined ? '' : value).trim().replace(/[\s\u00A0]/g, '');
  if (!text) return NaN;

  // Excel kadang menyimpan angka kecil sebagai scientific notation. Jangan hapus titik
  // pada 1.5E-2 karena itu akan berubah menjadi 15E-2 (10x lebih besar).
  if (/^[+-]?\d+(?:[.,]\d+)?[eE][+-]?\d+$/.test(text)) {
    return Number(text.replace(',', '.'));
  }

  const comma = text.lastIndexOf(','), dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    // Separator paling kanan dianggap decimal separator; separator lain thousands.
    if (comma > dot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (comma >= 0) {
    // Report ESB Indonesia lazim memakai koma sebagai decimal separator.
    text = text.replace(',', '.');
  } else if ((text.match(/\./g) || []).length > 1) {
    // Jika ada banyak titik, titik terakhir adalah decimal bila group terakhir bukan 3 digit;
    // selain itu perlakukan sebagai thousands separator.
    const parts = text.split('.'), tail = parts[parts.length - 1];
    text = tail.length === 3 ? parts.join('') : parts.slice(0, -1).join('') + '.' + tail;
  }
  return Number(text);
}

function safeSalesSourceQty_(qty, product, rowNumber) {
  qty = Number(qty);
  if (!isFinite(qty) || qty < 0) throw new Error((product || 'Product') + ' baris ' + rowNumber + ': QTY Sales COGS tidak valid.');
  // Safety net untuk mencegah angka korup (mis. ratusan miliar) masuk BigQuery.
  // Batas ini sangat jauh di atas penggunaan item per satu baris transaksi restoran.
  if (qty > 1000000) throw new Error((product || 'Product') + ' baris ' + rowNumber + ': QTY terbaca tidak wajar (' + qty + '). Download ulang report ESB dan verifikasi format angka.');
  return qty;
}

function safeSalesConvertedQty_(qty, factor, row, item) {
  qty = safeSalesSourceQty_(qty, row && row.product, row && row.sourceRow);
  factor = Number(factor);
  if (!isFinite(factor) || factor <= 0 || factor > 1000000) {
    throw new Error((row && row.product || item && item.name || 'Product') + ' baris ' + (row && row.sourceRow || '-') + ': faktor konversi unit tidak wajar (' + factor + ').');
  }

  const reportUnit = normalizeUnit_(row && row.unit), defaultUnit = normalizeUnit_(item && item.unit);
  const intrinsicFactor = intrinsicStockUnitConversionFactor_(reportUnit, defaultUnit);
  if (reportUnit && defaultUnit && reportUnit !== defaultUnit && intrinsicFactor) {
    const tolerance = Math.max(0.0000000001, Math.abs(intrinsicFactor) * 0.000001);
    if (Math.abs(factor - intrinsicFactor) > tolerance) {
      throw new Error((row && row.product || item && item.name || 'Product') + ' baris ' + (row && row.sourceRow || '-') +
        ': konversi ' + reportUnit + ' ke ' + defaultUnit + ' tidak sesuai ukuran kemasan. Faktor wajib ' + intrinsicFactor +
        ', bukan ' + factor + '. Upload dihentikan.');
    }
  }

  const converted = qty * factor;
  if (!isFinite(converted) || converted < 0 || converted > 100000000) {
    throw new Error((row && row.product || item && item.name || 'Product') + ' baris ' + (row && row.sourceRow || '-') + ': hasil QTY setelah konversi tidak wajar (' + converted + ' ' + (item && item.unit || '') + '). Upload dihentikan agar stock tidak rusak.');
  }
  // Jika unit report sama dengan Unit Default, QTY wajib identik. Tidak ada saved conversion
  // yang boleh mengubah nilai pada jalur ini.
  if (normalizeUnit_(row && row.unit) === normalizeUnit_(item && item.unit) && Math.abs(converted - qty) > 0.0000001) {
    throw new Error((row && row.product || item && item.name || 'Product') + ' baris ' + (row && row.sourceRow || '-') + ': QTY berubah padahal unit sama (' + row.unit + '). Upload dihentikan.');
  }
  return converted;
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
  const defaults = {
    'KG|GR': 1000, 'GR|KG': 0.001,
    'L|ML': 1000, 'LT|ML': 1000, 'LTR|ML': 1000,
    'ML|L': 0.001, 'ML|LT': 0.001, 'ML|LTR': 0.001,
    'L|LT': 1, 'LT|L': 1, 'L|LTR': 1, 'LTR|L': 1, 'LT|LTR': 1, 'LTR|LT': 1
  };
  return Number(defaults[pair] || 0);
}

/**
 * Unit seperti PCK@1LT / BTL@250ML membawa ukuran kemasan di nama unit.
 * Nilainya dapat dikonversi secara deterministik tanpa mempercayai faktor manual.
 * Base volume = ML, base mass = GR.
 */
function stockUnitMeasureProfile_(unit) {
  const normalized = normalizeUnit_(unit);
  if (!normalized) return null;
  const measureBase = function (measure) {
    measure = String(measure || '').toUpperCase();
    if (measure === 'ML') return { dimension: 'VOLUME', baseQty: 1 };
    if (measure === 'L' || measure === 'LT' || measure === 'LTR') return { dimension: 'VOLUME', baseQty: 1000 };
    if (measure === 'GR' || measure === 'G') return { dimension: 'MASS', baseQty: 1 };
    if (measure === 'KG') return { dimension: 'MASS', baseQty: 1000 };
    return null;
  };

  const plain = measureBase(normalized);
  if (plain) return { dimension: plain.dimension, baseQty: plain.baseQty, packaged: false, unit: normalized };

  const match = /^([^@]+)@([0-9]+(?:[.,][0-9]+)?)(ML|L|LT|LTR|GR|G|KG)$/.exec(normalized);
  if (!match) return null;
  const amount = Number(String(match[2]).replace(',', '.'));
  const measure = measureBase(match[3]);
  if (!measure || !isFinite(amount) || amount <= 0) return null;
  return {
    dimension: measure.dimension,
    baseQty: amount * measure.baseQty,
    packaged: true,
    packageUnit: match[1],
    unit: normalized
  };
}

function intrinsicStockUnitConversionFactor_(fromUnit, toUnit) {
  const from = stockUnitMeasureProfile_(fromUnit), to = stockUnitMeasureProfile_(toUnit);
  if (!from || !to || from.dimension !== to.dimension || !from.baseQty || !to.baseQty) return 0;
  const factor = from.baseQty / to.baseQty;
  return isFinite(factor) && factor > 0 ? factor : 0;
}

function resolveUnitConversionFactor_(itemCode, fromUnit, toUnit, provided, saved) {
  fromUnit = normalizeUnit_(fromUnit); toUnit = normalizeUnit_(toUnit);
  if (fromUnit === toUnit) return 1;

  // Konversi yang bisa dibuktikan dari nama unit selalu lebih dipercaya daripada
  // faktor manual/saved. Contoh: 120 ML -> PCK@1LT = 0,12 PCK@1LT.
  const intrinsic = intrinsicStockUnitConversionFactor_(fromUnit, toUnit);
  if (intrinsic) return intrinsic;

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

function stockHistoryMonthBounds_(requestedMonth) {
  const currentMonth = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM');
  let month = String(requestedMonth || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month) || month > currentMonth) month = currentMonth;
  const parts = month.split('-'), year = Number(parts[0]), monthIndex = Number(parts[1]) - 1;
  if (!isFinite(year) || !isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) month = currentMonth;
  const validParts = month.split('-'), validYear = Number(validParts[0]), validMonthIndex = Number(validParts[1]) - 1;
  const next = new Date(validYear, validMonthIndex + 1, 1, 12, 0, 0);
  return {
    month: month,
    start: month + '-01',
    end: Utilities.formatDate(next, 'Asia/Jakarta', 'yyyy-MM-dd'),
    currentMonth: currentMonth
  };
}

function stockHistoryItemCondition_(location) {
  return isShowcaseLocation_(location)
    ? 'item_name = @item'
    : '((item_code = @code) OR ((item_code IS NULL OR item_code = \'\') AND item_name = @item))';
}

function mapStockHistoryQueryRow_(r) {
  return {
    recordId: String(r.record_id || ''), logicalId: String(r.logical_id || r.record_id || ''), version: Number(r.version || 1),
    date: String(r.event_date || ''), direction: String(r.direction || ''), qty: Number(r.qty || 0),
    movementType: String(r.movement_type || ''), info: String(r.info || ''), productionDate: String(r.production_date || ''), expiryDate: String(r.expiry_date || ''),
    sourceArrivalDate: String(r.source_arrival_date || ''), supplier: String(r.supplier || ''),
    sourceFile: String(r.source_file || ''), sourceRow: Number(r.source_row || 0),
    transferId: String(r.transfer_id || ''), systemGenerated: Boolean(r.transfer_id),
    createdBy: String(r.created_by || ''), createdAt: String(r.created_at || '')
  };
}

function stockHistorySelectFields_() {
  return 'record_id, COALESCE(NULLIF(logical_id, \'\'), record_id) AS logical_id, COALESCE(version, 1) AS version, ' +
    'event_date, direction, qty, movement_type, info, production_date, expiry_date, source_arrival_date, transfer_id, supplier, source_file, source_row, created_by, created_at';
}

function readStockHistoryMonthRows_(outlet, location, item, bounds) {
  const sql = latestStockMovementCte_() + ' SELECT ' + stockHistorySelectFields_() + ' FROM latest ' +
    'WHERE outlet = @outlet AND location = @location AND ' + stockHistoryItemCondition_(location) + ' ' +
    'AND event_date >= CAST(@monthStart AS DATE) AND event_date < CAST(@monthEnd AS DATE) ' +
    'ORDER BY event_date DESC, created_at DESC';
  return runNamedQuery_(sql, { outlet: outlet, location: location, code: item.code, item: item.name, monthStart: bounds.start, monthEnd: bounds.end })
    .map(mapStockHistoryQueryRow_);
}

function readStockHistoryBeforeMonthRows_(outlet, location, item, monthStart) {
  const sql = latestStockMovementCte_() + ' SELECT ' + stockHistorySelectFields_() + ' FROM latest ' +
    'WHERE outlet = @outlet AND location = @location AND ' + stockHistoryItemCondition_(location) + ' ' +
    'AND event_date < CAST(@monthStart AS DATE) ORDER BY event_date DESC, created_at DESC LIMIT 500';
  return runNamedQuery_(sql, { outlet: outlet, location: location, code: item.code, item: item.name, monthStart: monthStart })
    .map(mapStockHistoryQueryRow_);
}

function readStockNetMovementFromDate_(outlet, location, item, startDate) {
  const sql = latestStockMovementCte_() + ' SELECT COALESCE(SUM(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END), 0) AS net_qty ' +
    'FROM latest WHERE outlet = @outlet AND location = @location AND ' + stockHistoryItemCondition_(location) + ' ' +
    'AND event_date >= CAST(@startDate AS DATE)';
  const rows = runNamedQuery_(sql, { outlet: outlet, location: location, code: item.code, item: item.name, startDate: startDate });
  return rows.length ? Number(rows[0].net_qty || 0) : 0;
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
    const bounds = stockHistoryMonthBounds_(payload.month);

    // Current QTY may come from the fast Stock API, while detail rows are always scoped
    // to the requested month so opening a Stock Card no longer ships the latest 500 rows to the browser.
    const fastHistory = isShowcaseLocation_(location) ? null : readFastStockHistory_(outlet, location, item);
    const currentQty = fastHistory ? Number(fastHistory.currentQty || 0) : getCurrentStock_(outlet, location, item.code, item.name).qty;
    let monthRows = readStockHistoryMonthRows_(outlet, location, item, bounds);
    let priorRows = readStockHistoryBeforeMonthRows_(outlet, location, item, bounds.start);
    let fifoInput = priorRows.concat(monthRows);
    if (isShowcaseLocation_(location)) fifoInput = enrichShowcaseHistoryLots_(fifoInput, outlet, item);

    const monthStart = bounds.start, monthEnd = bounds.end;
    const visibleRows = fifoInput.filter(function (row) {
      const date = String(row.date || '').slice(0, 10);
      return date >= monthStart && date < monthEnd;
    });
    const netAfterPeriod = bounds.month === bounds.currentMonth ? 0 : readStockNetMovementFromDate_(outlet, location, item, bounds.end);
    const periodClosingQty = currentQty - netAfterPeriod;
    const snapshots = calculateFifoSnapshots_(fifoInput);
    const dayNet = {};
    visibleRows.forEach(function (row) {
      if (row.direction !== 'IN' && row.direction !== 'OUT') return;
      const date = String(row.date || '').slice(0, 10);
      dayNet[date] = Number(dayNet[date] || 0) + (row.direction === 'IN' ? Number(row.qty || 0) : -Number(row.qty || 0));
    });
    const fifoLotsByDate = {}, visibleDates = Object.keys(dayNet).sort().reverse();
    let runningBalance = periodClosingQty;
    visibleDates.forEach(function (date) {
      fifoLotsByDate[date] = reconcileFifoLots_(snapshots[date] || [], runningBalance);
      runningBalance -= Number(dayNet[date] || 0);
    });

    const employeeNames = readEmployeeNameMap_();
    visibleRows.forEach(function (row) { row.createdByUser = employeeNames[row.createdBy] || row.createdBy || 'User tidak diketahui'; });
    let currentLots = null;
    if (payload.includeCurrentLots) {
      let currentHistory = fastHistory && Array.isArray(fastHistory.history) ? fastHistory.history : readLatestStockHistory_(outlet, location, item);
      if (isShowcaseLocation_(location)) currentHistory = enrichShowcaseHistoryLots_(currentHistory, outlet, item);
      const currentSnapshots = calculateFifoSnapshots_(currentHistory), currentDates = Object.keys(currentSnapshots).sort();
      currentLots = reconcileFifoLots_(currentDates.length ? currentSnapshots[currentDates[currentDates.length - 1]] : [], currentQty);
    }

    const fifoFefoStatus = stockFifoFefoStatus_(readStockHistoryForFifoRecalculation_(outlet, location, item), item);
    return {
      item: item, outlet: outlet, location: location, currentQty: currentQty,
      month: bounds.month, periodClosingQty: periodClosingQty,
      history: visibleRows, fifoLotsByDate: fifoLotsByDate,
      hasPrevious: priorRows.length > 0, hasNext: bounds.month < bounds.currentMonth,
      currentLots: currentLots,
      fifoFefoStatus: fifoFefoStatus,
      fastSource: fastHistory && fastHistory.meta ? fastHistory.meta.source : 'BIGQUERY_MONTHLY'
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

function parseWipRecipeNumber_(value) {
  if (typeof value === 'number') return value;
  let text = String(value === null || value === undefined ? '' : value).trim().replace(/[\s\u00a0]/g, '');
  if (!text) return NaN;
  const comma = text.lastIndexOf(','), dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    // Terima format US (1,111.11) maupun Indonesia (1.111,11).
    if (dot > comma) text = text.replace(/,/g, '');
    else text = text.replace(/\./g, '').replace(',', '.');
  } else if (comma >= 0) {
    text = text.replace(',', '.');
  }
  return Number(text);
}

function safeWipMaterialQty_(recipeQty, formulaQty, factor, label) {
  const recipe = Number(recipeQty), formula = Number(formulaQty), conversion = Number(factor);
  if (!isFinite(recipe) || recipe <= 0 || !isFinite(formula) || formula < 0 || !isFinite(conversion) || conversion <= 0) {
    throw new Error((label || 'WIP') + ': angka resep / formula / konversi tidak valid.');
  }
  const qty = recipe * formula * conversion;
  if (!isFinite(qty) || qty < 0 || qty > 1000000000) {
    throw new Error((label || 'WIP') + ': hasil perhitungan bahan tidak wajar (' + String(qty) + '). Periksa QTY resep dan Unit Konversi sebelum upload.');
  }
  return Math.round(qty * 1000000000000) / 1000000000000;
}

function readWipRecipeCatalog_() {
  const sheet = ensureWipRecipeSheet_(), result = { variants: [], byCode: {}, invalidRowsSkipped: 0 };
  if (sheet.getLastRow() < 2) return result;
  // Gunakan raw value agar angka resep tidak berubah menjadi string berformat locale
  // seperti 1,111.11 / 1.111,11 saat dibaca dari Google Sheets.
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  const variants = {};
  rows.forEach(function (row, index) {
    const code = cleanText_(row[0], 80).toUpperCase(), name = cleanText_(row[1], 180), finishedUnit = normalizeUnit_(row[2]);
    const materialCode = cleanText_(row[3], 80).toUpperCase(), materialName = cleanText_(row[4], 180);
    const qty = parseWipRecipeNumber_(row[5]), materialUnit = normalizeUnit_(row[6]);
    if (!code || !name || !finishedUnit || !materialCode || materialCode === '0' || !materialName || materialName === '0' ||
        !isFinite(qty) || qty <= 0 || qty > 1000000 || !materialUnit || materialUnit === '0' || materialUnit === '-') {
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
      const rawQty = factor ? safeWipMaterialQty_(recipe.qty, formulaQty, factor, recipe.code + ' · ' + recipe.name) : 0;
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

function wipProductionSourceType_(sourceFile) {
  const source = String(sourceFile || '');
  if (/^SALES_COGS\|/i.test(source)) return 'AUTO_SALES';
  if (/^WIP_PRODUCTION\|/i.test(source)) return 'TEMPLATE';
  return 'MANUAL';
}

function wipProductionSourceLabel_(sourceFile) {
  const type = wipProductionSourceType_(sourceFile);
  return type === 'AUTO_SALES' ? 'Auto Generated By Upload Penjualan' :
    type === 'TEMPLATE' ? 'By Upload Template' : 'Manual Input';
}

function getWipProductionHistory(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    if (isShowcaseLocation_(context.location)) throw new Error('History Produksi WIP tidak tersedia untuk penyimpanan Showcase.');
    const date = normalizeDate_(payload.date || todayIso_(), true);
    const sql = latestStockMovementCte_() +
      ' SELECT transfer_id,logical_id,record_id,item_code,item_name,unit,qty,production_date,expiry_date,event_date,source_file,source_hash,source_row,created_at ' +
      'FROM latest WHERE outlet=@outlet AND location=@location AND movement_type=\'Production\' AND qty>0.0000001 ' +
      'AND CAST(COALESCE(production_date,event_date) AS DATE)=CAST(@date AS DATE) ' +
      'ORDER BY COALESCE(production_date,event_date) DESC,created_at DESC,item_name';
    const rows = runNamedQuery_(sql, { outlet: context.outlet, location: context.location, date: date }, { useQueryCache: false }).map(function (row) {
      const productionId = String(row.transfer_id || row.logical_id || row.record_id || '');
      const sourceFile = String(row.source_file || '');
      return {
        productionId: productionId, code: String(row.item_code || ''), name: String(row.item_name || ''),
        unit: String(row.unit || ''), qty: Number(row.qty || 0), productionDate: String(row.production_date || ''),
        expiryDate: String(row.expiry_date || ''), eventDate: String(row.event_date || ''), sourceFile: sourceFile,
        sourceType: wipProductionSourceType_(sourceFile), sourceLabel: wipProductionSourceLabel_(sourceFile)
      };
    });
    return { date: date, outlet: context.outlet, location: context.location, rows: rows };
  });
}

function wipProductionMaterialDetails_(outlet, location, usageRows) {
  usageRows = (usageRows || []).filter(function (row) { return Number(row.qty || 0) > 0.0000001; });
  if (!usageRows.length) return [];
  const resolved = [], unresolved = [], byCode = {};
  usageRows.forEach(function (row) {
    if (row.source_arrival_date || row.production_date || row.expiry_date) {
      resolved.push({
        code: String(row.item_code || ''), name: String(row.item_name || ''), unit: String(row.unit || ''),
        qty: Number(row.qty || 0), arrivalDate: String(row.source_arrival_date || ''),
        productionDate: String(row.production_date || ''), expiryDate: String(row.expiry_date || '')
      });
    } else {
      unresolved.push(row);
      const code = String(row.item_code || '').toUpperCase();
      if (code) byCode[code] = true;
    }
  });
  const codes = Object.keys(byCode), movementMap = {};
  if (codes.length) {
    const sql = latestStockMovementCte_() +
      ' SELECT record_id,COALESCE(NULLIF(logical_id,\'\'),record_id) AS logical_id,COALESCE(version,1) AS version,' +
      'item_code,item_name,event_date,direction,qty,movement_type,info,production_date,expiry_date,source_arrival_date,' +
      'transfer_id,supplier,source_file,source_row,created_by,created_at FROM latest ' +
      'WHERE outlet=@outlet AND location=@location AND item_code IN UNNEST(@codes) ORDER BY item_code,event_date,created_at';
    const histories = {};
    runNamedQuery_(sql, { outlet: outlet, location: location, codes: codes }, { useQueryCache: false }).forEach(function (raw) {
      const code = String(raw.item_code || '').toUpperCase();
      if (!histories[code]) histories[code] = [];
      histories[code].push(salesHistoryRowFromQuery_(raw));
    });
    Object.keys(histories).forEach(function (code) {
      const history = histories[code];
      calculateFifoSnapshots_(history);
      history.forEach(function (movement) {
        if (movement.recordId) movementMap['R|' + movement.recordId] = movement;
        if (movement.logicalId) movementMap['L|' + movement.logicalId] = movement;
      });
    });
  }
  unresolved.forEach(function (row) {
    const movement = movementMap['R|' + String(row.record_id || '')] || movementMap['L|' + String(row.logical_id || '')];
    const lots = movement && Array.isArray(movement.fifoUsageLots) ? movement.fifoUsageLots : [];
    if (lots.length) {
      lots.forEach(function (lot) {
        resolved.push({
          code: String(row.item_code || ''), name: String(row.item_name || ''), unit: String(row.unit || ''),
          qty: Number(lot.qty || 0), arrivalDate: String(lot.sourceDate || ''),
          productionDate: String(lot.productionDate || ''), expiryDate: String(lot.expiryDate || '')
        });
      });
    } else {
      resolved.push({
        code: String(row.item_code || ''), name: String(row.item_name || ''), unit: String(row.unit || ''),
        qty: Number(row.qty || 0), arrivalDate: '', productionDate: '', expiryDate: ''
      });
    }
  });
  const grouped = {}, order = [];
  resolved.forEach(function (row) {
    const key = [row.code, row.name, row.unit, row.arrivalDate, row.productionDate, row.expiryDate].join('|');
    if (!grouped[key]) { grouped[key] = Object.assign({}, row, { qty: 0 }); order.push(key); }
    grouped[key].qty += Number(row.qty || 0);
  });
  return order.map(function (key) { return grouped[key]; });
}

function getWipProductionDetail(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location), productionId = cleanText_(payload.productionId, 100);
    const rows = readLatestProductionRows_(context.outlet, context.location, productionId), output = rows.filter(function (row) { return row.movement_type === 'Production' && Number(row.qty || 0) > 0; })[0];
    if (!output) throw new Error('Data produksi tidak ditemukan atau sudah dibatalkan.');
    const recipeMatch = /Resep\s+(.+?)\s+·\s+Formula/i.exec(String(output.info || ''));
    const sourceFile = String(output.source_file || '');
    return {
      productionId: productionId,
      sourceType: wipProductionSourceType_(sourceFile),
      sourceLabel: wipProductionSourceLabel_(sourceFile),
      line: {
        code: String(output.item_code || ''), name: String(output.item_name || ''), qty: Number(output.qty || 0), unit: String(output.unit || ''),
        variantKey: recipeMatch ? recipeMatch[1].trim() : '', productionDate: String(output.production_date || ''),
        expiryDate: String(output.expiry_date || ''), eventDate: String(output.event_date || '')
      },
      materials: wipProductionMaterialDetails_(context.outlet, context.location, rows.filter(function (row) {
        return row.movement_type === 'WIP Material Usage' && Number(row.qty || 0) > 0;
      }))
    };
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
  if (infrastructureCache.get('stock-card-infrastructure-v17') === 'ready') return;
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
    bqField_('delivery_date', 'DATE'), bqField_('source_event_id', 'STRING')
  ]);
  infrastructureCache.put('stock-card-infrastructure-v17', 'ready', 21600);
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
      'AND movement_type IN (\'Goods Receipt\', \'Terjual\', \'Sold\') AND source_file IS NOT NULL AND source_file != \'\' ' +
      'GROUP BY outlet, event_date HAVING MAX(IF(movement_type = \'Goods Receipt\', 1, 0)) = 1 ' +
      'AND MAX(IF(movement_type IN (\'Terjual\', \'Sold\'), 1, 0)) = 1';
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
      notifyPendingStockTransfers_(pendingRows);
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
    const destinationEntry = storeDirectory.byName[normalizeStoreName_(row.destinationName)] ||
      (isBakerzinHqName_(row.destinationName) ? (storeDirectory.byCode.BIHQ || null) : null);
    if (!destinationEntry) throw new Error('Outlet tujuan "' + row.destinationName + '" pada kolom G baris ' + row.sourceRow + ' belum terdaftar di sheet STORE CODE.');
    // Bakerzin HQ (BIHQ) tetap merupakan tujuan Goods Delivery yang valid walaupun
    // tidak muncul sebagai outlet aktif operasional pada EMP_LIST.
    if (activeOutlets.indexOf(destinationEntry.code) < 0 && destinationEntry.code !== 'BIHQ') throw new Error('Outlet tujuan ' + destinationEntry.name + ' (' + destinationEntry.code + ') tidak aktif.');
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
  return 'event_id, transfer_id, status, from_outlet, from_location, to_outlet, to_location, item_code, category, item_name, unit, qty, received_qty, note, expiry_date, delivery_date, created_by, created_by_name, created_at, accepted_by, accepted_by_name, accepted_at, received_at, storage_entered_at, product_temperature, rejected_by, rejected_by_name, rejected_at, rejection_reason, receipt_no, photo_file_ids, photo_count, source_event_id';
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
    const receivedQueues = {}, receivedBySource = {};
    accepted.forEach(function (row) {
      const receipt = {
        qty: Number(row.received_qty === null || row.received_qty === undefined ? row.qty : row.received_qty),
        receivedAt: String(row.received_at || ''),
        storageEnteredAt: String(row.storage_entered_at || ''),
        productTemperature: row.product_temperature === null || row.product_temperature === undefined ? null : Number(row.product_temperature),
        expiryDate: String(row.expiry_date || '').slice(0, 10)
      };
      const sourceEventId = String(row.source_event_id || '');
      if (sourceEventId) receivedBySource[sourceEventId] = receipt;
      const key = stockTransferLineKey_(row.item_code, row.expiry_date);
      if (!receivedQueues[key]) receivedQueues[key] = [];
      receivedQueues[key].push(receipt);
    });
    transfer.items.forEach(function (item) {
      let receipt = receivedBySource[item.lineId] || null;
      if (!receipt) {
        const queue = receivedQueues[stockTransferLineKey_(item.code, item.expiryDate)] || [];
        receipt = queue.length ? queue.shift() : null;
      }
      item.receivedQty = receipt ? receipt.qty : Number(item.qty || 0);
      item.receivedAt = receipt ? receipt.receivedAt : transfer.receivedAt;
      item.storageEnteredAt = receipt ? receipt.storageEnteredAt : transfer.storageEnteredAt;
      item.productTemperature = receipt ? receipt.productTemperature : transfer.productTemperature;
      if (receipt) item.expiryDate = receipt.expiryDate;
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
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  const configuredCodeCounts = {};
  values.forEach(function (row) {
    const name = cleanText_(row[0], 180), configuredCode = cleanText_(row[8], 80).toUpperCase();
    if (!name || !configuredCode) return;
    configuredCodeCounts[configuredCode] = Number(configuredCodeCounts[configuredCode] || 0) + 1;
  });
  const seenCodes = {}, seenNames = {};
  return values.map(function (row, index) {
    const name = cleanText_(row[0], 180);
    const productQty = Number(row[7]);
    if (!name || !cleanText_(row[3], 180) || !isFinite(productQty) || productQty <= 0) return null;
    const configuredCode = cleanText_(row[8], 80).toUpperCase();
    // Satu kode sumber/bahan boleh dipakai oleh beberapa menu. Dalam kondisi itu,
    // gunakan identitas internal berbasis nama menu agar saldo tiap menu tidak tercampur.
    const code = configuredCode && configuredCodeCounts[configuredCode] === 1 ? configuredCode : showcaseItemCode_(name);
    const nameKey = name.toLowerCase();
    if (seenNames[nameKey]) throw new Error('Nama Menu Showcase "' + name + '" digunakan lebih dari sekali pada baris ' + seenNames[nameKey] + ' dan ' + (index + 2) + '.');
    if (seenCodes[code]) throw new Error('Identitas internal Menu Showcase bertabrakan pada baris ' + seenCodes[code] + ' dan ' + (index + 2) + '. Ubah nama menu agar unik.');
    seenNames[nameKey] = index + 2;
    seenCodes[code] = index + 2;
    const categoryColumnC = cleanText_(row[2], 100);
    return {
      code: code, sourceCode: configuredCode, category: categoryColumnC || cleanText_(row[1], 100) || 'SHOWCASE',
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
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) monitorKeys['stock-upload-monitor-v2-' + date.slice(0, 7)] = true;
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

function stockDateOffset_(isoDate, days) {
  const date = new Date(String(isoDate || todayIso_()).slice(0, 10) + 'T12:00:00+07:00');
  date.setDate(date.getDate() + Number(days || 0));
  return Utilities.formatDate(date, 'Asia/Jakarta', 'yyyy-MM-dd');
}

function stockIsoDateOffset_(isoDate, days) {
  const raw = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const date = new Date(raw + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function stockDefaultRecalcStartDate_(today, days) {
  const startDate = stockDateOffset_(today, -days);
      // Baseline must be one day before the selected period. Putting it on
  // startDate makes the later-created LOT override run after that day's flow.
  return startDate;
}

function readStockHistoryForFifoRecalculation_(outlet, location, item) {
  const itemCondition = isShowcaseLocation_(location)
    ? 'item_name = @item'
    : '((item_code = @code) OR ((item_code IS NULL OR item_code = \'\') AND item_name = @item))';
  const sql = latestStockMovementCte_() + ' SELECT record_id, COALESCE(NULLIF(logical_id, \'\'), record_id) AS logical_id, COALESCE(version, 1) AS version, ' +
    'event_date, direction, qty, movement_type, info, production_date, expiry_date, source_arrival_date, transfer_id, supplier, source_file, source_row, created_by, created_at ' +
    'FROM latest WHERE outlet = @outlet AND location = @location AND ' + itemCondition + ' ORDER BY event_date, created_at';
  return runNamedQuery_(sql, { outlet: outlet, location: location, code: item.code, item: item.name }, { useQueryCache: false }).map(function (row) {
    return {
      recordId: String(row.record_id || ''), logicalId: String(row.logical_id || row.record_id || ''), version: Number(row.version || 1),
      date: String(row.event_date || ''), direction: String(row.direction || ''), qty: Number(row.qty || 0),
      movementType: String(row.movement_type || ''), info: String(row.info || ''), productionDate: String(row.production_date || ''),
      expiryDate: String(row.expiry_date || ''), sourceArrivalDate: String(row.source_arrival_date || ''),
      transferId: String(row.transfer_id || ''), supplier: String(row.supplier || ''), sourceFile: String(row.source_file || ''),
      sourceRow: Number(row.source_row || 0), createdBy: String(row.created_by || ''), createdAt: String(row.created_at || '')
    };
  });
}

function stockLotOverrideInfo_(movement) {
  if (!movement || movement.direction !== 'LOT' || movement.movementType !== 'Lot Balance Override') return null;
  try {
    const parsed = JSON.parse(String(movement.info || ''));
    return parsed && Array.isArray(parsed.lots) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function stockLotOverrideIsRecalculation_(override, movement) {
  if (!override) return false;
  if (override.recalculation) return true;
  // Backward compatibility for legacy recalculation markers written before
  // recalculation metadata was embedded. Expiry-completion overrides always carry a note.
  return !String(override.note || '').trim() && movement && movement.direction === 'LOT' && movement.movementType === 'Lot Balance Override';
}

function stockMovementCreatedMillis_(movement) {
  const raw = movement && movement.createdAt;
  const numeric = Number(raw);
  if (isFinite(numeric) && numeric > 0) return numeric > 100000000000 ? numeric : numeric * 1000;
  const parsed = new Date(raw || 0).getTime();
  return isFinite(parsed) ? parsed : 0;
}

function stockMovementCreatedDate_(movement) {
  const millis = stockMovementCreatedMillis_(movement);
  if (!millis) return '';
  // Jakarta does not use DST; shifting +07:00 keeps this helper independent from GAS services.
  return new Date(millis + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function stockFifoFefoStatus_(history, item) {
  let latestRecalculation = null, latestRecalculationOverride = null, latestRecalculationCreated = -1;
  (history || []).forEach(function (movement) {
    const override = stockLotOverrideInfo_(movement);
    if (!stockLotOverrideIsRecalculation_(override, movement)) return;
    const created = stockMovementCreatedMillis_(movement);
    if (!latestRecalculation || created > latestRecalculationCreated) {
      latestRecalculation = movement;
      latestRecalculationOverride = override;
      latestRecalculationCreated = created;
    }
  });
  const recalculation = latestRecalculationOverride && latestRecalculationOverride.recalculation || {};
  const legacyActiveStartDate = latestRecalculation ? stockIsoDateOffset_(latestRecalculation.date, 1) : '';
  const lastEndDate = String(recalculation.endDate || '9999-12-31').slice(0, 10);
  let recommendedStartDate = '', expiryCorrection = false, backdateCorrection = false;
  function remember(date) {
    date = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (!recommendedStartDate || date < recommendedStartDate) recommendedStartDate = date;
  }
  (history || []).forEach(function (movement) {
    const created = stockMovementCreatedMillis_(movement);
    const override = stockLotOverrideInfo_(movement);
    if (stockLotOverrideIsRecalculation_(override, movement)) return;
    // Expired Date completion changes the attributes of older physical lots. Recalculate
    // from the earliest affected Arrival Date, not from the date the correction was entered.
    if (override && /Lengkapi Expired Date/i.test(String(override.note || '')) &&
        (!latestRecalculationCreated || created > latestRecalculationCreated)) {
      const datedLots = (override.lots || []).filter(function (lot) { return Boolean(String(lot.expiryDate || '').slice(0, 10)); });
      if (datedLots.length) {
        expiryCorrection = true;
        datedLots.forEach(function (lot) { remember(lot.arrivalDate || lot.stockInDate || movement.date); });
      }
      return;
    }
    if (!latestRecalculationCreated || created <= latestRecalculationCreated) return;
    if (movement.direction !== 'IN' && movement.direction !== 'OUT') return;
    const eventDate = String(movement.date || '').slice(0, 10), createdDate = stockMovementCreatedDate_(movement);
    // Only a genuine backdate/edit invalidates the previous audit baseline. Normal future
    // transactions keep using the active FEFO mode without requiring another recalculation.
    if (eventDate && createdDate && eventDate < createdDate && (!lastEndDate || eventDate <= lastEndDate)) {
      backdateCorrection = true;
      remember(eventDate);
    }
  });
  let reason = '';
  if (expiryCorrection && backdateCorrection) reason = 'Ada koreksi Expired Date dan transaksi backdate setelah perhitungan terakhir.';
  else if (expiryCorrection) reason = 'Expired Date lot lama baru dilengkapi atau dikoreksi.';
  else if (backdateCorrection) reason = 'Ada transaksi backdate/edit pada periode yang sudah pernah dihitung.';
  return {
    mode: latestRecalculation ? 'FEFO' : 'FIFO',
    activeStartDate: String(recalculation.startDate || legacyActiveStartDate || '').slice(0, 10),
    activeBaselineDate: latestRecalculation ? String(latestRecalculation.date || '').slice(0, 10) : '',
    lastRecalculatedAt: String(recalculation.calculatedAt || latestRecalculation && latestRecalculation.createdAt || ''),
    recommendedStartDate: recommendedStartDate,
    needsRecalculation: Boolean(recommendedStartDate),
    reason: reason
  };
}

function stockFifoFefoIssue_(history, item) {
  const status = stockFifoFefoStatus_(history, item);
  if (!status.needsRecalculation) return null;
  return {
    code: String(item.code || ''),
    name: String(item.name || ''),
    unit: String(item.unit || ''),
    updatedDate: status.recommendedStartDate,
    recommendedStartDate: status.recommendedStartDate,
    mode: status.mode,
    reason: (status.reason || 'Ada perubahan lot yang perlu dihitung ulang.') + ' Recalculate mulai ' + status.recommendedStartDate + '.'
  };
}

function stockBalanceAtDate_(history, date) {
  return (history || []).reduce(function (total, movement) {
    if (String(movement.date || '').slice(0, 10) > date) return total;
    if (movement.direction === 'IN') return total + Number(movement.qty || 0);
    if (movement.direction === 'OUT') return total - Number(movement.qty || 0);
    return total;
  }, 0);
}

function stockLotArrivalKey_(lot) {
  lot = lot || {};
  return String(lot.sourceDate || lot.showcaseDate || lot.productionDate || '9999-12-31').slice(0, 10) || '9999-12-31';
}

/** Default operational flow: pure FIFO. Expired Date is informational until a Recalculate marker activates FEFO. */
function compareStockLotsFifo_(a, b) {
  const arrivalCompare = stockLotArrivalKey_(a).localeCompare(stockLotArrivalKey_(b));
  if (arrivalCompare) return arrivalCompare;
  const stockInCompare = String(a && a.showcaseDate || '9999-12-31').localeCompare(String(b && b.showcaseDate || '9999-12-31'));
  if (stockInCompare) return stockInCompare;
  const productionCompare = String(a && a.productionDate || '9999-12-31').localeCompare(String(b && b.productionDate || '9999-12-31'));
  if (productionCompare) return productionCompare;
  return String(a && a.expiryDate || '9999-12-31').localeCompare(String(b && b.expiryDate || '9999-12-31'));
}

/** Recalculated flow: FEFO first; lots without expiry stay after dated lots and remain FIFO among themselves. */
function compareStockLotsFefo_(a, b) {
  const aExpiry = String(a && a.expiryDate || '').slice(0, 10);
  const bExpiry = String(b && b.expiryDate || '').slice(0, 10);
  if (Boolean(aExpiry) !== Boolean(bExpiry)) return aExpiry ? -1 : 1;
  if (aExpiry && bExpiry) {
    const expiryCompare = aExpiry.localeCompare(bExpiry);
    if (expiryCompare) return expiryCompare;
  }
  return compareStockLotsFifo_(a, b);
}

/** Kept as the system-wide default comparator so normal Sales/Transfer flow remains FIFO. */
function compareStockLots_(a, b) {
  return compareStockLotsFifo_(a, b);
}

function applyKnownExpiryToBaselineLots_(baselineLots, currentLots) {
  const pools = {};
  (currentLots || []).forEach(function (lot) {
    const expiryDate = String(lot.expiryDate || '').slice(0, 10);
    const qty = Number(lot.qty || 0);
    if (!expiryDate || qty <= 0.0000001) return;
    const key = String(lot.sourceDate || '') + '|' + String(lot.showcaseDate || '');
    if (!pools[key]) pools[key] = [];
    pools[key].push({ qty: qty, expiryDate: expiryDate });
  });
  Object.keys(pools).forEach(function (key) {
    pools[key].sort(function (a, b) { return a.expiryDate.localeCompare(b.expiryDate); });
  });
  const result = [];
  (baselineLots || []).forEach(function (source) {
    const sourceQty = Number(source.qty || 0);
    if (sourceQty <= 0.0000001) return;
    if (String(source.expiryDate || '').slice(0, 10)) {
      result.push({ qty: sourceQty, productionDate: source.productionDate || '', expiryDate: source.expiryDate, sourceDate: source.sourceDate || '', showcaseDate: source.showcaseDate || '' });
      return;
    }
    const key = String(source.sourceDate || '') + '|' + String(source.showcaseDate || '');
    const pool = pools[key] || [];
    let remaining = sourceQty;
    for (let i = 0; i < pool.length && remaining > 0.0000001; i++) {
      if (pool[i].qty <= 0.0000001) continue;
      const assigned = Math.min(remaining, pool[i].qty);
      result.push({ qty: assigned, productionDate: source.productionDate || '', expiryDate: pool[i].expiryDate, sourceDate: source.sourceDate || '', showcaseDate: source.showcaseDate || '' });
      pool[i].qty -= assigned;
      remaining -= assigned;
    }
    if (remaining > 0.0000001) result.push({ qty: remaining, productionDate: source.productionDate || '', expiryDate: '', sourceDate: source.sourceDate || '', showcaseDate: source.showcaseDate || '' });
  });
  result.sort(compareStockLotsFefo_);
  return result;
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
  const missingExpiry = [], nearExpiry = [], fifoFefoIssues = [];
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
    const fifoIssue = stockFifoFefoIssue_(entry.history, masterItem);
    if (fifoIssue) fifoFefoIssues.push(fifoIssue);
  });
  missingExpiry.sort(function (a, b) { return a.name.localeCompare(b.name); });
  nearExpiry.sort(function (a, b) { return a.expiryDate.localeCompare(b.expiryDate) || a.name.localeCompare(b.name); });
  fifoFefoIssues.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return { missingExpiry: missingExpiry, nearExpiry: nearExpiry, fifoFefoIssues: fifoFefoIssues, nearExpiryDays: 30 };
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
    const detail = showcaseItem.name + ' ' + formatQty_(menuQty) + ' ' + showcaseItem.unit + ' · Product ' + product.name + ' ' + formatQty_(productQty) + ' ' + product.unit;
    const rows = [], showcaseRows = [];
    const productPerMenu = Number(showcaseItem.productQty) * factor;
    const allocatedLots = allocateTransferLots_(outlet, 'Store', product, productQty);
    let assignedMenuQty = 0;
    allocatedLots.forEach(function (lot, lotIndex) {
      rows.push(stockTransferMovementRow_(transferId, outlet, 'Store', product, 'OUT', lot.qty, 'Transfer Out',
        'Transfer To Showcase untuk Produk ' + showcaseItem.name + ' · Dari Store · ' + detail + (note ? ' · ' + note : ''), lot.expiryDate, employee, now, eventDate, lot.productionDate));
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
  return type === 'Goods Receipt' ? 'goodsReceipt' : (type === 'Terjual' || type === 'Sold') ? 'salesUsage' : type === 'Item Journal' ? 'itemJournal' : type === 'Transfer Out Antar Outlet' ? 'goodsDelivery' : '';
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
    // Sold/Terjual dari Showcase Log adalah input manual dan tidak boleh menandai Usage Penjualan sebagai uploaded.
    if (uploadType === 'salesUsage' && String(row.source_file || '').trim().toUpperCase() === 'SHOWCASE_LOG') return;
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
  const movementFilter = state.uploadType === 'salesUsage'
    ? "movement_type IN ('Terjual', 'Sold')"
    : state.uploadType === 'goodsReceipt'
      ? "movement_type = 'Goods Receipt'"
      : state.uploadType === 'itemJournal'
        ? "movement_type = 'Item Journal'"
        : "movement_type = 'Transfer Out Antar Outlet'";
  const sourceRowKey = "CONCAT(COALESCE(source_file, ''), '|', COALESCE(source_hash, ''), '|', CAST(COALESCE(source_row, 0) AS STRING))";
  const sourceFilter = state.uploadType === 'salesUsage'
    ? " AND UPPER(COALESCE(source_file, '')) != 'SHOWCASE_LOG'"
    : '';
  const sql = 'BEGIN TRANSACTION; DELETE FROM ' + summary + ' WHERE outlet = @outlet AND event_date = CAST(@eventDate AS DATE) AND upload_type = @uploadType; ' +
    'INSERT INTO ' + summary + ' (event_date, outlet, upload_type, actual_item_count, marker_count, last_upload, last_user, updated_at) ' +
    'SELECT CAST(@eventDate AS DATE), @outlet, @uploadType, ' +
    'COUNT(DISTINCT IF(record_type = \'MOVEMENT\' AND item_code IS NOT NULL AND item_code != \'\' AND source_file IS NOT NULL AND source_file != \'\', ' + sourceRowKey + ', NULL)), ' +
    'COUNTIF(record_type = \'IMPORT\'), MAX(created_at), ARRAY_AGG(created_by IGNORE NULLS ORDER BY created_at DESC LIMIT 1)[SAFE_OFFSET(0)], CURRENT_TIMESTAMP() ' +
    'FROM ' + stockCardTable_() + ' WHERE outlet = @outlet AND event_date = CAST(@eventDate AS DATE) AND ' + movementFilter + sourceFilter + '; COMMIT TRANSACTION;';
  runNamedQuery_(sql, {
    outlet: state.outlet, eventDate: state.eventDate, uploadType: state.uploadType
  }, { useQueryCache: false });
  const properties = PropertiesService.getScriptProperties(), key = stockUploadSummaryDirtyKey_(state.outlet, state.eventDate, state.uploadType);
  if (String(properties.getProperty(key) || '') === String(expectedRaw || '')) properties.deleteProperty(key);
  removeScriptCacheKeys_(['stock-upload-monitor-v2-' + state.eventDate.slice(0, 7)]);
}

/** Run once after deployment, then only the small dirty slices are refreshed. */
function backfillStockUploadDailySummary() {
  ensureStockCardInfrastructure_();
  const summary = '`' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_upload_daily_summary`';
  const sourceRowKey = "CONCAT(COALESCE(source_file, ''), '|', COALESCE(source_hash, ''), '|', CAST(COALESCE(source_row, 0) AS STRING))";
  const uploadType = "CASE WHEN movement_type = 'Goods Receipt' THEN 'goodsReceipt' WHEN movement_type IN ('Terjual', 'Sold') THEN 'salesUsage' WHEN movement_type = 'Item Journal' THEN 'itemJournal' ELSE 'goodsDelivery' END";
  const sql = 'TRUNCATE TABLE ' + summary + '; INSERT INTO ' + summary +
    ' (event_date, outlet, upload_type, actual_item_count, marker_count, last_upload, last_user, updated_at) ' +
    'SELECT event_date, outlet, ' + uploadType + ', ' +
    'COUNT(DISTINCT IF(record_type = \'MOVEMENT\' AND item_code IS NOT NULL AND item_code != \'\' AND source_file IS NOT NULL AND source_file != \'\', ' + sourceRowKey + ', NULL)), ' +
    'COUNTIF(record_type = \'IMPORT\'), MAX(created_at), ARRAY_AGG(created_by IGNORE NULLS ORDER BY created_at DESC LIMIT 1)[SAFE_OFFSET(0)], CURRENT_TIMESTAMP() ' +
    'FROM ' + stockCardTable_() + ' WHERE movement_type IN (\'Goods Receipt\', \'Terjual\', \'Sold\', \'Item Journal\', \'Transfer Out Antar Outlet\') ' +
    "AND NOT (movement_type IN ('Terjual', 'Sold') AND UPPER(COALESCE(source_file, '')) = 'SHOWCASE_LOG') " +
    'GROUP BY event_date, outlet, ' + uploadType;
  runNamedQuery_(sql, {}, { useQueryCache: false });
  PropertiesService.getScriptProperties().setProperties({ STOCK_UPLOAD_SUMMARY_SHOWCASE_ISOLATION_V1: '1', STOCK_UPLOAD_SUMMARY_ITEM_JOURNAL_V1: '1' }, false);
  removeScriptCacheKeys_(['stock-upload-monitor-v2-' + todayIso_().slice(0, 7)]);
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
  CacheService.getScriptCache().remove('stock-card-infrastructure-v17');
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
  CacheService.getScriptCache().remove('stock-card-infrastructure-v17');
  return { activated: true, activeTable: 'stock_card_v2', rollbackMirror: 'stock_card', audit: audit };
}

/** Emergency rollback: old table becomes active immediately; v2 remains mirrored and no table is deleted. */
function rollbackStockCardV2Migration() {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('STOCK_CARD_TABLE_ID', 'stock_card');
  properties.setProperty('STOCK_CARD_MIRROR_TABLE_ID', 'stock_card_v2');
  properties.setProperty('STOCK_CARD_MIGRATION_ROLLED_BACK_AT', new Date().toISOString());
  CacheService.getScriptCache().remove('stock-card-infrastructure-v17');
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
  let activeRecalculation = null, activeRecalculationInfo = null, activeRecalculationCreated = -1;
  (history || []).forEach(function (movement) {
    const override = stockLotOverrideInfo_(movement);
    if (!stockLotOverrideIsRecalculation_(override, movement)) return;
    const created = stockMovementCreatedMillis_(movement);
    if (!activeRecalculation || created > activeRecalculationCreated ||
        (created === activeRecalculationCreated && String(movement.recordId || '').localeCompare(String(activeRecalculation.recordId || '')) > 0)) {
      activeRecalculation = movement;
      activeRecalculationInfo = override.recalculation || { startDate: stockIsoDateOffset_(movement.date, 1), endDate: '9999-12-31', calculatedAt: movement.createdAt || '' };
      activeRecalculationCreated = created;
    }
  });
  const activeRecalculationBaseline = activeRecalculation ? String(activeRecalculation.date || '').slice(0, 10) : '';
  const activeRecalculationStart = String(activeRecalculationInfo && activeRecalculationInfo.startDate ||
    (activeRecalculationBaseline ? stockIsoDateOffset_(activeRecalculationBaseline, 1) : '')).slice(0, 10);
  const activeRecalculationEnd = String(activeRecalculationInfo && activeRecalculationInfo.endDate || '9999-12-31').slice(0, 10);
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
  function fefoActiveForDate(date) {
    date = String(date || '').slice(0, 10);
    return Boolean(activeRecalculationBaseline && date >= activeRecalculationBaseline);
  }
  function sortLots(date) {
    lots.sort(fefoActiveForDate(date) ? compareStockLotsFefo_ : compareStockLotsFifo_);
  }
  function pinnedLot(movement) {
    if (!movement || movement.direction !== 'OUT') return null;
    const pinned = {
      productionDate: String(movement.productionDate || ''), expiryDate: String(movement.expiryDate || ''),
      sourceDate: String(movement.sourceArrivalDate || ''), showcaseDate: ''
    };
    return pinned.productionDate || pinned.expiryDate || pinned.sourceDate ? pinned : null;
  }
  function shouldIgnorePinnedLot(movement) {
    if (!activeRecalculation || !movement || movement.direction !== 'OUT') return false;
    const date = String(movement.date || '').slice(0, 10);
    if (!date || !activeRecalculationStart || date < activeRecalculationStart || date > activeRecalculationEnd) return false;
    // Historical OUT rows that already existed when Recalculate was pressed must be
    // re-allocated from the newly ordered FEFO queue instead of keeping the old FIFO pin.
    return stockMovementCreatedMillis_(movement) <= activeRecalculationCreated;
  }
  function matchesPinned(lot, pinned) {
    if (pinned.productionDate && String(lot.productionDate || '') !== pinned.productionDate) return false;
    if (pinned.expiryDate && String(lot.expiryDate || '') !== pinned.expiryDate) return false;
    if (pinned.sourceDate && String(lot.sourceDate || '') !== pinned.sourceDate) return false;
    return true;
  }
  function consumeFromLots(movement, remaining, predicate) {
    for (let i = 0; i < lots.length && remaining > 0.0000001; i++) {
      if (lots[i].qty <= 0.0000001 || (predicate && !predicate(lots[i]))) continue;
      const taken = Math.min(lots[i].qty, remaining);
      lots[i].qty -= taken; remaining -= taken;
      if (taken > 0.0000001) movement.fifoUsageLots.push({
        qty: taken, productionDate: lots[i].productionDate, expiryDate: lots[i].expiryDate,
        sourceDate: lots[i].sourceDate, showcaseDate: lots[i].showcaseDate
      });
    }
    return remaining;
  }
  movements.forEach(function (movement) {
    const qty = Number(movement.qty || 0), movementDate = String(movement.date || '').slice(0, 10);
    movement.fifoUsageLots = [];
    movement.fifoUncovered = 0;
    if (movement.direction === 'LOT' && movement.movementType === 'Lot Balance Override') {
      let override = null;
      try { override = JSON.parse(String(movement.info || '')); } catch (error) { override = null; }
      const supersededFlowOverride = override && activeRecalculation && movement !== activeRecalculation &&
        movementDate >= activeRecalculationBaseline &&
        stockMovementCreatedMillis_(movement) <= activeRecalculationCreated &&
        (stockLotOverrideIsRecalculation_(override, movement) || /Lengkapi Expired Date/i.test(String(override.note || '')));
      if (supersededFlowOverride) return;
      if (override && Array.isArray(override.lots)) {
        lots.length = 0; uncoveredQueue.length = 0;
        override.lots.forEach(function (lot) {
          const lotQty = Number(lot.qty || 0);
          if (lotQty > 0.0000001) lots.push({ qty: lotQty, productionDate: String(lot.productionDate || ''), expiryDate: String(lot.expiryDate || ''), sourceDate: String(lot.arrivalDate || ''), showcaseDate: String(lot.stockInDate || '') });
        });
        const uncoveredQty = Math.max(0, Number(override.uncoveredQty || 0));
        if (uncoveredQty > 0.0000001) uncoveredQueue.push({ movement: { fifoUsageLots: [], fifoUncovered: uncoveredQty }, qty: uncoveredQty });
        sortLots(movementDate);
      }
    } else if (movement.direction === 'IN') {
      const incomingLot = {
        productionDate: String(movement.productionDate || ''), expiryDate: String(movement.expiryDate || ''),
        sourceDate: String(movement.sourceArrivalDate || movement.date || ''), showcaseDate: String(movement.date || '')
      };
      let incomingRemaining = qty;
      while (incomingRemaining > 0.0000001 && uncoveredQueue.length) {
        const debt = uncoveredQueue[0], covered = Math.min(incomingRemaining, debt.qty);
        debt.movement.fifoUsageLots.push({ qty: covered, productionDate: incomingLot.productionDate, expiryDate: incomingLot.expiryDate, sourceDate: incomingLot.sourceDate, showcaseDate: incomingLot.showcaseDate });
        debt.qty -= covered; debt.movement.fifoUncovered = Math.max(0, Number(debt.movement.fifoUncovered || 0) - covered); incomingRemaining -= covered;
        if (debt.qty <= 0.0000001) uncoveredQueue.shift();
      }
      if (incomingRemaining > 0.0000001) lots.push({ qty: incomingRemaining, productionDate: incomingLot.productionDate, expiryDate: incomingLot.expiryDate, sourceDate: incomingLot.sourceDate, showcaseDate: incomingLot.showcaseDate });
      sortLots(movementDate);
    } else if (movement.direction === 'OUT') {
      sortLots(movementDate);
      let remaining = qty;
      const pinned = shouldIgnorePinnedLot(movement) ? null : pinnedLot(movement);
      if (pinned) remaining = consumeFromLots(movement, remaining, function (lot) { return matchesPinned(lot, pinned); });
      if (remaining > 0.0000001) remaining = consumeFromLots(movement, remaining, null);
      movement.fifoUncovered = Math.max(0, remaining);
      if (remaining > 0.0000001) uncoveredQueue.push({ movement: movement, qty: remaining });
      for (let i = lots.length - 1; i >= 0; i--) if (lots[i].qty <= 0.0000001) lots.splice(i, 1);
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
    const labels = { Terjual: 'Sold', Sold: 'Sold', Waste: 'Waste', Pemakaian: 'Usage', 'Transfer Out': 'Stock Out', 'Transfer Out Antar Outlet': 'Stock Out', 'Stock Adjustment': 'Adjustment', Others: 'Other' };
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
  const allowedOut = ['Terjual', 'Sold', 'Pemakaian', 'Waste', 'Transfer Out', 'Transfer Out Antar Outlet', 'Stock Adjustment', 'Others'];
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

/* --------------------------------------------------------------------------
 * Sales Menu COGS Detail + Item Journal imports
 * -------------------------------------------------------------------------- */

function ensureSalesProductMappingSheet_() {
  return ensureSheet_(CONFIG.SALES_PRODUCT_MAPPING_SHEET, [
    'SOURCE_PRODUCT', 'SOURCE_KEY', 'TARGET_TYPE', 'TARGET_CODE', 'TARGET_NAME',
    'ACTIVE', 'UPDATED_BY', 'UPDATED_AT'
  ]);
}

function readSalesProductMappings_() {
  const sheet = ensureSalesProductMappingSheet_(), map = {};
  if (sheet.getLastRow() < 2) return map;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getDisplayValues().forEach(function (row) {
    const key = normalizeStoreName_(row[1] || row[0]);
    if (!key || (String(row[5] || '').trim() && !truthy_(row[5]))) return;
    map[key] = { sourceProduct: row[0], sourceKey: key, targetType: String(row[2] || '').toUpperCase(), targetCode: String(row[3] || '').toUpperCase(), targetName: row[4] };
  });
  return map;
}

function syncWipRecipeOutputsToStockItems_() {
  const catalog = readWipRecipeCatalog_();
  if (!catalog || !catalog.variants || !catalog.variants.length) return { added: 0, activated: 0, conflicts: [] };

  // Satu FORMULA_CODE boleh mempunyai lebih dari satu baris bahan, tetapi output WIP-nya
  // hanya aman dibuat otomatis bila nama + finished unit untuk kode tersebut konsisten.
  const grouped = {};
  catalog.variants.forEach(function (variant) {
    const code = String(variant.code || '').trim().toUpperCase();
    if (!code) return;
    if (!grouped[code]) grouped[code] = { code: code, names: {}, units: {}, variants: [] };
    const name = cleanText_(variant.name, 180), unit = normalizeUnit_(variant.unit);
    if (name) grouped[code].names[normalizeStoreName_(name)] = name;
    if (unit) grouped[code].units[unit] = true;
    grouped[code].variants.push(variant);
  });

  const sheet = ensureStockMasterSheet_(), existingByCode = {}, existingByName = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues().forEach(function (row, index) {
      const code = String(row[0] || '').trim().toUpperCase();
      const name = cleanText_(row[2], 180);
      if (!code) return;
      const entry = { row: index + 2, code: code, category: row[1], name: name, unit: normalizeUnit_(row[3]), active: String(row[4] || '').trim() === '' || truthy_(row[4]) };
      existingByCode[code] = entry;
      const nameKey = normalizeStoreName_(name);
      if (nameKey) {
        if (!existingByName[nameKey]) existingByName[nameKey] = [];
        existingByName[nameKey].push(entry);
      }
    });
  }

  const additions = [], conflicts = [];
  let activated = 0;
  Object.keys(grouped).forEach(function (code) {
    const group = grouped[code];
    const nameKeys = Object.keys(group.names), units = Object.keys(group.units);
    if (nameKeys.length !== 1 || units.length !== 1) {
      conflicts.push({ code: code, reason: 'Output WIP mempunyai lebih dari satu nama/unit.' });
      return;
    }
    const name = group.names[nameKeys[0]], unit = units[0];
    const existing = existingByCode[code];
    if (existing) {
      // Kode sudah ada: jangan ubah identitas master secara diam-diam. Cukup aktifkan bila identitasnya cocok.
      if (normalizeStoreName_(existing.name) !== normalizeStoreName_(name) || (existing.unit && normalizeUnit_(existing.unit) !== unit)) {
        conflicts.push({ code: code, name: name, reason: 'Kode sudah ada di STOCK_ITEMS dengan nama/unit berbeda.' });
        return;
      }
      let touched = false;
      if (!existing.name) { sheet.getRange(existing.row, 3).setValue(name); touched = true; }
      if (!existing.unit) { sheet.getRange(existing.row, 4).setValue(unit); touched = true; }
      if (!existing.active) { sheet.getRange(existing.row, 5).setValue(true); touched = true; }
      if (touched) activated++;
      return;
    }

    // Bila nama yang sama sudah dipakai kode stock lain, jangan membuat duplikat nama otomatis.
    const sameName = existingByName[normalizeStoreName_(name)] || [];
    if (sameName.length) {
      conflicts.push({ code: code, name: name, reason: 'Nama WIP sudah ada di STOCK_ITEMS dengan kode berbeda.' });
      return;
    }
    additions.push([code, 'WIP', name, unit, true]);
  });

  if (additions.length) sheet.getRange(sheet.getLastRow() + 1, 1, additions.length, 5).setValues(additions);
  if (additions.length || activated) {
    SpreadsheetApp.flush();
    removeScriptCacheKeys_(['stock-master-active', 'stock-master-all']);
  }
  return { added: additions.length, activated: activated, conflicts: conflicts };
}

function salesMappingCatalog_() {
  // WIP_RECIPES adalah master definisi WIP. Jika output WIP mempunyai kode, nama dan unit
  // yang unik/konsisten, daftarkan otomatis ke STOCK_ITEMS agar tidak meminta mapping palsu.
  syncWipRecipeOutputsToStockItems_();
  const stockItems = readStockMaster_(true), stockByCode = {};
  const products = stockItems.map(function (item) {
    stockByCode[String(item.code || '').toUpperCase()] = item;
    return { code: item.code, name: item.name, unit: item.unit };
  });
  const showcase = readShowcaseItems_().map(function (item) { return { code: item.code, name: item.productName || item.name, menuName: item.name, unit: item.productUnit || item.unit }; });
  const seenAll = {}, seenUsable = {}, wipAll = [], wip = [];
  readWipRecipeCatalog_().variants.forEach(function (item) {
    const key = String(item.code || '').toUpperCase() + '|' + String(item.name || '').toUpperCase();
    const entry = { code: String(item.code || '').toUpperCase(), name: item.name, unit: item.unit, variantKey: item.key };
    if (!seenAll[key]) { seenAll[key] = true; wipAll.push(entry); }
    // Hanya WIP yang mempunyai STOCK_ITEMS yang boleh dipilih sebagai target mapping.
    // WIP resep tanpa item stock tetap dideteksi, tetapi user harus memetakannya ke item yang benar.
    if (stockByCode[entry.code] && !seenUsable[key]) { seenUsable[key] = true; wip.push(entry); }
  });
  return { products: products, showcase: showcase, wip: wip, wipAll: wipAll };
}

function saveSalesProductMappings(token, payload) {
  return safe_(function () {
    const session = requireSession_(token), employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    const entries = payload && Array.isArray(payload.mappings) ? payload.mappings : [];
    if (!entries.length) throw new Error('Belum ada pemetaan item yang dipilih.');
    const catalog = salesMappingCatalog_(), lookup = { PRODUCT: {}, SHOWCASE: {}, WIP: {} };
    catalog.products.forEach(function (item) { lookup.PRODUCT[item.code] = item; });
    catalog.showcase.forEach(function (item) { lookup.SHOWCASE[item.code] = item; });
    catalog.wip.forEach(function (item) { lookup.WIP[item.code] = item; });
    const normalized = entries.map(function (entry) {
      const source = cleanText_(entry.sourceProduct, 180), sourceKey = normalizeStoreName_(source);
      const type = String(entry.targetType || '').toUpperCase(), code = cleanText_(entry.targetCode, 80).toUpperCase();
      if (!sourceKey) throw new Error('Nama Product sumber tidak boleh kosong.');
      if (['PRODUCT', 'SHOWCASE', 'WIP'].indexOf(type) < 0) throw new Error(source + ': pilih tepat satu jenis Item Produk, Item Showcase, atau WIP Item.');
      const target = lookup[type][code];
      if (!target) throw new Error(source + ': item tujuan tidak ditemukan pada database ' + type + '.');
      return [source, sourceKey, type, code, target.name, true, employee.nik, new Date()];
    });
    const lock = acquireStockWriteLock_();
    try {
      const sheet = ensureSalesProductMappingSheet_(), existing = {};
      if (sheet.getLastRow() >= 2) sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(function (row, index) { if (row[0]) existing[normalizeStoreName_(row[0])] = index + 2; });
      const additions = [];
      normalized.forEach(function (row) { if (existing[row[1]]) sheet.getRange(existing[row[1]], 1, 1, 8).setValues([row]); else additions.push(row); });
      if (additions.length) sheet.getRange(sheet.getLastRow() + 1, 1, additions.length, 8).setValues(additions);
      SpreadsheetApp.flush();
      return { saved: true, count: normalized.length };
    } finally { lock.releaseLock(); }
  });
}

function parseSalesCogsReport_(base64, fileName) {
  const cells = extractReportCells_(base64, fileName, 'Sales Menu COGS Detail');
  const required = ['SALES NUMBER', 'SALES DATE', 'BRANCH', 'MENU', 'PRODUCT', 'UNIT', 'QTY'];
  const header = findReportHeader_(cells, required), rows = [], invalid = [], zero = [];
  reportDataRows_(cells, header, 'SALES NUMBER').forEach(function (rowNumber) {
    const salesNumber = cleanText_(reportCell_(cells, header, 'SALES NUMBER', rowNumber), 120);
    const product = cleanText_(reportCell_(cells, header, 'PRODUCT', rowNumber), 180);
    if (!salesNumber || !product) return;
    let qty;
    try { qty = safeSalesSourceQty_(parseReportNumber_(reportCell_(cells, header, 'QTY', rowNumber)), product, rowNumber); }
    catch (error) { invalid.push(product + ' baris ' + rowNumber + ' (' + cleanText_(error.message, 180) + ')'); return; }
    if (qty <= 0.0000001) { zero.push(rowNumber); return; }
    rows.push({ sourceRow: rowNumber, salesNumber: salesNumber,
      transactionDate: parseReportDate_(reportCell_(cells, header, 'SALES DATE', rowNumber), 'EVENT', rowNumber, 'Sales Date'),
      outletName: cleanText_(reportCell_(cells, header, 'BRANCH', rowNumber), 180),
      menu: cleanText_(reportCell_(cells, header, 'MENU', rowNumber), 180), product: product,
      unit: normalizeUnit_(reportCell_(cells, header, 'UNIT', rowNumber)), qty: qty });
  });
  if (invalid.length) throw new Error('QTY tidak valid pada: ' + invalid.slice(0, 12).join(', ') + '.');
  if (!rows.length) throw new Error('Tidak ada baris Sales Menu COGS Detail dengan QTY lebih dari 0.');
  return { rows: rows, zeroRowsSkipped: zero.length };
}

function resolveSalesTarget_(productName, catalogs, savedMappings) {
  const key = normalizeStoreName_(productName), saved = savedMappings[key];
  function byCode(list, code) { return (list || []).filter(function (item) { return String(item.code || '').toUpperCase() === String(code || '').toUpperCase(); }); }
  if (saved) {
    // Mapping lama bisa pernah tersimpan sebagai PRODUCT sebelum item tersebut dikenali sebagai WIP.
    // Jika target code sekarang sudah terdaftar sebagai output WIP, WIP harus menang agar upload
    // penjualan dapat auto-generate Production ketika stock WIP kosong/kurang.
    if (saved.targetType === 'PRODUCT') {
      const savedWip = byCode(catalogs.wip || [], saved.targetCode);
      if (savedWip.length) return { type: 'WIP', target: savedWip[0], saved: true, promotedFromProduct: true };
    }
    const source = saved.targetType === 'PRODUCT' ? catalogs.products : saved.targetType === 'SHOWCASE' ? catalogs.showcase : catalogs.wip;
    const found = byCode(source, saved.targetCode);
    if (found.length) return { type: saved.targetType, target: found[0], saved: true };
  }
  const showcase = (catalogs.showcase || []).filter(function (item) { return normalizeStoreName_(item.name) === key; });
  if (showcase.length) return { type: 'SHOWCASE', target: showcase[0] };

  // Deteksi WIP berdasarkan seluruh resep, termasuk WIP yang belum punya STOCK_ITEMS.
  // Jika resepnya ada tetapi item stock tidak ada, jangan ditolak: minta user memilih mapping.
  const wipAll = (catalogs.wipAll || catalogs.wip || []).filter(function (item) { return normalizeStoreName_(item.name) === key; });
  if (wipAll.length === 1) {
    const usable = byCode(catalogs.wip || [], wipAll[0].code).filter(function (item) { return normalizeStoreName_(item.name) === key; });
    if (usable.length) return { type: 'WIP', target: usable[0] };
    return { type: '', target: null, missingStock: true, missingCode: wipAll[0].code, missingName: wipAll[0].name };
  }

  const products = (catalogs.products || []).filter(function (item) { return normalizeStoreName_(item.name) === key; });
  if (products.length === 1) return { type: 'PRODUCT', target: products[0] };
  const usableWip = (catalogs.wip || []).filter(function (item) { return normalizeStoreName_(item.name) === key; });
  return { type: '', target: null, ambiguous: products.length + usableWip.length + wipAll.length > 1 };
}

function salesMappingRequest_(sourceProduct, options) {
  options = options || {};
  const allowed = Array.isArray(options.allowedTypes) && options.allowedTypes.length ? options.allowedTypes : ['PRODUCT', 'SHOWCASE', 'WIP'];
  return {
    sourceProduct: cleanText_(sourceProduct || options.sourceCode || 'Item tanpa nama', 180),
    sourceCode: cleanText_(options.sourceCode || '', 80).toUpperCase(),
    ambiguous: Boolean(options.ambiguous),
    reason: cleanText_(options.reason || '', 300),
    allowedTypes: allowed
  };
}

function findSalesSavedMapping_(sourceName, sourceCode, mappings) {
  mappings = mappings || {};
  const keys = [normalizeStoreName_(sourceName), normalizeStoreName_(sourceCode)].filter(Boolean);
  for (let i = 0; i < keys.length; i++) if (mappings[keys[i]]) return mappings[keys[i]];
  return null;
}

/** Resolve bahan resep WIP ke STOCK_ITEMS. Mapping manual menang atas kode resep yang tidak tersedia. */
function resolveSalesRecipeMaterial_(recipe, masterByCode, mappings) {
  const sourceCode = String(recipe && recipe.code || '').toUpperCase();
  if (sourceCode && masterByCode[sourceCode]) return { item: masterByCode[sourceCode], mapped: false, targetType: '' };
  const saved = findSalesSavedMapping_(recipe && recipe.name, sourceCode, mappings);
  if (saved && (saved.targetType === 'PRODUCT' || saved.targetType === 'WIP')) {
    const target = masterByCode[String(saved.targetCode || '').toUpperCase()];
    if (target) return { item: target, mapped: true, targetType: saved.targetType, mapping: saved };
  }
  return { item: null, mapped: false, saved: saved || null };
}

function addSalesMappingRequest_(map, request) {
  const key = normalizeStoreName_(request.sourceProduct || request.sourceCode);
  if (!key) return;
  if (!map[key]) map[key] = request;
}

function validateSalesWipRecipeTree_(item, preferredName, context, path, depth) {
  depth = Number(depth || 0);
  if (!item || depth > 10) return;
  const code = String(item.code || '').toUpperCase();
  path = path || {};
  if (!code || path[code]) return;
  const nextPath = Object.assign({}, path); nextPath[code] = true;
  const variant = selectSalesWipVariant_(context.recipeCatalog, code, preferredName || item.name);
  if (!variant) return;

  if (!wipConversionFactor_(code, item.unit, variant.unit, context.provided, context.savedConversions)) {
    wipConversionRequest_(Object.keys(context.conversionMap).map(function (key) { return context.conversionMap[key]; }), context.conversionMap, item, item.unit, variant.unit);
  }

  (variant.materials || []).forEach(function (recipe) {
    const resolved = resolveSalesRecipeMaterial_(recipe, context.masterByCode, context.mappings);
    if (!resolved.item) {
      addSalesMappingRequest_(context.mappingMap, salesMappingRequest_(recipe.name || recipe.code, {
        sourceCode: recipe.code,
        allowedTypes: ['PRODUCT', 'WIP'],
        reason: String(recipe.code || '') + ' · ' + String(recipe.name || '') + ': bahan WIP belum tersedia pada STOCK_ITEMS. Pilih item stock yang harus dipakai.'
      }));
      return;
    }
    const material = resolved.item;
    if (!wipConversionFactor_(material.code, recipe.unit, material.unit, context.provided, context.savedConversions)) {
      const key = stockConversionKey_(material.code, recipe.unit, material.unit);
      context.conversionMap[key] = { key: key, itemCode: material.code, itemName: material.name, fromUnit: recipe.unit, toUnit: material.unit };
    }
    const materialCode = String(material.code || '').toUpperCase();
    if (context.recipeCatalog.byCode[materialCode] && context.recipeCatalog.byCode[materialCode].length) {
      validateSalesWipRecipeTree_(material, material.name, context, nextPath, depth + 1);
    }
  });
}

function salesRowHash_(row) {
  return digest_([row.outlet, row.transactionDate, row.salesNumber, row.menu, row.product, row.unit].map(normalizeStoreName_).join('|'));
}

function existingSalesRowHashes_(outlet, transactionDate) {
  const map = {}, sql = 'SELECT DISTINCT source_hash FROM ' + stockCardTable_() +
    ' WHERE outlet = @outlet AND event_date = CAST(@eventDate AS DATE) AND movement_type = \'Sold\' AND source_hash IS NOT NULL';
  runNamedQuery_(sql, { outlet: outlet, eventDate: transactionDate }, { useQueryCache: false }).forEach(function (row) { if (row.source_hash) map[String(row.source_hash)] = true; });
  return map;
}

function prepareSalesCogsImport_(employee, payload, allowPending, options) {
  options = options || {};
  const includeExisting = Boolean(options.includeExisting);
  const fileName = cleanText_(payload.fileName, 180), base64 = String(payload.base64 || '').replace(/^data:[^,]+,/, '').trim();
  const report = parseSalesCogsReport_(base64, fileName), outletDirectory = readStoreCodeDirectory_();
  const grouped = {}, invalidOutlets = [];
  report.rows.forEach(function (row) {
    const directory = outletDirectory.byName[normalizeStoreName_(row.outletName)], outlet = directory && directory.code;
    if (!outlet) { invalidOutlets.push(row.outletName); return; }
    if (employee.outlet !== 'BIHQ' && outlet !== employee.outlet) throw new Error('File memuat outlet ' + row.outletName + ' (' + outlet + '), bukan outlet login ' + employee.outlet + '.');
    row.outlet = outlet; row.rowHash = salesRowHash_(row);
    const key = [row.outlet, row.transactionDate, row.salesNumber, row.menu, row.product, row.unit].join('|');
    if (!grouped[key]) grouped[key] = row; else grouped[key].qty += row.qty;
  });
  if (invalidOutlets.length) throw new Error('Outlet belum terdaftar pada STORE CODE: ' + invalidOutlets.filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + '.');
  const rows = Object.keys(grouped).map(function (key) { return grouped[key]; }).sort(function (a, b) { return a.transactionDate.localeCompare(b.transactionDate) || a.outlet.localeCompare(b.outlet); });
  const catalogs = salesMappingCatalog_(), mappings = readSalesProductMappings_(), unresolved = {}, resolved = [];
  rows.forEach(function (row) {
    const match = resolveSalesTarget_(row.product, catalogs, mappings);
    if (!match.target) {
      const request = salesMappingRequest_(row.product, {
        sourceCode: match.missingCode || '',
        ambiguous: Boolean(match.ambiguous),
        reason: match.missingStock
          ? ((match.missingCode ? match.missingCode + ' · ' : '') + row.product + ': WIP ditemukan pada resep tetapi belum tersedia pada STOCK_ITEMS. Pilih mapping ke item stock yang benar.')
          : (row.product + ': nama item belum dapat dicocokkan otomatis dengan database.'),
        allowedTypes: ['PRODUCT', 'SHOWCASE', 'WIP']
      });
      unresolved[normalizeStoreName_(row.product)] = request;
      return;
    }
    row.targetType = match.type; row.target = match.target; resolved.push(row);
  });
  const unresolvedRows = Object.keys(unresolved).map(function (key) { return unresolved[key]; });
  if (unresolvedRows.length) {
    if (!allowPending) throw new Error('Pemetaan item belum lengkap. Pilih Mapping lalu verifikasi ulang.');
    return { requiresMapping: true, fileName: fileName, mappingRequests: unresolvedRows, mappingOptions: catalogs, sourceItemCount: rows.length };
  }
  const existingByScope = {}, duplicateRows = [], fresh = [];
  resolved.forEach(function (row) {
    if (includeExisting) { fresh.push(row); return; }
    const scope = row.outlet + '|' + row.transactionDate;
    if (!existingByScope[scope]) existingByScope[scope] = existingSalesRowHashes_(row.outlet, row.transactionDate);
    if (existingByScope[scope][row.rowHash]) duplicateRows.push(row); else fresh.push(row);
  });
  if (!fresh.length) throw new Error('Semua kombinasi Sales Number + Menu + Product + Unit sudah pernah tersimpan.');
  const masterByCode = {}, savedConversions = readStockUnitConversions_(), provided = payload.conversions || {}, conversionMap = {}, prepared = [], showcaseRows = [], mappingMap = {};
  readStockMaster_(true).forEach(function (item) { masterByCode[String(item.code || '').toUpperCase()] = item; });
  fresh.forEach(function (row) {
    if (row.targetType === 'SHOWCASE') { showcaseRows.push(row); return; }
    const targetCode = String(row.target.code || '').toUpperCase(), item = masterByCode[targetCode];
    if (!item) {
      addSalesMappingRequest_(mappingMap, salesMappingRequest_(row.product, {
        sourceCode: targetCode,
        allowedTypes: ['PRODUCT', 'SHOWCASE', 'WIP'],
        reason: targetCode + ' · ' + row.target.name + ': item tujuan belum tersedia pada STOCK_ITEMS. Pilih mapping ke item stock yang benar.'
      }));
      return;
    }
    const factor = resolveUnitConversionFactor_(item.code, row.unit, item.unit, provided, savedConversions);
    if (!factor) {
      const key = stockConversionKey_(item.code, row.unit, item.unit);
      conversionMap[key] = { key: key, itemCode: item.code, itemName: item.name, fromUnit: row.unit, toUnit: item.unit };
      return;
    }
    row.item = item;
    row.qtyDefault = safeSalesConvertedQty_(row.qty, factor, row, item);
    row.converted = normalizeUnit_(row.unit) !== normalizeUnit_(item.unit);
    prepared.push(row);
  });

  const recipeCatalog = readWipRecipeCatalog_();
  const validationContext = {
    recipeCatalog: recipeCatalog, masterByCode: masterByCode, mappings: mappings,
    provided: provided, savedConversions: savedConversions, conversionMap: conversionMap, mappingMap: mappingMap
  };
  prepared.filter(function (row) { return row.targetType === 'WIP'; }).forEach(function (row) {
    validateSalesWipRecipeTree_(row.item, row.target && row.target.name ? row.target.name : row.item.name, validationContext, {}, 0);
  });

  const pendingMappings = Object.keys(mappingMap).map(function (key) { return mappingMap[key]; });
  if (pendingMappings.length) {
    if (!allowPending) throw new Error('Ada item Stock Card/WIP yang belum dipetakan. Pilih Mapping lalu verifikasi ulang.');
    return { requiresMapping: true, fileName: fileName, mappingRequests: pendingMappings, mappingOptions: catalogs,
      sourceItemCount: rows.length, showcaseRowsSkipped: showcaseRows.length };
  }
  const missingConversions = Object.keys(conversionMap).map(function (key) { return conversionMap[key]; });
  if (missingConversions.length) {
    if (!allowPending) throw new Error('Lengkapi seluruh konversi unit sebelum upload.');
    return { requiresConversion: true, fileName: fileName, conversions: missingConversions, sourceItemCount: rows.length, showcaseRowsSkipped: showcaseRows.length };
  }
  return { fileName: fileName, rows: prepared, showcaseRows: showcaseRows, duplicateRowsSkipped: duplicateRows.length,
    zeroRowsSkipped: report.zeroRowsSkipped, sourceItemCount: rows.length,
    outlets: fresh.map(function (r) { return r.outlet; }).filter(function (v, i, a) { return a.indexOf(v) === i; }),
    dates: fresh.map(function (r) { return r.transactionDate; }).filter(function (v, i, a) { return a.indexOf(v) === i; }) };
}

function previewSalesCogsUpload(token, payload) {
  return safe_(function () {
    const session = requireSession_(token), employee = findEmployee_(session.nik); assertEmployeeActive_(employee);
    const prepared = prepareSalesCogsImport_(employee, payload || {}, true);
    if (prepared.requiresMapping || prepared.requiresConversion) return prepared;
    return { verified: true, fileName: prepared.fileName, outlet: prepared.outlets.join(', '), outlets: prepared.outlets,
      transactionDate: prepared.dates[0], transactionDates: prepared.dates, itemCount: prepared.rows.length,
      showcaseRowsSkipped: prepared.showcaseRows.length, duplicateItemsSkipped: prepared.duplicateRowsSkipped,
      zeroRowsSkipped: prepared.zeroRowsSkipped, autoWipProductionCount: prepared.rows.filter(function (r) { return r.targetType === 'WIP'; }).length,
      negativeItemCount: 0, rawShortages: [] };
  });
}

function salesHistoryRowFromQuery_(r) {
  return {
    recordId: String(r.record_id || ''), logicalId: String(r.logical_id || r.record_id || ''), version: Number(r.version || 1),
    date: String(r.event_date || ''), direction: String(r.direction || ''), qty: Number(r.qty || 0),
    movementType: String(r.movement_type || ''), info: String(r.info || ''), productionDate: String(r.production_date || ''), expiryDate: String(r.expiry_date || ''),
    sourceArrivalDate: String(r.source_arrival_date || ''), supplier: String(r.supplier || ''),
    sourceFile: String(r.source_file || ''), sourceRow: Number(r.source_row || 0),
    transferId: String(r.transfer_id || ''), systemGenerated: Boolean(r.transfer_id),
    createdBy: String(r.created_by || ''), createdAt: String(r.created_at || '')
  };
}

/**
 * Memuat histori FIFO untuk banyak item sekaligus.
 * Sebelumnya upload Sales COGS menjalankan satu query BigQuery untuk hampir setiap baris penjualan.
 * File 3.000+ baris dapat menghasilkan ribuan query dan melewati timeout browser/GAS.
 * Helper ini menurunkan jumlah query menjadi beberapa batch per outlet.
 */
function collectSalesFifoPreloadRows_(salesRows, wipCatalog, masterByCode, salesMappings) {
  const rows = [], seen = {};
  function add(outlet, item, transactionDate) {
    if (!outlet || !item || !item.code || !transactionDate) return;
    const key = [outlet, String(item.code).toUpperCase(), transactionDate].join('|');
    if (seen[key]) return;
    seen[key] = true;
    rows.push({ outlet: outlet, item: item, transactionDate: transactionDate });
  }
  function walk(outlet, item, preferredName, transactionDate, path, depth) {
    if (!item || depth > 10) return;
    const code = String(item.code || '').toUpperCase();
    add(outlet, item, transactionDate);
    if (!code || path[code]) return;
    const variants = (wipCatalog && wipCatalog.byCode && wipCatalog.byCode[code]) || [];
    if (!variants.length) return;
    const nextPath = Object.assign({}, path); nextPath[code] = true;
    let selected = variants.filter(function (variant) {
      return normalizeStoreName_(variant.name) === normalizeStoreName_(preferredName || item.name);
    });
    if (!selected.length) selected = variants;
    selected.forEach(function (variant) {
      (variant.materials || []).forEach(function (recipe) {
        const resolvedMaterial = resolveSalesRecipeMaterial_(recipe, masterByCode, salesMappings);
        const material = resolvedMaterial.item;
        if (!material) return;
        add(outlet, material, transactionDate);
        if (wipCatalog.byCode[String(material.code || '').toUpperCase()]) {
          walk(outlet, material, material.name, transactionDate, nextPath, depth + 1);
        }
      });
    });
  }
  (salesRows || []).forEach(function (sale) {
    walk(sale.outlet, sale.item, sale.target && sale.target.name ? sale.target.name : sale.item && sale.item.name,
      sale.transactionDate, {}, 0);
  });
  return rows;
}

/**
 * Memuat snapshot FIFO/FEFO per item dan per tanggal transaksi.
 * Snapshot dibatasi sampai tanggal sales sehingga receipt setelah tanggal transaksi
 * tidak bisa dipakai untuk transaksi historis. Semua bahan WIP (termasuk WIP bertingkat)
 * ikut dipreload agar lot yang dipotong dapat dikunci pada row upload.
 */
function preloadSalesFifoLots_(salesRows, wipCatalog, masterByCode, salesMappings, excludedSourceHashes) {
  excludedSourceHashes = (excludedSourceHashes || []).map(function (value) { return String(value || ''); }).filter(Boolean);
  const refs = collectSalesFifoPreloadRows_(salesRows, wipCatalog, masterByCode, salesMappings);
  const byOutlet = {}, result = {}, chunkSize = 18;
  refs.forEach(function (ref) {
    if (!byOutlet[ref.outlet]) byOutlet[ref.outlet] = {};
    const code = String(ref.item.code || '').trim().toUpperCase();
    if (!byOutlet[ref.outlet][code]) byOutlet[ref.outlet][code] = { item: ref.item, dates: {} };
    byOutlet[ref.outlet][code].dates[ref.transactionDate] = true;
  });

  Object.keys(byOutlet).forEach(function (outlet) {
    const entries = Object.keys(byOutlet[outlet]).map(function (code) { return byOutlet[outlet][code]; });
    result[outlet] = {};
    for (let offset = 0; offset < entries.length; offset += chunkSize) {
      const chunk = entries.slice(offset, offset + chunkSize), codes = [], names = [], nameToCode = {}, histories = {};
      let maxDate = '';
      chunk.forEach(function (entry) {
        const item = entry.item, code = String(item.code || '').trim().toUpperCase();
        if (!code) return;
        codes.push(code); names.push(String(item.name || '')); nameToCode[normalizeStoreName_(item.name)] = code; histories[code] = [];
        Object.keys(entry.dates).forEach(function (date) { if (!maxDate || date > maxDate) maxDate = date; });
      });
      if (!codes.length) continue;

      const exclusionSql = excludedSourceHashes.length
        ? 'AND (source_hash IS NULL OR source_hash NOT IN UNNEST(@excludedSourceHashes)) '
        : '';
      const sql = 'WITH scoped AS (SELECT * FROM ' + stockCardTable_() + ' ' +
        'WHERE record_type = \'MOVEMENT\' AND outlet = @outlet AND location = @location AND event_date <= CAST(@maxDate AS DATE) ' +
        exclusionSql +
        'AND (item_code IN UNNEST(@codes) OR ((item_code IS NULL OR item_code = \'\') AND item_name IN UNNEST(@names)))), ' +
        'latest AS (SELECT * FROM scoped QUALIFY ROW_NUMBER() OVER (' +
        'PARTITION BY COALESCE(NULLIF(logical_id, \'\'), record_id) ORDER BY COALESCE(version, 1) DESC, created_at DESC) = 1), ' +
        'ranked AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY COALESCE(NULLIF(item_code, \'\'), item_name) ORDER BY event_date DESC, created_at DESC) AS item_rank FROM latest) ' +
        'SELECT record_id, COALESCE(NULLIF(logical_id, \'\'), record_id) AS logical_id, COALESCE(version, 1) AS version, ' +
        'item_code, item_name, event_date, direction, qty, movement_type, info, production_date, expiry_date, source_arrival_date, ' +
        'transfer_id, supplier, source_file, source_row, created_by, created_at FROM ranked WHERE item_rank <= 500 ' +
        'ORDER BY item_code, item_name, event_date, created_at';

      const queryParams = { outlet: outlet, location: 'Store', maxDate: maxDate, codes: codes, names: names };
      if (excludedSourceHashes.length) queryParams.excludedSourceHashes = excludedSourceHashes;
      runNamedQuery_(sql, queryParams, { useQueryCache: false }).forEach(function (row) {
        let code = String(row.item_code || '').trim().toUpperCase();
        if (!histories[code]) code = nameToCode[normalizeStoreName_(row.item_name)] || '';
        if (!code || !histories[code]) return;
        histories[code].push(salesHistoryRowFromQuery_(row));
      });

      chunk.forEach(function (entry) {
        const code = String(entry.item.code || '').trim().toUpperCase();
        result[outlet][code] = result[outlet][code] || {};
        Object.keys(entry.dates).sort().forEach(function (date) {
          const history = (histories[code] || []).filter(function (movement) {
            return String(movement.date || '').slice(0, 10) <= date;
          });
          const snapshots = calculateFifoSnapshots_(history), dates = Object.keys(snapshots).sort();
          result[outlet][code][date] = dates.length ? snapshots[dates[dates.length - 1]].map(function (lot) {
            return { qty: Number(lot.qty || 0), productionDate: lot.productionDate || '', expiryDate: lot.expiryDate || '', sourceDate: lot.sourceDate || '' };
          }).filter(function (lot) { return lot.qty > 0.0000001; }) : [];
        });
      });
    }
  });
  return result;
}

function salesFifoLotsFor_(fifoState, outlet, code, transactionDate) {
  code = String(code || '').toUpperCase();
  if (!fifoState[outlet]) fifoState[outlet] = {};
  if (!fifoState[outlet][code]) fifoState[outlet][code] = {};
  if (!fifoState[outlet][code][transactionDate]) fifoState[outlet][code][transactionDate] = [];
  return fifoState[outlet][code][transactionDate];
}

function salesAvailableLotQty_(lots) {
  return (lots || []).reduce(function (sum, lot) { return sum + Math.max(0, Number(lot.qty || 0)); }, 0);
}

function salesConsolidateLots_(lots) {
  const map = {}, order = [];
  (lots || []).forEach(function (lot) {
    const key = [String(lot.productionDate || ''), String(lot.sourceDate || ''), String(lot.expiryDate || '')].join('|');
    if (!map[key]) {
      map[key] = { qty: 0, productionDate: lot.productionDate || '', sourceDate: lot.sourceDate || '', expiryDate: lot.expiryDate || '' };
      order.push(key);
    }
    map[key].qty += Number(lot.qty || 0);
  });
  return order.map(function (key) { return map[key]; }).filter(function (lot) { return lot.qty > 0.0000001; });
}

/**
 * Mengurangi snapshot tanggal berjalan dan seluruh snapshot tanggal berikutnya.
 * Untuk tanggal berikutnya cukup dikurangi secara FEFO/FIFO dari ending lot pada tanggal itu;
 * ini menjaga efek kumulatif upload multi-tanggal tanpa query ulang ke BigQuery.
 */
function salesConsumeInventoryLots_(fifoState, outlet, code, transactionDate, qty) {
  code = String(code || '').toUpperCase();
  qty = Number(qty);
  if (!isFinite(qty) || qty < 0 || qty > 100000000) {
    throw new Error(code + ': QTY pemotongan stock tidak wajar (' + qty + '). Upload dihentikan agar balance tidak rusak.');
  }
  const currentLots = salesFifoLotsFor_(fifoState, outlet, code, transactionDate);
  const allocated = salesConsolidateLots_(consumeSalesFifoLots_(currentLots, qty));
  const byDate = fifoState[outlet] && fifoState[outlet][code] ? fifoState[outlet][code] : {};
  Object.keys(byDate).filter(function (date) { return date > transactionDate; }).sort().forEach(function (date) {
    consumeSalesFifoLots_(byDate[date], qty);
  });
  return allocated;
}

/** Generated WIP selalu dibuat dan langsung dipakai oleh upload, sehingga lot hanya perlu
 * hadir pada snapshot tanggal transaksi. IN dan OUT akan menutup ke net 0. */
function salesAddGeneratedWipLot_(fifoState, outlet, code, transactionDate, qty) {
  const lots = salesFifoLotsFor_(fifoState, outlet, code, transactionDate);
  lots.push({ qty: Number(qty || 0), productionDate: transactionDate, expiryDate: '', sourceDate: transactionDate });
}

/** Mengambil lot secara FIFO/FEFO dari state memory dan langsung mengurangi sisa lot. */
function consumeSalesFifoLots_(lots, qty) {
  let remaining = Math.max(0, Number(qty || 0));
  const allocated = [];
  lots = lots || [];
  for (let i = 0; i < lots.length && remaining > 0.0000001; i++) {
    const available = Math.max(0, Number(lots[i].qty || 0));
    if (available <= 0.0000001) continue;
    const taken = Math.min(available, remaining);
    lots[i].qty = available - taken;
    remaining -= taken;
    allocated.push({ qty: taken, productionDate: lots[i].productionDate || '', expiryDate: lots[i].expiryDate || '', sourceDate: lots[i].sourceDate || '' });
  }
  for (let i = lots.length - 1; i >= 0; i--) if (Number(lots[i].qty || 0) <= 0.0000001) lots.splice(i, 1);
  if (remaining > 0.0000001) allocated.push({ qty: remaining, productionDate: '', expiryDate: '', sourceDate: '' });
  return allocated;
}


function selectSalesWipVariant_(wipCatalog, code, preferredName) {
  const variants = (wipCatalog && wipCatalog.byCode && wipCatalog.byCode[String(code || '').toUpperCase()]) || [];
  return variants.filter(function (variant) {
    return normalizeStoreName_(variant.name) === normalizeStoreName_(preferredName);
  })[0] || variants[0] || null;
}

function salesUploadCreatedAt_(clock, now) {
  clock.sequence = Number(clock.sequence || 0) + 1;
  return now.getTime() / 1000 + (clock.sequence / 1000000);
}

function salesWipCreatedAt_(state) {
  return salesUploadCreatedAt_(state.writeClock, state.now);
}

/**
 * Membuat WIP secara rekursif saat Sales COGS membutuhkan WIP tetapi stoknya tidak cukup.
 * Jika bahan resep juga merupakan WIP, stok WIP tersebut dipakai terlebih dahulu.
 * Kekurangannya dibuat otomatis sampai mencapai bahan paling dasar.
 */
function autoProduceSalesWipRecursive_(state, item, preferredName, outputQty, path, depth) {
  outputQty = Math.max(0, Number(outputQty || 0));
  if (outputQty <= 0.0000001) return null;
  depth = Number(depth || 0);
  if (depth > 10) throw new Error('Struktur WIP terlalu dalam untuk ' + item.code + ' · ' + item.name + '.');
  path = path || {};
  const code = String(item.code || '').toUpperCase();
  if (path[code]) throw new Error('Resep WIP berputar/circular terdeteksi pada ' + code + ' · ' + item.name + '.');
  const nextPath = Object.assign({}, path); nextPath[code] = true;

  const variant = selectSalesWipVariant_(state.wipCatalog, code, preferredName || item.name);
  if (!variant) throw new Error(code + ': resep WIP tidak ditemukan.');
  const outputToFormula = wipConversionFactor_(code, item.unit, variant.unit, state.provided, state.savedConversions);
  if (!outputToFormula) throw new Error(code + ': konversi unit hasil WIP belum tersedia.');
  const formulaQty = outputQty * outputToFormula;
  state.wipSequence = Number(state.wipSequence || 0) + 1;
  const productionId = state.traceId + '|WIP|' + code + '|' + String(state.wipSequence) + '|' + String(depth);
  const outputRecord = Utilities.getUuid();

  state.rows.push({ insertId: outputRecord, json: {
    record_id: outputRecord, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT',
    outlet: state.sale.outlet, location: 'Store', item_code: item.code, category: item.category, item_name: item.name, unit: item.unit,
    direction: 'IN', qty: outputQty, movement_type: 'Production',
    info: cleanText_('Produksi otomatis untuk Sold · ' + state.sale.menu + ' · Sales ' + state.sale.salesNumber, 500),
    production_date: state.sale.transactionDate, expiry_date: null, source_arrival_date: state.sale.transactionDate, event_date: state.sale.transactionDate,
    created_at: salesWipCreatedAt_(state), created_by: state.employee.nik,
    source_file: 'SALES_COGS|' + state.fileName, source_hash: state.sale.rowHash, source_row: state.sale.sourceRow,
    transfer_id: productionId
  }});
  salesAddGeneratedWipLot_(state.fifoState, state.sale.outlet, code, state.sale.transactionDate, outputQty);
  state.autoWipCount = Number(state.autoWipCount || 0) + 1;

  variant.materials.forEach(function (recipe) {
    const resolvedMaterial = resolveSalesRecipeMaterial_(recipe, state.masterByCode, state.salesMappings);
    const material = resolvedMaterial.item;
    if (!material) throw new Error(recipe.code + ' · ' + recipe.name + ': bahan WIP belum dipetakan ke STOCK_ITEMS.');
    const factor = wipConversionFactor_(material.code, recipe.unit, material.unit, state.provided, state.savedConversions);
    if (!factor) throw new Error(material.code + ': konversi unit bahan WIP belum tersedia.');
    const qty = safeWipMaterialQty_(recipe.qty, formulaQty, factor, recipe.code + ' · ' + recipe.name);
    const materialCode = String(material.code || '').toUpperCase();
    const materialIsWip = Boolean(state.wipCatalog.byCode[materialCode] && state.wipCatalog.byCode[materialCode].length);

    if (materialIsWip) {
      const materialLots = salesFifoLotsFor_(state.fifoState, state.sale.outlet, materialCode, state.sale.transactionDate);
      const available = salesAvailableLotQty_(materialLots);
      const shortage = Math.max(0, qty - available);
      if (shortage > 0.0000001) {
        autoProduceSalesWipRecursive_(state, material, material.name, shortage, nextPath, depth + 1);
      }
    }

    const allocatedLots = salesConsumeInventoryLots_(state.fifoState, state.sale.outlet, materialCode, state.sale.transactionDate, qty);
    allocatedLots.forEach(function (lot) {
      const usageId = Utilities.getUuid();
      state.rows.push({ insertId: usageId, json: {
        record_id: usageId, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT',
        outlet: state.sale.outlet, location: 'Store', item_code: material.code, category: material.category, item_name: material.name, unit: material.unit,
        direction: 'OUT', qty: lot.qty, movement_type: 'WIP Material Usage',
        info: cleanText_('Keluar untuk Produk: ' + item.name + ' · Sold ' + state.sale.menu + ' · Sales ' + state.sale.salesNumber, 500),
        production_date: lot.productionDate || null, expiry_date: lot.expiryDate || null, source_arrival_date: lot.sourceDate || null,
        event_date: state.sale.transactionDate, created_at: salesWipCreatedAt_(state), created_by: state.employee.nik,
        source_file: 'SALES_COGS|' + state.fileName, source_hash: state.sale.rowHash, source_row: state.sale.sourceRow,
        transfer_id: productionId
      }});
    });
  });

  return productionId;
}


function salesTargetIsWip_(sale, wipCatalog) {
  const code = String(sale && sale.item && sale.item.code || '').toUpperCase();
  return String(sale && sale.targetType || '').toUpperCase() === 'WIP' ||
    Boolean(code && wipCatalog && wipCatalog.byCode && wipCatalog.byCode[code] && wipCatalog.byCode[code].length);
}

function uploadSalesCogs(token, payload) {
  return safe_(function () {
    const session = requireSession_(token), employee = findEmployee_(session.nik); assertEmployeeActive_(employee);
    const prepared = prepareSalesCogsImport_(employee, payload || {}, false), rows = [], now = new Date();
    const wipCatalog = readWipRecipeCatalog_(), savedConversions = readStockUnitConversions_(), provided = payload.conversions || {}, salesMappings = readSalesProductMappings_();
    const masterByCode = {}, writeClock = { sequence: 0 };
    let autoWipCount = 0;
    readStockMaster_(true).forEach(function (item) { masterByCode[String(item.code || '').toUpperCase()] = item; });
    const fifoState = preloadSalesFifoLots_(prepared.rows, wipCatalog, masterByCode, salesMappings);

    prepared.rows.forEach(function (sale) {
      const traceId = 'SALE|' + sale.rowHash, itemCode = String(sale.item.code || '').toUpperCase();
      let soldLots = [];

      if (salesTargetIsWip_(sale, wipCatalog)) {
        const available = salesAvailableLotQty_(salesFifoLotsFor_(fifoState, sale.outlet, itemCode, sale.transactionDate));
        const shortage = Math.max(0, sale.qtyDefault - available);
        if (shortage > 0.0000001) {
          const state = {
            rows: rows, fifoState: fifoState, wipCatalog: wipCatalog, savedConversions: savedConversions, provided: provided,
            masterByCode: masterByCode, salesMappings: salesMappings, traceId: traceId, sale: sale, employee: employee, fileName: prepared.fileName,
            now: now, writeClock: writeClock, autoWipCount: 0, wipSequence: 0
          };
          autoProduceSalesWipRecursive_(state, sale.item, sale.target && sale.target.name ? sale.target.name : sale.item.name, shortage, {}, 0);
          autoWipCount += Number(state.autoWipCount || 0);
        }
        // Setelah kekurangan WIP dibuat, seluruh qty langsung dipotong kembali.
        // Karena generated IN dan Sold OUT terjadi pada tanggal yang sama, generated WIP selalu net 0.
        soldLots = salesConsumeInventoryLots_(fifoState, sale.outlet, itemCode, sale.transactionDate, sale.qtyDefault);
      } else {
        soldLots = salesConsumeInventoryLots_(fifoState, sale.outlet, itemCode, sale.transactionDate, sale.qtyDefault);
      }

      const allocatedQty = soldLots.reduce(function (sum, lot) { return sum + Number(lot.qty || 0); }, 0);
      const allocationTolerance = Math.max(0.0000001, Math.abs(Number(sale.qtyDefault || 0)) * 0.000001);
      if (!isFinite(allocatedQty) || Math.abs(allocatedQty - Number(sale.qtyDefault || 0)) > allocationTolerance) {
        throw new Error(sale.product + ' baris ' + sale.sourceRow + ': hasil alokasi FIFO (' + allocatedQty + ') tidak sama dengan QTY penjualan (' + sale.qtyDefault + '). Upload dibatalkan agar stock tetap konsisten.');
      }

      soldLots.forEach(function (lot) {
        if (!isFinite(Number(lot.qty)) || Number(lot.qty) < 0 || Number(lot.qty) > 100000000) {
          throw new Error(sale.product + ' baris ' + sale.sourceRow + ': QTY lot FIFO tidak wajar (' + lot.qty + '). Upload dibatalkan.');
        }
        const id = Utilities.getUuid();
        rows.push({ insertId: id, json: {
          record_id: id, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT',
          outlet: sale.outlet, location: 'Store', item_code: sale.item.code, category: sale.item.category, item_name: sale.item.name, unit: sale.item.unit,
          direction: 'OUT', qty: lot.qty, movement_type: 'Sold',
          info: cleanText_('Sold · ' + sale.menu + ' · Sales Number ' + sale.salesNumber, 500),
          production_date: lot.productionDate || null, expiry_date: lot.expiryDate || null, source_arrival_date: lot.sourceDate || null,
          event_date: sale.transactionDate, created_at: salesUploadCreatedAt_(writeClock, now), created_by: employee.nik,
          source_file: 'SALES_COGS|' + prepared.fileName, source_hash: sale.rowHash, source_row: sale.sourceRow, transfer_id: traceId
        }});
      });
    });

    prepared.showcaseRows.forEach(function (sale) {
      const id = Utilities.getUuid();
      rows.push({ insertId: id, json: {
        record_id: id, logical_id: id, version: 1, record_type: 'IMPORT', outlet: sale.outlet, location: 'Showcase',
        item_code: sale.target.code, item_name: sale.target.name, unit: sale.unit, direction: null, qty: 0, movement_type: 'Sold',
        info: cleanText_('Sold Showcase (tanpa potong stock) · ' + sale.menu + ' · Sales Number ' + sale.salesNumber, 500),
        expiry_date: null, event_date: sale.transactionDate, created_at: salesUploadCreatedAt_(writeClock, now), created_by: employee.nik,
        source_file: 'SALES_COGS|' + prepared.fileName, source_hash: sale.rowHash, source_row: sale.sourceRow,
        transfer_id: 'SALE|' + sale.rowHash
      }});
    });

    const lock = acquireStockWriteLock_();
    try { insertStockCardRows_(rows); } finally { lock.releaseLock(); }
    prepared.outlets.forEach(function (outlet) {
      prepared.dates.forEach(function (date) {
        markStockTaskCompleteFromUploads_({ outlet: outlet, location: 'Store', employee: employee }, date, 'Sold');
      });
    });
    return {
      uploaded: true, outlet: prepared.outlets.join(', '), outlets: prepared.outlets,
      transactionDate: prepared.dates[0], transactionDates: prepared.dates, itemCount: prepared.rows.length,
      showcaseRowsSkipped: prepared.showcaseRows.length, duplicateItemsSkipped: prepared.duplicateRowsSkipped,
      negativeItemCount: 0, autoWipProductionCount: autoWipCount
    };
  });
}


function buildSalesRepairExpectedRows_(prepared, employee, payload, excludedSourceHashes) {
  payload = payload || {};
  const rows = [], now = new Date();
  const wipCatalog = readWipRecipeCatalog_(), savedConversions = readStockUnitConversions_(),
    provided = payload.conversions || {}, salesMappings = readSalesProductMappings_();
  const masterByCode = {}, writeClock = { sequence: 0 };
  let autoWipCount = 0;
  readStockMaster_(true).forEach(function (item) { masterByCode[String(item.code || '').toUpperCase()] = item; });
  const fifoState = preloadSalesFifoLots_(prepared.rows, wipCatalog, masterByCode, salesMappings, excludedSourceHashes || []);

  prepared.rows.forEach(function (sale) {
    const traceId = 'SALE|' + sale.rowHash, itemCode = String(sale.item.code || '').toUpperCase();
    let soldLots = [];

    if (salesTargetIsWip_(sale, wipCatalog)) {
      const available = salesAvailableLotQty_(salesFifoLotsFor_(fifoState, sale.outlet, itemCode, sale.transactionDate));
      const shortage = Math.max(0, sale.qtyDefault - available);
      if (shortage > 0.0000001) {
        const state = {
          rows: rows, fifoState: fifoState, wipCatalog: wipCatalog, savedConversions: savedConversions, provided: provided,
          masterByCode: masterByCode, salesMappings: salesMappings, traceId: traceId, sale: sale, employee: employee, fileName: prepared.fileName,
          now: now, writeClock: writeClock, autoWipCount: 0, wipSequence: 0
        };
        autoProduceSalesWipRecursive_(state, sale.item, sale.target && sale.target.name ? sale.target.name : sale.item.name, shortage, {}, 0);
        autoWipCount += Number(state.autoWipCount || 0);
      }
      soldLots = salesConsumeInventoryLots_(fifoState, sale.outlet, itemCode, sale.transactionDate, sale.qtyDefault);
    } else {
      soldLots = salesConsumeInventoryLots_(fifoState, sale.outlet, itemCode, sale.transactionDate, sale.qtyDefault);
    }

    const allocatedQty = soldLots.reduce(function (sum, lot) { return sum + Number(lot.qty || 0); }, 0);
    const tolerance = Math.max(0.0000001, Math.abs(Number(sale.qtyDefault || 0)) * 0.000001);
    if (!isFinite(allocatedQty) || Math.abs(allocatedQty - Number(sale.qtyDefault || 0)) > tolerance) {
      throw new Error(sale.product + ' baris ' + sale.sourceRow + ': hasil alokasi FIFO repair (' + allocatedQty +
        ') tidak sama dengan QTY sumber (' + sale.qtyDefault + '). Repair dihentikan.');
    }

    soldLots.forEach(function (lot) {
      if (!isFinite(Number(lot.qty)) || Number(lot.qty) < 0 || Number(lot.qty) > 100000000) {
        throw new Error(sale.product + ' baris ' + sale.sourceRow + ': QTY lot hasil repair tidak wajar (' + lot.qty + ').');
      }
      const id = Utilities.getUuid();
      rows.push({ insertId: id, json: {
        record_id: id, logical_id: Utilities.getUuid(), version: 1, record_type: 'MOVEMENT',
        outlet: sale.outlet, location: 'Store', item_code: sale.item.code, category: sale.item.category, item_name: sale.item.name, unit: sale.item.unit,
        direction: 'OUT', qty: lot.qty, movement_type: 'Sold',
        info: cleanText_('Sold · ' + sale.menu + ' · Sales Number ' + sale.salesNumber, 500),
        production_date: lot.productionDate || null, expiry_date: lot.expiryDate || null, source_arrival_date: lot.sourceDate || null,
        event_date: sale.transactionDate, created_at: salesUploadCreatedAt_(writeClock, now), created_by: employee.nik,
        source_file: 'SALES_COGS|' + prepared.fileName, source_hash: sale.rowHash, source_row: sale.sourceRow, transfer_id: traceId
      }});
    });
  });

  return { rows: rows, autoWipProductionCount: autoWipCount };
}

function readActiveSalesRepairRows_(sourceHashes) {
  const hashes = (sourceHashes || []).map(function (value) { return String(value || ''); }).filter(Boolean);
  const result = [], chunkSize = 50;
  for (let offset = 0; offset < hashes.length; offset += chunkSize) {
    const chunk = hashes.slice(offset, offset + chunkSize);
    const sql = 'WITH scoped AS (SELECT * FROM ' + stockCardTable_() +
      ' WHERE record_type = \'MOVEMENT\' AND source_hash IN UNNEST(@hashes)), ' +
      'latest AS (SELECT * FROM scoped QUALIFY ROW_NUMBER() OVER (' +
      'PARTITION BY COALESCE(NULLIF(logical_id, \'\'), record_id) ORDER BY COALESCE(version, 1) DESC, created_at DESC) = 1) ' +
      'SELECT record_id,COALESCE(NULLIF(logical_id,\'\'),record_id) AS logical_id,COALESCE(version,1) AS version,' +
      'outlet,location,item_code,category,item_name,unit,direction,qty,movement_type,info,production_date,expiry_date,' +
      'source_arrival_date,transfer_id,event_date,created_at,created_by,source_file,source_hash,source_row ' +
      'FROM latest WHERE direction IN (\'IN\',\'OUT\',\'LOT\') ' +
      'AND movement_type IN (\'Sold\',\'Terjual\',\'WIP Material Usage\',\'Production\') ' +
      'ORDER BY event_date,source_row,created_at,item_code';
    runNamedQuery_(sql, { hashes: chunk }, { useQueryCache: false }).forEach(function (row) {
      result.push({
        recordId: String(row.record_id || ''), logicalId: String(row.logical_id || row.record_id || ''),
        version: Number(row.version || 1), outlet: String(row.outlet || ''), location: String(row.location || 'Store'),
        itemCode: String(row.item_code || ''), category: String(row.category || ''), itemName: String(row.item_name || ''),
        unit: String(row.unit || ''), direction: String(row.direction || ''), qty: Number(row.qty || 0),
        movementType: String(row.movement_type || ''), info: String(row.info || ''),
        productionDate: String(row.production_date || ''), expiryDate: String(row.expiry_date || ''),
        sourceArrivalDate: String(row.source_arrival_date || ''), transferId: String(row.transfer_id || ''),
        eventDate: String(row.event_date || ''), createdAt: String(row.created_at || ''), createdBy: String(row.created_by || ''),
        sourceFile: String(row.source_file || ''), sourceHash: String(row.source_hash || ''), sourceRow: Number(row.source_row || 0)
      });
    });
  }
  return result;
}

function salesRepairRowView_(entry) {
  const row = entry && entry.json ? entry.json : entry || {};
  return {
    itemCode: String(row.item_code !== undefined ? row.item_code : row.itemCode || ''),
    unit: String(row.unit || ''),
    direction: String(row.direction || ''),
    qty: Number(row.qty || 0),
    movementType: String(row.movement_type !== undefined ? row.movement_type : row.movementType || ''),
    productionDate: String(row.production_date !== undefined ? row.production_date || '' : row.productionDate || ''),
    expiryDate: String(row.expiry_date !== undefined ? row.expiry_date || '' : row.expiryDate || ''),
    sourceArrivalDate: String(row.source_arrival_date !== undefined ? row.source_arrival_date || '' : row.sourceArrivalDate || ''),
    sourceHash: String(row.source_hash !== undefined ? row.source_hash || '' : row.sourceHash || '')
  };
}

function salesRepairNumberKey_(value) {
  const number = Number(value || 0);
  if (!isFinite(number)) return String(number);
  if (Math.abs(number) < 0.000000000001) return '0';
  return number.toPrecision(15);
}

function salesRepairMovementSignature_(entry) {
  const row = salesRepairRowView_(entry);
  return [
    row.itemCode.toUpperCase(), row.unit.toUpperCase(), row.direction, row.movementType,
    salesRepairNumberKey_(row.qty), row.productionDate, row.sourceArrivalDate, row.expiryDate
  ].join('|');
}

function salesRepairSignatureList_(rows) {
  return (rows || []).map(salesRepairMovementSignature_).sort();
}

function salesRepairDifferenceCount_(oldRows, expectedRows) {
  const counts = {};
  salesRepairSignatureList_(oldRows).forEach(function (key) { counts[key] = Number(counts[key] || 0) + 1; });
  salesRepairSignatureList_(expectedRows).forEach(function (key) { counts[key] = Number(counts[key] || 0) - 1; });
  return Object.keys(counts).reduce(function (sum, key) { return sum + Math.abs(Number(counts[key] || 0)); }, 0);
}

function salesRepairToken_(fileName, hashes, oldRows, expectedRows) {
  const oldState = (oldRows || []).map(function (row) {
    return [row.logicalId, row.version, row.recordId, row.sourceHash, salesRepairMovementSignature_(row)].join('|');
  }).sort();
  const expectedState = salesRepairSignatureList_(expectedRows);
  return digest_([String(fileName || ''), (hashes || []).slice().sort().join(','), oldState.join('\n'), expectedState.join('\n')].join('\n---\n'));
}

function prepareSalesCogsRepairPlan_(employee, payload) {
  payload = payload || {};
  const prepared = prepareSalesCogsImport_(employee, payload, false, { includeExisting: true });
  const candidateHashes = prepared.rows.map(function (row) { return row.rowHash; }).filter(function (value, index, list) { return value && list.indexOf(value) === index; });
  if (!candidateHashes.length) throw new Error('File tidak memiliki baris Sales COGS yang dapat dicocokkan dengan histori.');

  const oldRowsAll = readActiveSalesRepairRows_(candidateHashes), matched = {};
  oldRowsAll.forEach(function (row) { if (row.sourceHash) matched[row.sourceHash] = true; });
  const matchedRows = prepared.rows.filter(function (row) { return Boolean(matched[row.rowHash]); });
  if (!matchedRows.length) {
    throw new Error('Tidak ditemukan transaksi lama aktif yang cocok dengan file ini. Pastikan file berasal dari Sales Menu COGS Detail yang pernah di-upload.');
  }
  const matchedHashes = matchedRows.map(function (row) { return row.rowHash; }).filter(function (value, index, list) { return list.indexOf(value) === index; });
  const matchedHashMap = {};
  matchedHashes.forEach(function (hash) { matchedHashMap[hash] = true; });
  const oldRows = oldRowsAll.filter(function (row) { return matchedHashMap[row.sourceHash]; });

  // Simulasikan ulang seluruh source row yang ditemukan. Seluruh movement lama dari source row
  // tersebut dikeluarkan dari snapshot FIFO lebih dulu, sehingga hasil tidak terpengaruh angka korup.
  const simulationPrepared = {
    fileName: prepared.fileName,
    rows: matchedRows,
    showcaseRows: [],
    duplicateRowsSkipped: 0,
    zeroRowsSkipped: prepared.zeroRowsSkipped,
    outlets: matchedRows.map(function (row) { return row.outlet; }).filter(function (value, index, list) { return list.indexOf(value) === index; }),
    dates: matchedRows.map(function (row) { return row.transactionDate; }).filter(function (value, index, list) { return list.indexOf(value) === index; })
  };
  const expectedBuild = buildSalesRepairExpectedRows_(simulationPrepared, employee, payload, matchedHashes);
  const expectedRows = expectedBuild.rows;

  const oldByHash = {}, expectedByHash = {}, sourceByHash = {};
  oldRows.forEach(function (row) {
    if (!oldByHash[row.sourceHash]) oldByHash[row.sourceHash] = [];
    oldByHash[row.sourceHash].push(row);
  });
  expectedRows.forEach(function (entry) {
    const hash = String(entry.json && entry.json.source_hash || '');
    if (!expectedByHash[hash]) expectedByHash[hash] = [];
    expectedByHash[hash].push(entry);
  });
  matchedRows.forEach(function (row) { sourceByHash[row.rowHash] = row; });

  const changes = [], changedHashes = [];
  matchedHashes.forEach(function (hash) {
    const source = sourceByHash[hash], oldGroup = oldByHash[hash] || [], expectedGroup = expectedByHash[hash] || [];
    const oldSignatures = salesRepairSignatureList_(oldGroup), newSignatures = salesRepairSignatureList_(expectedGroup);
    const changed = oldSignatures.join('\n') !== newSignatures.join('\n');
    if (!changed) return;
    changedHashes.push(hash);
    const oldDirectQty = oldGroup.filter(function (row) {
      return row.direction === 'OUT' && (row.movementType === 'Sold' || row.movementType === 'Terjual') &&
        String(row.itemCode || '').toUpperCase() === String(source.item.code || '').toUpperCase();
    }).reduce(function (sum, row) { return sum + Number(row.qty || 0); }, 0);
    const newDirectQty = expectedGroup.filter(function (entry) {
      const row = salesRepairRowView_(entry);
      return row.direction === 'OUT' && row.movementType === 'Sold' &&
        row.itemCode.toUpperCase() === String(source.item.code || '').toUpperCase();
    }).reduce(function (sum, entry) { return sum + Number(salesRepairRowView_(entry).qty || 0); }, 0);
    const wipChanged = oldGroup.some(function (row) { return row.movementType === 'WIP Material Usage' || row.movementType === 'Production'; }) ||
      expectedGroup.some(function (entry) {
        const type = salesRepairRowView_(entry).movementType;
        return type === 'WIP Material Usage' || type === 'Production';
      });
    changes.push({
      sourceHash: hash, sourceRow: source.sourceRow, outlet: source.outlet, date: source.transactionDate,
      salesNumber: source.salesNumber, menu: source.menu, product: source.product,
      unit: source.item.unit, sourceQty: source.qtyDefault, storedSoldQty: oldDirectQty, correctedSoldQty: newDirectQty,
      oldMovementCount: oldGroup.length, correctedMovementCount: expectedGroup.length,
      differenceCount: salesRepairDifferenceCount_(oldGroup, expectedGroup), wipAffected: wipChanged
    });
  });

  const changedHashMap = {};
  changedHashes.forEach(function (hash) { changedHashMap[hash] = true; });
  const changedOldRows = oldRows.filter(function (row) { return changedHashMap[row.sourceHash]; });
  const changedExpectedRows = expectedRows.filter(function (entry) { return changedHashMap[String(entry.json && entry.json.source_hash || '')]; });
  const token = salesRepairToken_(prepared.fileName, changedHashes, changedOldRows, changedExpectedRows);

  return {
    fileName: prepared.fileName, matchedRows: matchedRows, matchedHashes: matchedHashes,
    oldRows: oldRows, expectedRows: expectedRows, changes: changes, changedHashes: changedHashes,
    repairToken: token, autoWipProductionCount: expectedBuild.autoWipProductionCount,
    outlets: simulationPrepared.outlets, dates: simulationPrepared.dates,
    unmatchedRowCount: Math.max(0, prepared.rows.length - matchedRows.length)
  };
}

function previewSalesCogsRepair(token, payload) {
  return safe_(function () {
    const employee = requireAdmin_(token), plan = prepareSalesCogsRepairPlan_(employee, payload || {});
    return {
      verified: true, fileName: plan.fileName, sourceRowsFound: plan.matchedRows.length,
      rowsChanged: plan.changes.length, rowsAlreadyCorrect: plan.matchedRows.length - plan.changes.length,
      unmatchedRows: plan.unmatchedRowCount, repairToken: plan.repairToken,
      affectedOutlets: plan.outlets, affectedDates: plan.dates,
      movementRowsToReplace: plan.oldRows.filter(function (row) { return plan.changedHashes.indexOf(row.sourceHash) >= 0; }).length,
      correctedMovementRows: plan.expectedRows.filter(function (entry) { return plan.changedHashes.indexOf(String(entry.json && entry.json.source_hash || '')) >= 0; }).length,
      changes: plan.changes.slice(0, 120)
    };
  });
}

function salesRepairVoidRow_(oldRow, employee, now, sequence) {
  const id = Utilities.getUuid();
  return { insertId: id, json: {
    record_id: id, logical_id: oldRow.logicalId || oldRow.recordId, version: Number(oldRow.version || 1) + 1,
    record_type: 'MOVEMENT', outlet: oldRow.outlet, location: oldRow.location || 'Store',
    item_code: oldRow.itemCode || null, category: oldRow.category || null, item_name: oldRow.itemName || null, unit: oldRow.unit || null,
    direction: 'VOID', qty: 0, movement_type: 'Repair Void',
    info: cleanText_('Repair Upload Lama · membatalkan ' + oldRow.movementType + ' v' + Number(oldRow.version || 1) +
      ' · QTY lama ' + formatQty_(oldRow.qty), 500),
    production_date: null, expiry_date: null, source_arrival_date: null,
    event_date: oldRow.eventDate, created_at: now.getTime() / 1000 + (sequence / 1000000), created_by: employee.nik,
    source_file: oldRow.sourceFile || null, source_hash: oldRow.sourceHash || null, source_row: oldRow.sourceRow || null,
    transfer_id: oldRow.transferId || null
  }};
}

function repairSalesCogsUpload(token, payload) {
  return safe_(function () {
    const employee = requireAdmin_(token);
    payload = payload || {};
    const requestedToken = String(payload.repairToken || '');
    if (!requestedToken) throw new Error('Preview repair belum tersedia. Verifikasi file terlebih dahulu.');

    const plan = prepareSalesCogsRepairPlan_(employee, payload);
    if (requestedToken !== plan.repairToken) {
      throw new Error('Data Stock Card berubah setelah preview. Jalankan Verifikasi Repair ulang sebelum melanjutkan.');
    }
    if (!plan.changedHashes.length) {
      return { repaired: false, noChanges: true, sourceRowsFound: plan.matchedRows.length, rowsChanged: 0 };
    }

    const changed = {};
    plan.changedHashes.forEach(function (hash) { changed[hash] = true; });
    const oldRows = plan.oldRows.filter(function (row) { return changed[row.sourceHash]; });
    const correctedRows = plan.expectedRows.filter(function (entry) { return changed[String(entry.json && entry.json.source_hash || '')]; });
    const now = new Date(), voidRows = oldRows.map(function (row, index) {
      return salesRepairVoidRow_(row, employee, now, index + 1);
    });

    // Satu source row selalu diproses sebagai satu unit. Batch dibatasi agar request
    // insertAll tidak membengkak; bila koneksi putus di tengah, preview ulang akan
    // mengenali source row yang sudah benar dan hanya melanjutkan sisanya.
    const voidByHash = {}, correctedByHash = {};
    voidRows.forEach(function (entry) {
      const hash = String(entry.json && entry.json.source_hash || '');
      if (!voidByHash[hash]) voidByHash[hash] = [];
      voidByHash[hash].push(entry);
    });
    correctedRows.forEach(function (entry) {
      const hash = String(entry.json && entry.json.source_hash || '');
      if (!correctedByHash[hash]) correctedByHash[hash] = [];
      correctedByHash[hash].push(entry);
    });

    const lock = acquireStockWriteLock_();
    let processedHashes = 0, pendingBatch = [];
    function flushRepairBatch_() {
      if (!pendingBatch.length) return;
      insertStockCardRows_(pendingBatch);
      pendingBatch = [];
    }
    try {
      plan.changedHashes.forEach(function (hash) {
        const group = (voidByHash[hash] || []).concat(correctedByHash[hash] || []);
        if (pendingBatch.length && pendingBatch.length + group.length > 1500) flushRepairBatch_();
        if (group.length > 1500) insertStockCardRows_(group);
        else pendingBatch = pendingBatch.concat(group);
        processedHashes++;
      });
      flushRepairBatch_();
    } catch (error) {
      throw new Error('Repair berhenti setelah ' + processedHashes + ' source row diproses. Sebagian data mungkin sudah tersimpan. ' +
        'Buka kembali Repair Upload Lama dan verifikasi file yang sama untuk melanjutkan. Detail: ' + error.message);
    } finally {
      lock.releaseLock();
    }

    const scopes = {}, affectedItems = {};
    oldRows.concat(correctedRows.map(function (entry) {
      const row = entry.json || {};
      return { outlet: row.outlet, location: row.location, itemCode: row.item_code, itemName: row.item_name };
    })).forEach(function (row) {
      if (row.outlet && row.location) scopes[String(row.outlet).toUpperCase() + '|' + normalizeLocation_(row.location)] = { outlet: String(row.outlet).toUpperCase(), location: normalizeLocation_(row.location) };
      const itemCode = String(row.itemCode || '').toUpperCase();
      if (itemCode) affectedItems[itemCode] = true;
    });

    // Usahakan balance compact langsung sinkron. Dirty marker tetap ada sebagai fallback
    // bila streaming row belum terlihat seketika oleh query BigQuery.
    Object.keys(scopes).forEach(function (key) {
      const scope = scopes[key], dirtyKey = stockBalanceStateKey_('dirty', scope.outlet, scope.location);
      const expectedDirty = String(PropertiesService.getScriptProperties().getProperty(dirtyKey) || '');
      try { rebuildStockBalanceSummary_(scope.outlet, scope.location, expectedDirty); }
      catch (error) { console.error('Repair tersimpan; refresh balance background akan melanjutkan: ' + error.message); }
    });

    return {
      repaired: true, sourceRowsRepaired: plan.changedHashes.length,
      oldMovementRowsVoided: voidRows.length, correctedMovementRows: correctedRows.length,
      affectedItemCount: Object.keys(affectedItems).length, affectedOutlets: plan.outlets, affectedDates: plan.dates
    };
  });
}

function parseItemJournalReport_(base64, fileName) {
  const cells = extractReportCells_(base64, fileName, 'Item Journal');
  // ESB saat ini memakai header "Item Journal Date". Tetap terima format lama "Date"
  // agar file historis masih bisa di-upload.
  const required = ['ITEM JOURNAL NUMBER','BRANCH','PRODUCT CODE','PRODUCT','UNIT','QTY','STATUS'];
  let header;
  try {
    header = findReportHeader_(cells, required.concat(['ITEM JOURNAL DATE']));
    header.columns.DATE = header.columns['ITEM JOURNAL DATE'];
  } catch (currentHeaderError) {
    header = findReportHeader_(cells, required.concat(['DATE']));
  }
  // Additional Information pada Item Journal Report ESB berada di kolom O.
  // Kolom O dijadikan sumber utama sesuai format report aktual. Untuk kompatibilitas
  // file historis, header Additional Information/Remark tetap dipakai sebagai fallback.
  if (!header.columns['ADDITIONAL INFORMATION']) {
    ['ADDITIONAL INFO','REMARK','REMARKS'].some(function (alias) {
      if (!header.columns[alias]) return false;
      header.columns['ADDITIONAL INFORMATION'] = header.columns[alias];
      return true;
    });
  }
  const rows = [], skipped = 0;
  reportDataRows_(cells, header, 'ITEM JOURNAL NUMBER').forEach(function (n) {
    if (normalizeHeader_(reportCell_(cells, header, 'STATUS', n)) !== 'AUTHORIZED') { skipped++; return; }
    const number = cleanText_(reportCell_(cells, header, 'ITEM JOURNAL NUMBER', n), 120), code = cleanText_(reportCell_(cells, header, 'PRODUCT CODE', n), 80).toUpperCase();
    if (!number || !code) return;
    const qty = parseReportNumber_(reportCell_(cells, header, 'QTY', n));
    if (!isFinite(qty) || Math.abs(qty) <= 0.0000001) return;
    rows.push({ sourceRow:n, journalNumber:number, transactionDate:parseReportDate_(reportCell_(cells, header, 'DATE', n),'EVENT',n,'Item Journal Date'), outletName:cleanText_(reportCell_(cells, header, 'BRANCH', n),180), code:code, name:cleanText_(reportCell_(cells, header, 'PRODUCT', n),180), unit:normalizeUnit_(reportCell_(cells, header, 'UNIT', n)), qty:qty, additionalInfo:cleanText_(cells['O'+n] || reportCell_(cells, header, 'ADDITIONAL INFORMATION', n),260) });
  });
  if (!rows.length) throw new Error('Tidak ada baris Item Journal berstatus Authorized yang dapat diproses.');
  return { rows: rows, unauthorizedRowsSkipped: skipped };
}

function prepareItemJournalImport_(employee, payload, allowPending) {
  const fileName=cleanText_(payload.fileName,180), report=parseItemJournalReport_(String(payload.base64||'').replace(/^data:[^,]+,/,''),fileName), directory=readStoreCodeDirectory_(), master={}, saved=readStockUnitConversions_(), provided=payload.conversions||{}, conversions={}, rows=[], skipped=0, existingByScope={};
  readStockMaster_(true).forEach(function(item){master[item.code]=item;});
  report.rows.forEach(function(row){const d=directory.byName[normalizeStoreName_(row.outletName)],outlet=d&&d.code;if(!outlet)throw new Error('Outlet "'+row.outletName+'" belum terdaftar pada STORE CODE.');if(employee.outlet!=='BIHQ'&&outlet!==employee.outlet)throw new Error('Item Journal memuat outlet '+outlet+', bukan outlet login '+employee.outlet+'.');const item=master[row.code];if(!item)throw new Error(row.code+' · '+row.name+': item tidak ditemukan pada STOCK_ITEMS.');const factor=resolveUnitConversionFactor_(item.code,row.unit,item.unit,provided,saved);if(!factor){const key=stockConversionKey_(item.code,row.unit,item.unit);conversions[key]={key:key,itemCode:item.code,itemName:item.name,fromUnit:row.unit,toUnit:item.unit};return;}row.outlet=outlet;row.item=item;row.qtyDefault=row.qty*factor;row.rowHash=digest_([outlet,row.transactionDate,row.journalNumber,row.code,row.unit,String(row.qty)].join('|'));const scope=outlet+'|'+row.transactionDate;if(!existingByScope[scope]){existingByScope[scope]={};const sql='SELECT DISTINCT source_hash FROM '+stockCardTable_()+' WHERE outlet=@outlet AND event_date=CAST(@date AS DATE) AND movement_type=\'Item Journal\' AND source_hash IS NOT NULL';runNamedQuery_(sql,{outlet:outlet,date:row.transactionDate},{useQueryCache:false}).forEach(function(found){if(found.source_hash)existingByScope[scope][String(found.source_hash)]=true;});}if(existingByScope[scope][row.rowHash])skipped++;else rows.push(row);});
  const missing=Object.keys(conversions).map(function(k){return conversions[k];});if(missing.length){if(!allowPending)throw new Error('Lengkapi seluruh konversi unit Item Journal.');return{requiresConversion:true,conversions:missing};}if(!rows.length)throw new Error('Semua baris Authorized pada file ini sudah pernah disimpan.');return{fileName:fileName,rows:rows,duplicateRowsSkipped:skipped,unauthorizedRowsSkipped:report.unauthorizedRowsSkipped};
}

function previewItemJournalUpload(token,payload){return safe_(function(){const s=requireSession_(token),e=findEmployee_(s.nik);assertEmployeeActive_(e);const p=prepareItemJournalImport_(e,payload||{},true);if(p.requiresConversion)return p;return{verified:true,itemCount:p.rows.length,outlets:p.rows.map(function(r){return r.outlet;}).filter(function(v,i,a){return a.indexOf(v)===i;}),transactionDates:p.rows.map(function(r){return r.transactionDate;}).filter(function(v,i,a){return a.indexOf(v)===i;}),duplicateRowsSkipped:p.duplicateRowsSkipped,unauthorizedRowsSkipped:p.unauthorizedRowsSkipped};});}

function uploadItemJournal(token,payload){return safe_(function(){const s=requireSession_(token),e=findEmployee_(s.nik);assertEmployeeActive_(e);const p=prepareItemJournalImport_(e,payload||{},false),now=new Date(),rows=p.rows.map(function(line){const id=Utilities.getUuid(),direction=line.qtyDefault<0?'OUT':'IN';return{insertId:id,json:{record_id:id,logical_id:Utilities.getUuid(),version:1,record_type:'MOVEMENT',outlet:line.outlet,location:'Store',item_code:line.item.code,category:line.item.category,item_name:line.item.name,unit:line.item.unit,direction:direction,qty:Math.abs(line.qtyDefault),movement_type:'Item Journal',info:cleanText_('Item Journal Number: '+line.journalNumber+' | Additional Information: '+(line.additionalInfo||'-'),500),expiry_date:null,event_date:line.transactionDate,created_at:now.getTime()/1000,created_by:e.nik,source_file:'ITEM_JOURNAL|'+p.fileName,source_hash:line.rowHash,source_row:line.sourceRow}};});const lock=acquireStockWriteLock_();try{insertStockCardRows_(rows);}finally{lock.releaseLock();}return{uploaded:true,itemCount:rows.length,duplicateRowsSkipped:p.duplicateRowsSkipped,unauthorizedRowsSkipped:p.unauthorizedRowsSkipped};});}


function parseMockRecallSoldInfo_(info) {
  const match = /^Sold(?: Showcase \(tanpa potong stock\))? · (.*?) · Sales Number (.*)$/.exec(String(info || '').trim());
  return match ? { menu: String(match[1] || '').trim(), salesNumber: String(match[2] || '').trim() } : null;
}

function parseMockRecallWipUsageInfo_(info) {
  const match = /^Keluar untuk Produk: (.*?) · Sold (.*?) · Sales (.*)$/.exec(String(info || '').trim());
  return match ? { parent: String(match[1] || '').trim(), menu: String(match[2] || '').trim(), salesNumber: String(match[3] || '').trim() } : null;
}


function parseMockRecallAutoProductionInfo_(info) {
  const match = /^Produksi otomatis untuk Sold · (.*?) · Sales (.*)$/.exec(String(info || '').trim());
  return match ? { menu: String(match[1] || '').trim(), salesNumber: String(match[2] || '').trim() } : null;
}

function mockRecallUniqueDates_(values) {
  const seen = {}, result = [];
  (values || []).forEach(function (value) {
    value = String(value || '').trim();
    if (!value || seen[value]) return;
    seen[value] = true; result.push(value);
  });
  return result.sort();
}

function mockRecallDateOnly_(value) {
  return String(value || '').slice(0, 10);
}

function mockRecallSplitRowsByQty_(rows, firstQty) {
  let remaining = Math.max(0, Number(firstQty || 0));
  const first = [], rest = [];
  (rows || []).forEach(function (row) {
    const qty = Math.max(0, Number(row.qty || 0));
    if (qty <= 0.0000001) return;
    if (remaining > 0.0000001) {
      const taken = Math.min(qty, remaining);
      if (taken > 0.0000001) {
        const clone = Object.assign({}, row); clone.qty = taken; first.push(clone);
        remaining -= taken;
      }
      const leftover = qty - taken;
      if (leftover > 0.0000001) {
        const clone = Object.assign({}, row); clone.qty = leftover; rest.push(clone);
      }
    } else {
      rest.push(Object.assign({}, row));
    }
  });
  return { first: first, rest: rest };
}

function mockRecallGeneratedWipAllocation_(state, sourceRow, code, consumedQty, forceRecipe) {
  consumedQty = Math.max(0, Number(consumedQty || 0));
  if (forceRecipe) return { qty: consumedQty, dates: state.saleDate ? [state.saleDate] : [] };
  if (!state.generatedRemaining) {
    state.generatedRemaining = {};
    state.generatedDatesByKey = {};
    (state.generatedProductions || []).forEach(function (row) {
      const key = String(row.source_row || '') + '|' + String(row.item_code || '').toUpperCase();
      state.generatedRemaining[key] = Number(state.generatedRemaining[key] || 0) + Math.max(0, Number(row.qty || 0));
      if (!state.generatedDatesByKey[key]) state.generatedDatesByKey[key] = [];
      const date = mockRecallDateOnly_(row.production_date || row.event_date);
      if (date && state.generatedDatesByKey[key].indexOf(date) < 0) state.generatedDatesByKey[key].push(date);
    });
  }
  const key = String(sourceRow || '') + '|' + String(code || '').toUpperCase();
  const available = Math.max(0, Number(state.generatedRemaining[key] || 0));
  const qty = Math.min(consumedQty, available);
  state.generatedRemaining[key] = Math.max(0, available - qty);
  return { qty: qty, dates: qty > 0.0000001 ? (state.generatedDatesByKey[key] || []).slice().sort() : [] };
}

function mockRecallWipSourceRows_(state, code) {
  code = String(code || '').toUpperCase();
  state.wipSourceCache = state.wipSourceCache || {};
  if (Object.prototype.hasOwnProperty.call(state.wipSourceCache, code)) return state.wipSourceCache[code];
  const table = stockCardTable_();
  const sql = 'WITH scoped AS (SELECT * FROM ' + table + ' WHERE record_type=\'MOVEMENT\' AND outlet=@outlet AND location=\'Store\' ' +
    'AND item_code=@code AND direction=\'IN\' AND movement_type IN (\'Production\',\'Transfer In\')), ' +
    'latest AS (SELECT * FROM scoped QUALIFY ROW_NUMBER() OVER (PARTITION BY COALESCE(NULLIF(logical_id,\'\'),record_id) ' +
    'ORDER BY COALESCE(version,1) DESC,created_at DESC)=1) ' +
    'SELECT event_date,movement_type,production_date,expiry_date,source_arrival_date,source_file,transfer_id,created_at FROM latest ORDER BY event_date,created_at';
  const rows = runNamedQuery_(sql, { outlet: state.outlet, code: code }, { useQueryCache: false });
  state.wipSourceCache[code] = rows;
  return rows;
}

function mockRecallWipExistingLots_(state, code, rows) {
  const grouped = {}, order = [];
  (rows || []).forEach(function (row) {
    const arrivalDate = mockRecallDateOnly_(row.source_arrival_date);
    const productionDate = mockRecallDateOnly_(row.production_date);
    const expiryDate = mockRecallDateOnly_(row.expiry_date);
    const unit = String(row.unit || '');
    const key = [arrivalDate, productionDate, expiryDate, unit].join('|');
    if (!grouped[key]) {
      grouped[key] = { qty: 0, unit: unit, arrivalDate: arrivalDate, productionDate: productionDate, expiryDate: expiryDate, sourceType: 'stock' };
      order.push(key);
    }
    grouped[key].qty += Math.max(0, Number(row.qty || 0));
  });
  if (!order.length) return [];

  const sources = mockRecallWipSourceRows_(state, code);
  function expiryMatches(source, lot) {
    const sourceExpiry = mockRecallDateOnly_(source.expiry_date);
    return !lot.expiryDate || !sourceExpiry || sourceExpiry === lot.expiryDate;
  }
  function productionMatches(source, lot) {
    const sourceProduction = mockRecallDateOnly_(source.production_date);
    return !lot.productionDate || !sourceProduction || sourceProduction === lot.productionDate;
  }

  return order.map(function (key) {
    const lot = grouped[key];
    const transfer = sources.filter(function (source) {
      return String(source.movement_type || '') === 'Transfer In' &&
        mockRecallDateOnly_(source.event_date) === lot.arrivalDate && expiryMatches(source, lot) && productionMatches(source, lot);
    })[0];
    if (transfer) {
      lot.sourceType = 'transfer';
      return lot;
    }
    const production = sources.filter(function (source) {
      if (String(source.movement_type || '') !== 'Production') return false;
      if (/^SALES_COGS\|/i.test(String(source.source_file || ''))) return false;
      const eventDate = mockRecallDateOnly_(source.event_date), sourceProduction = mockRecallDateOnly_(source.production_date);
      const dateMatch = lot.productionDate ? (sourceProduction === lot.productionDate || eventDate === lot.arrivalDate) : eventDate === lot.arrivalDate;
      return dateMatch && expiryMatches(source, lot);
    })[0];
    if (production) {
      lot.sourceType = 'production';
      if (!lot.productionDate) lot.productionDate = mockRecallDateOnly_(production.production_date || production.event_date);
      return lot;
    }
    // Jika row Sold WIP tidak mempunyai metadata lot dan tidak dapat ditautkan ke Production/Transfer,
    // jangan menyebutnya sebagai "Stock tersedia". Kondisi ini biasanya berarti upload lama memotong
    // WIP langsung tanpa membuat Production otomatis dan perlu diperbaiki lewat Repair Upload Lama.
    if (!lot.arrivalDate && !lot.productionDate && !lot.expiryDate) {
      lot.sourceType = 'untracked';
      return lot;
    }
    // Fallback hanya untuk histori lama yang masih mempunyai sebagian metadata asal.
    lot.sourceType = lot.productionDate ? 'production' : 'arrival';
    return lot;
  });
}

function appendMockRecallMaterialLots_(materials, rows, childOf, depth) {
  rows = rows || [];
  if (!rows.length) return;
  const byItem = {}, order = [];
  rows.forEach(function (row) {
    const key = [String(row.code || ''), String(row.material || ''), String(row.unit || '')].join('|');
    if (!byItem[key]) { byItem[key] = []; order.push(key); }
    byItem[key].push(row);
  });

  order.forEach(function (key) {
    const group = byItem[key], first = group[0], level = Number(depth || 0);
    if (group.length === 1) {
      first.childOf = childOf || first.childOf || '';
      first.depth = level;
      materials.push(first);
      return;
    }
    const totalQty = group.reduce(function (sum, row) { return sum + Number(row.qty || 0); }, 0);
    materials.push({
      rowType: 'materialGroup', code: first.code, material: first.material, unit: first.unit, qty: totalQty,
      batchCount: group.length, arrivalDate: '', productionDate: '', expiryDate: '',
      childOf: childOf || first.childOf || '', kind: first.kind || '', depth: level
    });
    group.forEach(function (row, index) {
      materials.push({
        rowType: 'batch', code: row.code, material: 'Batch ' + String(index + 1), unit: row.unit, qty: row.qty,
        arrivalDate: row.arrivalDate, productionDate: row.productionDate, expiryDate: row.expiryDate,
        childOf: childOf || row.childOf || '', kind: row.kind || '', depth: level + 1, batchIndex: index + 1
      });
    });
  });
}

function appendMockRecallWipTree_(state, code, name, consumedRows, sourceRow, depth, path, forceRecipe) {
  code = String(code || '').toUpperCase();
  name = String(name || '');
  depth = Number(depth || 0);
  path = path || {};
  if (depth > 10) return;

  const consumedQty = (consumedRows || []).reduce(function (sum, row) { return sum + Math.max(0, Number(row.qty || 0)); }, 0);
  const generated = mockRecallGeneratedWipAllocation_(state, sourceRow, code, consumedQty, forceRecipe);
  const generatedQty = Math.min(consumedQty, Math.max(0, Number(generated.qty || 0)));
  const existingQty = Math.max(0, consumedQty - generatedQty);
  // FIFO memakai stok yang sudah tersedia terlebih dahulu. Sisa di belakang adalah WIP yang baru generated oleh upload.
  const split = mockRecallSplitRowsByQty_(consumedRows, existingQty);
  const existingLots = mockRecallWipExistingLots_(state, code, split.first);

  state.materials.push({
    rowType: 'wipHeader', code: code, material: name, unit: (consumedRows[0] && consumedRows[0].unit) || '', qty: consumedQty,
    arrivalDate: '', productionDate: '', expiryDate: '', childOf: '', kind: 'WIP', depth: depth,
    existingLots: existingLots, generatedDates: generated.dates || [], generatedQty: generatedQty
  });

  // WIP existing dari produksi manual / transfer berhenti di level WIP. Bahan hanya dibuka untuk bagian yang generated saat upload Sales COGS.
  if (generatedQty <= 0.0000001 && !forceRecipe) return;

  if (path[code]) {
    state.materials.push({
      rowType: 'wipSubheader', code: '', material: 'Bahan-Bahan ' + name + ' · struktur WIP berputar',
      unit: '', qty: null, arrivalDate: '', productionDate: '', expiryDate: '', childOf: name, kind: 'WIP', depth: depth
    });
    return;
  }

  state.materials.push({
    rowType: 'wipSubheader', code: '', material: 'Bahan-Bahan ' + name + ' · Generated Upload', unit: '', qty: null,
    arrivalDate: '', productionDate: '', expiryDate: '', childOf: name, kind: 'WIP', depth: depth
  });

  const nextPath = Object.assign({}, path); nextPath[code] = true;
  let usageRows = [];
  if (!forceRecipe) {
    usageRows = state.sameDayUsage.filter(function (child) {
      return String(child.source_row || '') === String(sourceRow || '') &&
        normalizeStoreName_(child._mockRecallParent) === normalizeStoreName_(name);
    });
  }

  if (usageRows.length) {
    const childGroups = {}, childOrder = [];
    usageRows.forEach(function (row) {
      const key = [String(row.item_code || '').toUpperCase(), String(row.item_name || ''), String(row.unit || '')].join('|');
      if (!childGroups[key]) { childGroups[key] = []; childOrder.push(key); }
      childGroups[key].push(row);
    });

    childOrder.forEach(function (key) {
      const rawGroup = childGroups[key], expanded = expandMockRecallWipUsageLots_(state.outlet, rawGroup);
      const effective = expanded.length ? expanded : rawGroup;
      const first = effective[0] || rawGroup[0] || {};
      const childCode = String(first.item_code || '').toUpperCase(), childName = String(first.item_name || '');
      const childIsWip = Boolean(state.wipCatalog.byCode[childCode] && state.wipCatalog.byCode[childCode].length);
      if (childIsWip) {
        appendMockRecallWipTree_(state, childCode, childName, effective, sourceRow, depth + 1, nextPath, false);
      } else {
        appendMockRecallMaterialLots_(state.materials, aggregateMockRecallLots_(effective, name), name, depth + 1);
      }
    });
    return;
  }

  // Fallback hanya untuk generated upload lama yang belum menyimpan WIP Material Usage lengkap.
  const variant = selectSalesWipVariant_(state.wipCatalog, code, name);
  if (!variant) return;
  const outputItem = state.stockMasterByCode[code];
  const stockUnit = outputItem ? outputItem.unit : (consumedRows[0] && consumedRows[0].unit) || variant.unit;
  const outputFactor = wipConversionFactor_(code, stockUnit, variant.unit, {}, state.savedConversions) || 1;
  const formulaQty = generatedQty * outputFactor;

  variant.materials.forEach(function (recipe) {
    const material = state.stockMasterByCode[String(recipe.code || '').toUpperCase()];
    const targetUnit = material ? material.unit : recipe.unit;
    const factor = material ? (wipConversionFactor_(material.code, recipe.unit, targetUnit, {}, state.savedConversions) || 1) : 1;
    const qty = safeWipMaterialQty_(recipe.qty, formulaQty, factor, recipe.code + ' · ' + recipe.name);
    const pseudo = {
      record_id: '', logical_id: '', item_code: String(recipe.code || '').toUpperCase(),
      item_name: material ? material.name : String(recipe.name || ''), unit: String(targetUnit || recipe.unit || ''),
      qty: qty, movement_type: 'WIP Recipe', source_arrival_date: '', production_date: '', expiry_date: '',
      source_row: sourceRow
    };
    const childCode = String(pseudo.item_code || '').toUpperCase();
    const childIsWip = Boolean(state.wipCatalog.byCode[childCode] && state.wipCatalog.byCode[childCode].length);
    if (childIsWip) {
      appendMockRecallWipTree_(state, childCode, pseudo.item_name, [pseudo], sourceRow, depth + 1, nextPath, true);
    } else {
      appendMockRecallMaterialLots_(state.materials, aggregateMockRecallLots_([pseudo], name), name, depth + 1);
    }
  });
}

function aggregateMockRecallLots_(rows, childOf) {
  const map = {}, order = [];
  (rows || []).forEach(function (row) {
    const key = [String(row.item_code || ''), String(row.item_name || ''), String(row.unit || ''), String(row.source_arrival_date || ''), String(row.production_date || ''), String(row.expiry_date || '')].join('|');
    if (!map[key]) {
      map[key] = {
        rowType: 'material', code: String(row.item_code || ''), material: String(row.item_name || ''), unit: String(row.unit || ''), qty: 0,
        arrivalDate: String(row.source_arrival_date || ''), productionDate: String(row.production_date || ''), expiryDate: String(row.expiry_date || ''),
        childOf: childOf || '', kind: String(row.movement_type || '')
      };
      order.push(key);
    }
    map[key].qty += Number(row.qty || 0);
  });
  return order.map(function (key) { return map[key]; });
}


function expandMockRecallWipUsageLots_(outlet, usageRows) {
  usageRows = usageRows || [];
  if (!usageRows.length) return [];
  const pinned = [], unresolved = [];
  usageRows.forEach(function (row) {
    // Upload baru menyimpan lot yang benar langsung pada row. Jangan dihitung ulang,
    // karena rekalkulasi histori di kemudian hari dapat mengubah hasil trace transaksi lama.
    if (row.source_arrival_date || row.production_date || row.expiry_date) pinned.push(row);
    else unresolved.push(row);
  });

  const expanded = pinned.map(function (row) {
    const clone = Object.assign({}, row);
    clone.qty = Number(row.qty || 0) * Number(row._mockRecallScale || 1);
    return clone;
  });
  if (!unresolved.length) return expanded;

  const byCode = {}, chunkSize = 12;
  unresolved.forEach(function (row) {
    const code = String(row.item_code || '').trim().toUpperCase();
    if (code) byCode[code] = true;
  });
  const codes = Object.keys(byCode), movementMap = {};

  for (let offset = 0; offset < codes.length; offset += chunkSize) {
    const chunk = codes.slice(offset, offset + chunkSize);
    const sql = 'WITH scoped AS (SELECT * FROM ' + stockCardTable_() + ' WHERE record_type=\'MOVEMENT\' AND outlet=@outlet AND location=\'Store\' AND item_code IN UNNEST(@codes)), ' +
      'latest AS (SELECT * FROM scoped QUALIFY ROW_NUMBER() OVER (PARTITION BY COALESCE(NULLIF(logical_id,\'\'),record_id) ORDER BY COALESCE(version,1) DESC,created_at DESC)=1), ' +
      'ranked AS (SELECT *,ROW_NUMBER() OVER (PARTITION BY item_code ORDER BY event_date DESC,created_at DESC) AS item_rank FROM latest) ' +
      'SELECT record_id,COALESCE(NULLIF(logical_id,\'\'),record_id) AS logical_id,COALESCE(version,1) AS version,item_code,item_name,event_date,direction,qty,movement_type,info,' +
      'production_date,expiry_date,source_arrival_date,transfer_id,supplier,source_file,source_row,created_by,created_at FROM ranked WHERE item_rank<=500 ORDER BY item_code,event_date,created_at';
    const histories = {};
    runNamedQuery_(sql, { outlet: outlet, codes: chunk }, { useQueryCache: false }).forEach(function (raw) {
      const code = String(raw.item_code || '').trim().toUpperCase();
      if (!histories[code]) histories[code] = [];
      histories[code].push(salesHistoryRowFromQuery_(raw));
    });
    Object.keys(histories).forEach(function (code) {
      const history = histories[code];
      calculateFifoSnapshots_(history);
      history.forEach(function (movement) {
        if (movement.recordId) movementMap['R|' + movement.recordId] = movement;
        if (movement.logicalId) movementMap['L|' + movement.logicalId] = movement;
      });
    });
  }

  unresolved.forEach(function (row) {
    const movement = movementMap['R|' + String(row.record_id || '')] || movementMap['L|' + String(row.logical_id || '')], scale = Number(row._mockRecallScale || 1);
    const lots = movement && Array.isArray(movement.fifoUsageLots) ? movement.fifoUsageLots : [];
    if (lots.length) {
      lots.forEach(function (lot) {
        const clone = Object.assign({}, row);
        clone.qty = Number(lot.qty || 0) * scale;
        clone.source_arrival_date = String(lot.sourceDate || '');
        clone.production_date = String(lot.productionDate || '');
        clone.expiry_date = String(lot.expiryDate || '');
        expanded.push(clone);
      });
    } else {
      const clone = Object.assign({}, row);
      clone.qty = Number(row.qty || 0) * scale;
      expanded.push(clone);
    }
  });
  return expanded;
}

function loadMockRecallHistoricalWipUsage_(outlet, code, soldGroup) {
  const sql = latestStockMovementCte_() + ' SELECT record_id,COALESCE(NULLIF(logical_id,\'\'),record_id) AS logical_id,item_code,item_name,unit,qty,movement_type,info,' +
    'production_date,expiry_date,source_arrival_date,transfer_id,event_date,created_at FROM latest WHERE outlet=@outlet AND location=\'Store\' ' +
    'AND movement_type=\'Production\' AND item_code=@code ORDER BY event_date DESC,created_at DESC LIMIT 200';
  const productions = runNamedQuery_(sql, { outlet: outlet, code: code }, { useQueryCache: false });
  if (!productions.length) return [];

  const soldLots = {};
  (soldGroup || []).forEach(function (row) {
    const key = [String(row.production_date || ''), String(row.source_arrival_date || ''), String(row.expiry_date || '')].join('|');
    if (!soldLots[key]) soldLots[key] = { productionDate: String(row.production_date || ''), arrivalDate: String(row.source_arrival_date || ''), expiryDate: String(row.expiry_date || ''), qty: 0 };
    soldLots[key].qty += Number(row.qty || 0);
  });

  const allocatedByTransfer = {}, productionQtyByTransfer = {};
  Object.keys(soldLots).forEach(function (key) {
    const lot = soldLots[key];
    let candidates = productions.filter(function (row) {
      const prodDate = String(row.production_date || ''), eventDate = String(row.event_date || ''), expiry = String(row.expiry_date || '');
      if (lot.productionDate && prodDate !== lot.productionDate) return false;
      if (!lot.productionDate && lot.arrivalDate && eventDate !== lot.arrivalDate) return false;
      if (lot.expiryDate && expiry && expiry !== lot.expiryDate) return false;
      return Boolean(row.transfer_id);
    });
    if (!candidates.length && lot.arrivalDate) candidates = productions.filter(function (row) { return String(row.event_date || '') === lot.arrivalDate && Boolean(row.transfer_id); });
    candidates = candidates.slice().reverse();
    let remaining = Number(lot.qty || 0);
    candidates.forEach(function (row) {
      if (remaining <= 0.0000001) return;
      const transferId = String(row.transfer_id || ''), productionQty = Math.max(0, Number(row.qty || 0));
      if (!transferId || productionQty <= 0.0000001) return;
      const taken = Math.min(remaining, productionQty);
      allocatedByTransfer[transferId] = Number(allocatedByTransfer[transferId] || 0) + taken;
      productionQtyByTransfer[transferId] = productionQty;
      remaining -= taken;
    });
  });

  const transferIds = Object.keys(allocatedByTransfer);
  if (!transferIds.length) return [];
  const usageSql = latestStockMovementCte_() + ' SELECT record_id,COALESCE(NULLIF(logical_id,\'\'),record_id) AS logical_id,item_code,item_name,unit,qty,movement_type,info,' +
    'source_arrival_date,production_date,expiry_date,transfer_id,outlet,source_row,created_at FROM latest WHERE outlet=@outlet AND location=\'Store\' ' +
    'AND movement_type=\'WIP Material Usage\' AND transfer_id IN UNNEST(@transferIds) ORDER BY event_date,created_at,item_name';
  const usageRows = runNamedQuery_(usageSql, { outlet: outlet, transferIds: transferIds }, { useQueryCache: false });
  usageRows.forEach(function (row) {
    const transferId = String(row.transfer_id || ''), produced = Number(productionQtyByTransfer[transferId] || 0), used = Number(allocatedByTransfer[transferId] || 0);
    row._mockRecallScale = produced > 0.0000001 ? Math.min(1, used / produced) : 1;
  });
  return usageRows;
}

function getMockRecallList(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const s = requireSession_(token), e = findEmployee_(s.nik); assertEmployeeActive_(e);
    const date = normalizeDate_(payload.date, true), outlet = e.outlet === 'BIHQ' ? cleanText_(payload.outlet, 30).toUpperCase() : e.outlet;
    let where = 'event_date=CAST(@date AS DATE) AND movement_type=\'Sold\' AND source_file LIKE \'SALES_COGS|%\'';
    const params = { date: date };
    if (outlet) { where += ' AND outlet=@outlet'; params.outlet = outlet; }
    const sql = latestStockMovementCte_() + ' SELECT transfer_id,outlet,info,item_name,source_row,created_at FROM latest WHERE ' + where + ' ORDER BY outlet,source_row,created_at,item_name';
    const seen = {}, items = [];
    runNamedQuery_(sql, params, { useQueryCache: false }).forEach(function (row) {
      const parsed = parseMockRecallSoldInfo_(row.info);
      if (!parsed || !parsed.menu || !parsed.salesNumber) return;
      const key = [String(row.outlet || ''), parsed.salesNumber, normalizeStoreName_(parsed.menu)].join('|');
      if (seen[key]) return;
      seen[key] = true;
      items.push({
        traceId: String(row.transfer_id || ''), menu: parsed.menu, salesNumber: parsed.salesNumber,
        outlet: String(row.outlet || ''), date: date
      });
    });
    return { date: date, items: items };
  });
}

function getMockRecallDetail(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const s = requireSession_(token), e = findEmployee_(s.nik); assertEmployeeActive_(e);
    const date = normalizeDate_(payload.date, true), menu = cleanText_(payload.menu, 180), salesNumber = cleanText_(payload.salesNumber, 120);
    const requestedOutlet = cleanText_(payload.outlet, 30).toUpperCase(), outlet = e.outlet === 'BIHQ' ? requestedOutlet : e.outlet;
    if (!date || !menu || !salesNumber || !outlet) throw new Error('Identitas menu Mock Recall tidak lengkap.');
    if (e.outlet !== 'BIHQ' && requestedOutlet && requestedOutlet !== e.outlet) throw new Error('Anda tidak memiliki akses ke data outlet ini.');

    const sql = latestStockMovementCte_() + ' SELECT record_id,COALESCE(NULLIF(logical_id,\'\'),record_id) AS logical_id,item_code,item_name,unit,qty,movement_type,info,' +
      'source_arrival_date,production_date,expiry_date,transfer_id,outlet,source_row,source_file,source_hash,event_date,created_at FROM latest ' +
      'WHERE event_date=CAST(@date AS DATE) AND outlet=@outlet AND source_file LIKE \'SALES_COGS|%\' ' +
      'AND movement_type IN (\'Sold\',\'WIP Material Usage\',\'Production\') ORDER BY source_row,created_at,item_name';
    const allRows = runNamedQuery_(sql, { date: date, outlet: outlet }, { useQueryCache: false });
    const soldRows = [], wipUsageRows = [], generatedProductions = [];

    allRows.forEach(function (row) {
      const movementType = String(row.movement_type || '');
      if (movementType === 'Sold') {
        const parsed = parseMockRecallSoldInfo_(row.info);
        if (parsed && parsed.salesNumber === salesNumber && normalizeStoreName_(parsed.menu) === normalizeStoreName_(menu)) soldRows.push(row);
        return;
      }
      if (movementType === 'WIP Material Usage') {
        const parsed = parseMockRecallWipUsageInfo_(row.info);
        if (parsed && parsed.salesNumber === salesNumber && normalizeStoreName_(parsed.menu) === normalizeStoreName_(menu)) {
          row._mockRecallParent = parsed.parent;
          wipUsageRows.push(row);
        }
        return;
      }
      if (movementType === 'Production') {
        const parsed = parseMockRecallAutoProductionInfo_(row.info);
        if (parsed && parsed.salesNumber === salesNumber && normalizeStoreName_(parsed.menu) === normalizeStoreName_(menu)) {
          generatedProductions.push(row);
        }
      }
    });
    if (!soldRows.length) throw new Error('Detail menu tidak ditemukan untuk Sales Number tersebut.');

    const wipCatalog = readWipRecipeCatalog_(), sourceGroups = {}, sourceOrder = [], stockMasterByCode = {}, savedConversions = readStockUnitConversions_();
    readStockMaster_(true).forEach(function (item) { stockMasterByCode[String(item.code || '').toUpperCase()] = item; });
    soldRows.forEach(function (row) {
      const sourceKey = String(row.source_row || '') + '|' + String(row.item_code || '') + '|' + String(row.item_name || '');
      if (!sourceGroups[sourceKey]) { sourceGroups[sourceKey] = []; sourceOrder.push(sourceKey); }
      sourceGroups[sourceKey].push(row);
    });

    const materials = [];
    const treeState = {
      outlet: outlet, saleDate: date, materials: materials, wipCatalog: wipCatalog, sameDayUsage: wipUsageRows,
      generatedProductions: generatedProductions, stockMasterByCode: stockMasterByCode, savedConversions: savedConversions,
      generatedRemaining: null, generatedDatesByKey: null, wipSourceCache: {}
    };

    sourceOrder.forEach(function (sourceKey) {
      const group = sourceGroups[sourceKey], first = group[0] || {}, code = String(first.item_code || '').toUpperCase(), name = String(first.item_name || '');
      const isWip = Boolean(wipCatalog.byCode[code] && wipCatalog.byCode[code].length);
      if (!isWip) {
        appendMockRecallMaterialLots_(materials, aggregateMockRecallLots_(group, ''), '', 0);
        return;
      }
      appendMockRecallWipTree_(treeState, code, name, group, first.source_row, 0, {}, false);
    });

    return { date: date, menu: menu, salesNumber: salesNumber, outlet: outlet, materials: materials };
  });
}

function sessionPayload_(employee, token) {
  return { token: token, expiresIn: null, persistent: true, user: userView_(employee) };
}

function userView_(employee) {
  return {
    nik: employee.nik, name: employee.name, outlet: employee.outlet,
    position: employee.position, grade: employee.grade,
    isAdmin: employee.outlet === 'BIHQ'
  };
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
    const value = params[name];
    if (Array.isArray(value)) {
      return {
        name: name,
        parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } },
        parameterValue: { arrayValues: value.map(function (item) { return { value: String(item) }; }) }
      };
    }
    return { name: name, parameterType: { type: 'STRING' }, parameterValue: { value: String(value) } };
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
      'AND movement_type IN (\'Goods Receipt\', \'Terjual\', \'Sold\') ' +
      'AND source_file IS NOT NULL AND source_file != \'\' GROUP BY event_date ' +
      'HAVING MAX(IF(movement_type = \'Goods Receipt\', 1, 0)) = 1 ' +
      'AND MAX(IF(movement_type IN (\'Terjual\', \'Sold\'), 1, 0)) = 1';
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

// ---------- Lost And Found (SABAR) ----------
// Modul berada dalam scope tersendiri agar helper SABAR tidak bertabrakan dengan BI-Space.
const LOST_FOUND = (function () {
/**
 * VERSION: FAST-DATABASE-UNDER3S - 2026-06-19
 * Fokus fix:
 * 1) Login dibuat ringan: authenticateUser() hanya baca sheet store, tidak scan/migrasi database.
 * 2) Database tetap header-based dan toleran nama sheet/header.
 * 3) Database cepat: tidak convert foto Drive ke base64 saat fetch list; foto dikirim sebagai thumbnail URL.
 * 4) Tabel menampilkan kode outlet melalui outletCode.
 * 5) Support: submit, edit, action diambil/dimusnahkan/diserahkan, audit.
 */

const SPREADSHEET_ID = "1hDdaSWxSG6bmUPsp2eyQnCyuhP6Jg7ZMQGiYmGoSTgw";
const BASE64_CELL_LIMIT = 45000; // jaga batas 50k karakter/cell Google Sheets

function openSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function normalizeText_(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9 ]/g, '')
    .trim();
}

function normalizeKey_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isSameOutlet_(a, b) {
  const aa = normalizeText_(a);
  const bb = normalizeText_(b);
  if (!aa || !bb) return false;
  if (aa === bb) return true;
  if (aa.length >= 4 && bb.length >= 4 && (aa.indexOf(bb) !== -1 || bb.indexOf(aa) !== -1)) return true;
  return false;
}

function findSheetByNames_(ss, names) {
  const wanted = names.map(n => normalizeKey_(n));
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (wanted.indexOf(normalizeKey_(sheets[i].getName())) !== -1) return sheets[i];
  }
  return null;
}

function canonicalStoreHeader_(h) {
  const k = normalizeKey_(h);
  const alias = {
    idoutlet: 'ID Outlet', outletid: 'ID Outlet', idstore: 'ID Outlet', kodeid: 'ID Outlet',
    namaoutlet: 'Nama Outlet', outlet: 'Nama Outlet', store: 'Nama Outlet', namastore: 'Nama Outlet',
    kodeoutlet: 'Kode Outlet', kode: 'Kode Outlet', code: 'Kode Outlet', logincode: 'Kode Outlet'
  };
  return alias[k] || '';
}

function buildStoreColumnMap_(headers) {
  const col = {};
  headers.forEach((h, i) => {
    const c = canonicalStoreHeader_(h);
    if (c) col[c] = i;
  });
  if (col['ID Outlet'] === undefined) col['ID Outlet'] = 0;
  if (col['Nama Outlet'] === undefined) col['Nama Outlet'] = 1;
  if (col['Kode Outlet'] === undefined) col['Kode Outlet'] = 4;
  return col;
}

function getStoreSheet_(ss) {
  const byName = findSheetByNames_(ss, ['store', 'stores', 'outlet', 'outlets']);
  if (byName) return byName;
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sh = sheets[i];
    const lastCol = sh.getLastColumn();
    if (lastCol < 1) continue;
    const headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const cols = headers.map(h => canonicalStoreHeader_(h)).filter(Boolean);
    if (cols.indexOf('Nama Outlet') !== -1 && cols.indexOf('Kode Outlet') !== -1) return sh;
  }
  return null;
}

function getStoreRecords_(ss) {
  const sh = getStoreSheet_(ss);
  if (!sh) return [];
  const values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const col = buildStoreColumnMap_(values[0]);
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const id = String(row[col['ID Outlet']] || '').trim();
    const name = String(row[col['Nama Outlet']] || '').trim();
    const code = String(row[col['Kode Outlet']] || '').trim();
    if (!id && !name && !code) continue;
    rows.push({ id: id, name: name, code: code || id });
  }
  return rows;
}

function buildOutletLookup_(records) {
  const lookup = {};
  (records || []).forEach(rec => {
    const code = rec.code || rec.id || rec.name || '';
    const keys = [rec.name, rec.code, rec.id].map(normalizeText_).filter(Boolean);
    keys.forEach(k => lookup[k] = code);
  });
  return lookup;
}

function resolveOutletCodeFromRecords_(records, outletName) {
  const n = normalizeText_(outletName);
  if (!n) return outletName || '';
  const lookup = buildOutletLookup_(records || []);
  if (lookup[n]) return lookup[n];
  for (let i = 0; i < (records || []).length; i++) {
    const rec = records[i];
    if (isSameOutlet_(rec.name, outletName) || isSameOutlet_(rec.code, outletName) || isSameOutlet_(rec.id, outletName)) {
      return rec.code || rec.id || rec.name || outletName || '';
    }
  }
  return outletName || '';
}

function resolveOutletCodeByName_(ss, outletName) {
  return resolveOutletCodeFromRecords_(getStoreRecords_(ss), outletName);
}

/**
 * LOGIN RINGAN. Tidak memanggil setup/migrasi database agar tombol login cepat dan tidak stuck.
 */
function authenticateUserFromStoreRecords_(loginCode, records) {
  const code = String(loginCode || '').trim().toUpperCase();
  if (!code) return { success: false, message: 'Kode login tidak boleh kosong.' };
  if (code === 'BIHQ') return { success: true, outletName: 'BIHQ (Headquarters)', outletCode: 'BIHQ', role: 'HQ' };

  if (!records || !records.length) {
    return { success: false, message: 'Sheet store tidak ditemukan atau kosong. Pastikan ada kolom Nama Outlet dan Kode Outlet.' };
  }

  const searchNorm = normalizeText_(code);
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const idNorm = normalizeText_(rec.id);
    const nameNorm = normalizeText_(rec.name);
    const codeNorm = normalizeText_(rec.code);
    if (codeNorm === searchNorm || idNorm === searchNorm || nameNorm === searchNorm || idNorm.indexOf(searchNorm) !== -1 || nameNorm.indexOf(searchNorm) !== -1) {
      return { success: true, outletName: rec.name || rec.code || rec.id, outletCode: rec.code || rec.id, role: 'OUTLET' };
    }
  }
  return { success: false, message: 'Kode outlet tidak ditemukan: ' + code };
}

function authenticateUser(loginCode) {
  try {
    const ss = openSpreadsheet_();
    return authenticateUserFromStoreRecords_(loginCode, getStoreRecords_(ss));
  } catch (err) {
    return { success: false, message: 'Login gagal: ' + err.message };
  }
}

function fetchOutletList() {
  const ss = openSpreadsheet_();
  return getStoreRecords_(ss).map(r => ({ id: r.id, code: r.code || r.id, name: r.name }));
}

function getItemStandardHeaders_() {
  return [
    'ID Item','Timestamp','Tanggal Kejadian','Jam Kejadian','Outlet','Nomor Meja','No Bill','Nama Tamu','No Telp Tamu','No Member',
    'QTY','Jenis Item','Nama Item','Merk','Type','Warna','Info Lain','Foto Item URL','Status','Tanggal Aksi','Nama Eksekutor','No Telp Penerima',
    'Daftar Saksi','Instruksi Oleh Nama','Instruksi Oleh Jabatan','Action Foto 1 URL','Action Foto 2 URL'
  ];
}

function canonicalItemHeader_(h) {
  const k = normalizeKey_(h);
  const alias = {
    iditem:'ID Item', idbarang:'ID Item', id:'ID Item',
    timestamp:'Timestamp', waktuinput:'Timestamp', tanggalinput:'Timestamp',
    tanggalkejadian:'Tanggal Kejadian', tglkejadian:'Tanggal Kejadian', tanggal:'Tanggal Kejadian',
    jamkejadian:'Jam Kejadian', jam:'Jam Kejadian',
    outlet:'Outlet', store:'Outlet', namaoutlet:'Outlet',
    nomormeja:'Nomor Meja', nomeja:'Nomor Meja', table:'Nomor Meja', meja:'Nomor Meja',
    nobill:'No Bill', bill:'No Bill', billno:'No Bill', salesnumber:'No Bill',
    namatamu:'Nama Tamu', namacustomer:'Nama Tamu', customer:'Nama Tamu',
    notelptamu:'No Telp Tamu', notlp:'No Telp Tamu', notelp:'No Telp Tamu', phone:'No Telp Tamu', notelpcustomer:'No Telp Tamu',
    nomember:'No Member', member:'No Member',
    qty:'QTY', quantity:'QTY', jumlah:'QTY',
    jenisitem:'Jenis Item', jenisbarang:'Jenis Item', kategori:'Jenis Item', kategoriitem:'Jenis Item',
    namaitem:'Nama Item', namabarang:'Nama Item', barang:'Nama Item',
    merk:'Merk', brand:'Merk', type:'Type', tipe:'Type', model:'Type', warna:'Warna', color:'Warna',
    infolain:'Info Lain', keterangan:'Info Lain', catatan:'Info Lain',
    fotoitemurl:'Foto Item URL', fotoitemuri:'Foto Item URL', fotobarangurl:'Foto Item URL', fotobaranguri:'Foto Item URL', fotourl:'Foto Item URL', fotouri:'Foto Item URL', foto:'Foto Item URL',
    status:'Status', tanggalaksi:'Tanggal Aksi', tglaksi:'Tanggal Aksi',
    namaeksekutor:'Nama Eksekutor', namapetugas:'Nama Eksekutor', namaaks:'Nama Eksekutor',
    notelppenerima:'No Telp Penerima', notelpeksekutor:'No Telp Penerima', notelppetugas:'No Telp Penerima',
    daftarsaksi:'Daftar Saksi', saksi:'Daftar Saksi',
    instruksiolehnama:'Instruksi Oleh Nama', instruksinama:'Instruksi Oleh Nama',
    instruksiolehjabatan:'Instruksi Oleh Jabatan', instruksijabatan:'Instruksi Oleh Jabatan',
    actionfoto1url:'Action Foto 1 URL', actionfoto1uri:'Action Foto 1 URL', fotoaksi1url:'Action Foto 1 URL', fotoaksi1uri:'Action Foto 1 URL',
    actionfoto2url:'Action Foto 2 URL', actionfoto2uri:'Action Foto 2 URL', fotoaksi2url:'Action Foto 2 URL', fotoaksi2uri:'Action Foto 2 URL'
  };
  const std = getItemStandardHeaders_();
  for (let i = 0; i < std.length; i++) if (normalizeKey_(std[i]) === k) return std[i];
  return alias[k] || '';
}

function buildItemColumnMap_(headers) {
  const col = {};
  getItemStandardHeaders_().forEach((h, i) => col[h] = i);
  headers.forEach((h, i) => {
    const c = canonicalItemHeader_(h);
    if (c) col[c] = i;
  });
  return col;
}

function analyzeItemSheet_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const result = { sheet: sh, sheetName: sh.getName(), lastRow: lastRow, lastCol: lastCol, score: 0, dataRows: 0, found: {} };
  const preferred = ['items','item','data item','database item','daftar barang','lost and found','lost found','database','data barang'].map(normalizeKey_);
  if (preferred.indexOf(normalizeKey_(sh.getName())) !== -1) result.score += 100;
  if (lastRow < 1 || lastCol < 1) return result;
  const headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  headers.forEach((h, i) => { const c = canonicalItemHeader_(h); if (c) result.found[c] = i; });
  const core = ['ID Item','Nama Item','Status'];
  const secondary = ['Timestamp','Tanggal Kejadian','Jam Kejadian','Outlet','Jenis Item','QTY'];
  const coreCount = core.filter(h => result.found[h] !== undefined).length;
  const secCount = secondary.filter(h => result.found[h] !== undefined).length;
  result.score += coreCount * 1000 + secCount * 100;
  if (lastRow > 1 && (result.found['ID Item'] !== undefined || result.found['Nama Item'] !== undefined)) {
    const sample = sh.getRange(2, 1, Math.min(lastRow - 1, 200), lastCol).getDisplayValues();
    for (let r = 0; r < sample.length; r++) {
      const row = sample[r];
      const id = result.found['ID Item'] !== undefined ? row[result.found['ID Item']] : '';
      const name = result.found['Nama Item'] !== undefined ? row[result.found['Nama Item']] : '';
      if (String(id + name).trim()) result.dataRows++;
    }
  }
  result.score += result.dataRows * 5000;
  return result;
}

function pickItemsSheet_(ss) {
  const sheets = ss.getSheets();
  let best = null;
  for (let i = 0; i < sheets.length; i++) {
    const a = analyzeItemSheet_(sheets[i]);
    if (a.found['ID Item'] === undefined && a.found['Nama Item'] === undefined) continue;
    if (!best || a.score > best.score) best = a;
  }
  return best;
}

function itemSheetLooksValid_(sh) {
  if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() < 1) return false;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const found = {};
  headers.forEach(h => { const c = canonicalItemHeader_(h); if (c) found[c] = true; });
  return !!(found['ID Item'] || found['Nama Item']);
}

function getItemsSheet_(ss) {
  const props = PropertiesService.getScriptProperties();
  const cachedName = props.getProperty('SABAR_ITEMS_SHEET_NAME');
  if (cachedName) {
    const cachedSheet = ss.getSheetByName(cachedName);
    if (itemSheetLooksValid_(cachedSheet)) return cachedSheet;
  }

  const direct = findSheetByNames_(ss, ['items','item','data item','database item','daftar barang','lost and found','lost found','database','data barang']);
  if (itemSheetLooksValid_(direct)) {
    props.setProperty('SABAR_ITEMS_SHEET_NAME', direct.getName());
    return direct;
  }

  const picked = pickItemsSheet_(ss);
  if (picked && picked.sheet) {
    props.setProperty('SABAR_ITEMS_SHEET_NAME', picked.sheet.getName());
    return picked.sheet;
  }

  const sh = ss.insertSheet('items');
  sh.appendRow(getItemStandardHeaders_());
  sh.getRange(1,1,1,getItemStandardHeaders_().length).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  props.setProperty('SABAR_ITEMS_SHEET_NAME', sh.getName());
  return sh;
}

function ensureItemColumns_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  let headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  let found = {};
  headers.forEach(h => { const c = canonicalItemHeader_(h); if (c) found[c] = true; });

  const missing = getItemStandardHeaders_().filter(h => !found[h]);
  if (missing.length) {
    sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing]);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  }
}

function readCell_(row, col, header) {
  const i = col[header];
  if (i === undefined || i < 0 || i >= row.length) return '';
  return String(row[i] === null || row[i] === undefined ? '' : row[i]).trim();
}

function normalizeStatus_(v) {
  const n = normalizeText_(v);
  if (!n) return 'Dilaporkan';
  if (n.indexOf('AMBIL') !== -1 || n.indexOf('CLAIM') !== -1) return 'Sudah Diambil';
  if (n.indexOf('MUSNAH') !== -1 || n.indexOf('DESTROY') !== -1) return 'Dimusnahkan';
  if (n.indexOf('SERAH') !== -1 || n.indexOf('DELIVER') !== -1 || n.indexOf('HANDOVER') !== -1) return 'Diserahkan';
  if (n.indexOf('LAPOR') !== -1 || n.indexOf('REPORT') !== -1) return 'Dilaporkan';
  return String(v || 'Dilaporkan').trim();
}

function normalizeJenis_(v) {
  const n = normalizeText_(v);
  if (!n) return '';
  if (n.indexOf('ELECT') !== -1 || n.indexOf('ELEK') !== -1) return 'Electronic';
  if (n.indexOf('MAKAN') !== -1 || n.indexOf('FOOD') !== -1 || n.indexOf('MINUM') !== -1) return 'Makanan';
  if (n.indexOf('DOK') !== -1 || n.indexOf('DOC') !== -1) return 'Dokumen';
  if (n.indexOf('HIAS') !== -1 || n.indexOf('JEWEL') !== -1 || n.indexOf('PERHIAS') !== -1) return 'Perhiasan';
  if (n.indexOf('OTHER') !== -1 || n.indexOf('LAIN') !== -1) return 'Others';
  return String(v || '').trim();
}

function formatTimeValue_(raw, display) {
  if (display && String(display).trim()) {
    const m = String(display).trim().match(/(\d{1,2})[:.](\d{2})/);
    if (m) return String(m[1]).padStart(2, '0') + ':' + m[2];
    return String(display).trim();
  }
  if (raw instanceof Date && !isNaN(raw.getTime())) return Utilities.formatDate(raw, 'GMT+7', 'HH:mm');
  if (typeof raw === 'number' && raw >= 0 && raw < 1) {
    const minutes = Math.round(raw * 24 * 60);
    return String(Math.floor(minutes / 60) % 24).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  }
  return raw ? String(raw) : '';
}

function formatDateValue_(raw, display, pattern) {
  if (display && String(display).trim()) return String(display).trim();
  if (raw instanceof Date && !isNaN(raw.getTime())) return Utilities.formatDate(raw, 'GMT+7', pattern || 'yyyy-MM-dd');
  return raw ? String(raw) : '';
}

function extractDriveFileId_(urlOrId) {
  const v = String(urlOrId || '').trim();
  if (!v) return '';
  if (!/drive\.google\.com/i.test(v) && !/^[-\w]{25,}$/.test(v)) return '';
  const m1 = v.match(/\/file\/d\/([^\/]+)/i);
  const m2 = v.match(/[?&]id=([^&]+)/i);
  const m3 = v.match(/^[-\w]{25,}$/);
  return (m1 && m1[1]) || (m2 && m2[1]) || (m3 && m3[0]) || '';
}

function driveUrlToClientImage_(urlOrId, size) {
  const v = String(urlOrId || '').trim();
  if (!v) return '';
  const id = extractDriveFileId_(v);
  if (!id) return v;
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + (size || 320);
}

function imageForClient_(value, mode) {
  const v = String(value || '').trim();
  if (!v) return '';

  // Di list, jangan kirim base64 besar karena payload Google Apps Script jadi sangat berat.
  if (/^data:image\//i.test(v)) {
    if (mode === 'detail') return v;
    return v.length <= 12000 ? v : '';
  }

  // Drive URL tidak dikonversi ke base64 lagi. Pakai thumbnail URL agar ringan.
  if (/drive\.google\.com/i.test(v) || /^[-\w]{25,}$/.test(v)) {
    return driveUrlToClientImage_(v, mode === 'detail' ? 1200 : 320);
  }

  return v;
}

// Nama lama dipertahankan supaya fungsi lain yang mungkin memanggil tidak error.
function driveUrlToBase64_(urlOrId) {
  return imageForClient_(urlOrId, 'detail');
}

function storeImageValue_(base64, filename, folderName) {
  const val = String(base64 || '').trim();
  if (!val) return '';

  // Untuk performa database jangka panjang, foto baru selalu disimpan ke Drive.
  // Jangan lagi menyimpan base64 ke cell karena membuat sheet dan fetch database lambat.
  return saveFileToDrive(val, filename || ('Image_' + Date.now() + '.jpg'), folderName || 'LostAndFound_Photos');
}

function getValuesForColumnIndexes_(sh, startRow, numRows, lastCol, columnIndexes) {
  const indexes = Array.from(new Set((columnIndexes || []).filter(i => i !== undefined && i >= 0 && i < lastCol))).sort((a, b) => a - b);
  const rows = Array.from({ length: numRows }, () => Array(lastCol).fill(''));
  if (!indexes.length || numRows <= 0) return rows;

  const groups = [];
  let start = indexes[0];
  let end = indexes[0];
  for (let i = 1; i < indexes.length; i++) {
    if (indexes[i] === end + 1) {
      end = indexes[i];
    } else {
      groups.push({ start: start, end: end });
      start = end = indexes[i];
    }
  }
  groups.push({ start: start, end: end });

  groups.forEach(g => {
    const width = g.end - g.start + 1;
    const vals = sh.getRange(startRow, g.start + 1, numRows, width).getValues();
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < width; c++) rows[r][g.start + c] = vals[r][c];
    }
  });
  return rows;
}

function buildItemObject_(row, col, rowIndex, auth, storeRecords, includeDetailImages) {
  const id = readCell_(row, col, 'ID Item') || ('ROW-' + rowIndex);
  const namaItem = readCell_(row, col, 'Nama Item');
  const statusRaw = readCell_(row, col, 'Status');
  const outletName = readCell_(row, col, 'Outlet');
  const detailMode = includeDetailImages ? 'detail' : 'list';

  return {
    rowIndex: rowIndex,
    id: id,
    timestamp: formatDateValue_(row[col['Timestamp']], '', 'yyyy-MM-dd HH:mm:ss'),
    tanggalKejadian: formatDateValue_(row[col['Tanggal Kejadian']], '', 'yyyy-MM-dd'),
    jamKejadian: formatTimeValue_(row[col['Jam Kejadian']], ''),
    outlet: outletName,
    outletCode: resolveOutletCodeFromRecords_(storeRecords, outletName),
    nomorMeja: readCell_(row, col, 'Nomor Meja'),
    noBill: readCell_(row, col, 'No Bill'),
    namaTamu: readCell_(row, col, 'Nama Tamu'),
    noTelpTamu: readCell_(row, col, 'No Telp Tamu'),
    noMember: readCell_(row, col, 'No Member'),
    qty: readCell_(row, col, 'QTY') || '1',
    jenisItem: normalizeJenis_(readCell_(row, col, 'Jenis Item')),
    namaItem: namaItem,
    merk: readCell_(row, col, 'Merk'),
    type: readCell_(row, col, 'Type'),
    warna: readCell_(row, col, 'Warna'),
    infoLain: readCell_(row, col, 'Info Lain'),
    fotoItemUrl: imageForClient_(readCell_(row, col, 'Foto Item URL'), detailMode),
    status: normalizeStatus_(statusRaw),
    tanggalAksi: formatDateValue_(row[col['Tanggal Aksi']], '', 'yyyy-MM-dd'),
    namaEksekutor: readCell_(row, col, 'Nama Eksekutor'),
    noTelpPenerima: readCell_(row, col, 'No Telp Penerima'),
    daftarSaksi: readCell_(row, col, 'Daftar Saksi'),
    instruksiNama: readCell_(row, col, 'Instruksi Oleh Nama'),
    instruksiJabatan: readCell_(row, col, 'Instruksi Oleh Jabatan'),
    actionFoto1Url: includeDetailImages ? imageForClient_(readCell_(row, col, 'Action Foto 1 URL'), 'detail') : '',
    actionFoto2Url: includeDetailImages ? imageForClient_(readCell_(row, col, 'Action Foto 2 URL'), 'detail') : ''
  };
}

function fetchItemsList(loginCode, userRole) {
  const ss = openSpreadsheet_();
  const storeRecords = getStoreRecords_(ss);
  const auth = authenticateUserFromStoreRecords_(loginCode, storeRecords);
  if (!auth.success) throw new Error(auth.message || 'Sesi login tidak valid.');

  const sh = getItemsSheet_(ss);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow <= 1 || lastCol <= 0) return [];

  // Read kolom yang diperlukan saja. Kolom Foto Item URL ikut dibaca untuk preview ringan.
  // Catatan: imageForClient_(mode list) hanya mengirim thumbnail Drive / base64 kecil, bukan file besar.
  const headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const col = buildItemColumnMap_(headers);
  const listHeaders = [
    'ID Item','Timestamp','Tanggal Kejadian','Jam Kejadian','Outlet','Nomor Meja','No Bill','Nama Tamu','No Telp Tamu','No Member',
    'QTY','Jenis Item','Nama Item','Merk','Type','Warna','Info Lain','Foto Item URL','Status','Tanggal Aksi','Nama Eksekutor','No Telp Penerima',
    'Daftar Saksi','Instruksi Oleh Nama','Instruksi Oleh Jabatan'
  ];
  const values = getValuesForColumnIndexes_(sh, 2, lastRow - 1, lastCol, listHeaders.map(h => col[h]));
  const items = [];

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const rowIndex = i + 2;
    const id = readCell_(row, col, 'ID Item') || ('ROW-' + rowIndex);
    const namaItem = readCell_(row, col, 'Nama Item');
    const statusRaw = readCell_(row, col, 'Status');
    const outletName = readCell_(row, col, 'Outlet');

    if (!String(id + namaItem + statusRaw + outletName).replace('ROW-' + rowIndex, '').trim()) continue;
    if (auth.role !== 'HQ' && !isSameOutlet_(outletName, auth.outletName) && !isSameOutlet_(outletName, auth.outletCode)) continue;

    items.push(buildItemObject_(row, col, rowIndex, auth, storeRecords, false));
  }

  return items;
}

function fetchItemDetail(loginCode, itemId) {
  const ss = openSpreadsheet_();
  const storeRecords = getStoreRecords_(ss);
  const auth = authenticateUserFromStoreRecords_(loginCode, storeRecords);
  if (!auth.success) throw new Error(auth.message || 'Sesi login tidak valid.');

  const sh = getItemsSheet_(ss);
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const col = buildItemColumnMap_(headers);
  const rowIndex = findItemRowById_(sh, itemId);
  if (!rowIndex) throw new Error('ID Item tidak ditemukan: ' + itemId);

  const row = sh.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
  const outletName = readCell_(row, col, 'Outlet');
  if (auth.role !== 'HQ' && !isSameOutlet_(outletName, auth.outletName) && !isSameOutlet_(outletName, auth.outletCode)) {
    throw new Error('Anda tidak memiliki akses ke item ini.');
  }

  return buildItemObject_(row, col, rowIndex, auth, storeRecords, true);
}

function setRowValuesByHeader_(sh, rowIndex, values) {
  ensureItemColumns_(sh);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const col = buildItemColumnMap_(headers);
  Object.keys(values).forEach(h => {
    if (col[h] !== undefined) sh.getRange(rowIndex, col[h] + 1).setValue(values[h]);
  });
}

function findItemRowById_(sh, itemId) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const col = buildItemColumnMap_(headers);
  const idCol = col['ID Item'] + 1;
  const ids = sh.getRange(2, idCol, Math.max(sh.getLastRow() - 1, 1), 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === String(itemId || '').trim()) return i + 2;
  return 0;
}

function assertItemOutletAccess_(sh, rowIndex, auth) {
  if (auth.role === 'HQ') return;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const col = buildItemColumnMap_(headers);
  const row = sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const outletName = readCell_(row, col, 'Outlet');
  if (!isSameOutlet_(outletName, auth.outletName) && !isSameOutlet_(outletName, auth.outletCode)) {
    throw new Error('Anda tidak memiliki akses ke item outlet lain.');
  }
}

function submitNewItem(loginCode, form) {
  const auth = authenticateUser(loginCode);
  if (!auth.success) return { success: false, message: auth.message || 'Sesi login tidak valid.' };
  try {
    const ss = openSpreadsheet_();
    const sh = getItemsSheet_(ss);
    ensureItemColumns_(sh);
    const id = 'LF-' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd') + '-' + Math.floor(1000 + Math.random() * 9000);
    const row = sh.getLastRow() + 1;
    const outletName = auth.role === 'HQ' ? (form.outletManual || '') : auth.outletName;
    const foto = storeImageValue_(form.fotoItemBase64, form.fotoItemName || ('Lost_Item_' + Date.now() + '.jpg'), 'LostAndFound_Items');
    setRowValuesByHeader_(sh, row, {
      'ID Item': id, 'Timestamp': new Date(), 'Tanggal Kejadian': form.tanggalKejadian, 'Jam Kejadian': form.jamKejadian,
      'Outlet': outletName, 'Nomor Meja': form.nomorMeja || '', 'No Bill': form.noBill || '', 'Nama Tamu': form.namaTamu || '',
      'No Telp Tamu': form.noTelpTamu || '', 'No Member': form.noMember || '', 'QTY': form.qty || 1, 'Jenis Item': form.jenisItem || '',
      'Nama Item': form.namaItem || '', 'Merk': form.merk || '', 'Type': form.type || '', 'Warna': form.warna || '', 'Info Lain': form.infoLain || '',
      'Foto Item URL': foto, 'Status': 'Dilaporkan'
    });
    return { success: true, itemId: id, message: 'Laporan berhasil disimpan dengan ID ' + id };
  } catch (err) {
    return { success: false, message: 'Gagal menyimpan data: ' + err.message };
  }
}

function updateItemData(loginCode, form) {
  const auth = authenticateUser(loginCode);
  if (!auth.success) return { success: false, message: auth.message || 'Sesi login tidak valid.' };
  try {
    const ss = openSpreadsheet_();
    const sh = getItemsSheet_(ss);
    ensureItemColumns_(sh);
    const row = findItemRowById_(sh, form.itemId);
    if (!row) return { success: false, message: 'ID Item tidak ditemukan: ' + form.itemId };
    assertItemOutletAccess_(sh, row, auth);
    const values = {
      'Tanggal Kejadian': form.tanggalKejadian, 'Jam Kejadian': form.jamKejadian,
      'Outlet': auth.role === 'HQ' ? (form.outletManual || '') : undefined,
      'Nomor Meja': form.nomorMeja || '', 'No Bill': form.noBill || '', 'Nama Tamu': form.namaTamu || '', 'No Telp Tamu': form.noTelpTamu || '',
      'No Member': form.noMember || '', 'QTY': form.qty || 1, 'Jenis Item': form.jenisItem || '', 'Nama Item': form.namaItem || '',
      'Merk': form.merk || '', 'Type': form.type || '', 'Warna': form.warna || '', 'Info Lain': form.infoLain || ''
    };
    if (!values['Outlet']) delete values['Outlet'];
    if (form.fotoItemBase64) values['Foto Item URL'] = storeImageValue_(form.fotoItemBase64, 'Edit_Item_' + form.itemId + '.jpg', 'LostAndFound_Items');
    setRowValuesByHeader_(sh, row, values);
    return { success: true, message: 'Data item berhasil diperbarui.' };
  } catch (err) {
    return { success: false, message: 'Gagal edit data: ' + err.message };
  }
}

function processItemAction(loginCode, actionType, formData) {
  const auth = authenticateUser(loginCode);
  if (!auth.success) return { success: false, message: auth.message || 'Sesi login tidak valid.' };
  try {
    const ss = openSpreadsheet_();
    const sh = getItemsSheet_(ss);
    ensureItemColumns_(sh);
    const row = findItemRowById_(sh, formData.itemId);
    if (!row) return { success: false, message: 'ID Item tidak ditemukan: ' + formData.itemId };
    assertItemOutletAccess_(sh, row, auth);
    const now = new Date();
    let values = { 'Tanggal Aksi': now };
    let finalStatus = '';

    if (actionType === 'diambil') {
      finalStatus = 'Sudah Diambil';
      values['Status'] = finalStatus;
      values['Nama Eksekutor'] = formData.diambilOleh || '';
      values['No Telp Penerima'] = formData.noTelpPenerima || '';
      values['Action Foto 1 URL'] = storeImageValue_(formData.fotoTandaTerimaB64, 'TandaTerima_' + formData.itemId + '.jpg', 'LostAndFound_Receipts');
      values['Action Foto 2 URL'] = storeImageValue_(formData.fotoPenyerahanB64, 'FotoPenyerahan_' + formData.itemId + '.jpg', 'LostAndFound_Proofs');
    } else if (actionType === 'dimusnahkan') {
      finalStatus = 'Dimusnahkan';
      values['Status'] = finalStatus;
      values['Nama Eksekutor'] = formData.dimusnahkanOleh || '';
      values['No Telp Penerima'] = formData.noTelpPemusnah || '';
      values['Daftar Saksi'] = formData.saksiSaksi || '';
      values['Action Foto 1 URL'] = storeImageValue_(formData.fotoPemusnahanB64, 'FotoPemusnahan_' + formData.itemId + '.jpg', 'LostAndFound_Destructions');
    } else if (actionType === 'diserahkan') {
      finalStatus = 'Diserahkan';
      values['Status'] = finalStatus;
      values['Nama Eksekutor'] = formData.diserahkanKepada || '';
      values['No Telp Penerima'] = formData.noTelpPenerima || '';
      values['Instruksi Oleh Nama'] = formData.instruksiNama || '';
      values['Instruksi Oleh Jabatan'] = formData.instruksiJabatan || '';
      values['Action Foto 1 URL'] = storeImageValue_(formData.fotoTandaTerimaB64, 'TandaTerimaKurir_' + formData.itemId + '.jpg', 'LostAndFound_Receipts');
      values['Action Foto 2 URL'] = storeImageValue_(formData.fotoPenyerahanB64, 'FotoPenyerahanKurir_' + formData.itemId + '.jpg', 'LostAndFound_Proofs');
    } else {
      return { success: false, message: 'Action tidak dikenal: ' + actionType };
    }

    setRowValuesByHeader_(sh, row, values);
    return { success: true, message: 'Barang dengan ID ' + formData.itemId + ' berhasil diubah status menjadi ' + finalStatus + '.' };
  } catch (err) {
    return { success: false, message: 'Gagal proses aksi: ' + err.message };
  }
}

function saveFileToDrive(base64Data, filename, folderName) {
  try {
    const data = String(base64Data || '');
    if (!data) return '';
    const parts = data.split(',');
    const meta = parts[0] || '';
    const contentType = (meta.match(/:(.*?);/) || [null, 'image/jpeg'])[1];
    const bytes = Utilities.base64Decode(parts.length > 1 ? parts[1] : parts[0]);
    const blob = Utilities.newBlob(bytes, contentType, filename || ('Image_' + Date.now() + '.jpg'));
    let folder;
    const folders = DriveApp.getFoldersByName(folderName || 'LostAndFound_Photos');
    folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName || 'LostAndFound_Photos');
    try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    const file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    return file.getUrl();
  } catch (err) {
    console.log('saveFileToDrive failed: ' + err.message);
    return '';
  }
}

function auditLostFoundSystem(loginCode) {
  const ss = openSpreadsheet_();
  const auth = authenticateUser(loginCode || 'BIHQ');
  const store = getStoreSheet_(ss);
  const picked = pickItemsSheet_(ss);
  const sheets = ss.getSheets().map(sh => analyzeItemSheet_(sh)).map(a => ({ sheetName: a.sheetName, lastRow: a.lastRow, lastCol: a.lastCol, score: a.score, dataRows: a.dataRows, detectedHeaders: Object.keys(a.found || {}) }));
  let items = [];
  try { if (auth.success) items = fetchItemsList(loginCode || 'BIHQ', auth.role); } catch(e) { items = [{ error: e.message }]; }
  const result = {
    spreadsheetName: ss.getName(),
    loginTest: auth,
    storeSheet: store ? store.getName() : 'NOT FOUND',
    storeRows: store ? store.getLastRow() : 0,
    pickedItemsSheet: picked ? picked.sheetName : 'NOT FOUND',
    sheetAudit: sheets.sort((a,b) => b.score - a.score),
    returnedItems: Array.isArray(items) ? items.length : 0,
    firstItem: Array.isArray(items) ? (items[0] || null) : items
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

  return Object.freeze({
    authenticateUser: authenticateUser,
    fetchOutletList: fetchOutletList,
    fetchItemsList: fetchItemsList,
    fetchItemDetail: fetchItemDetail,
    submitNewItem: submitNewItem,
    updateItemData: updateItemData,
    processItemAction: processItemAction
  });
}());

function lostFoundContext_(token) {
  const session = requireSession_(token);
  const employee = findEmployee_(session.nik);
  assertEmployeeActive_(employee);
  const auth = LOST_FOUND.authenticateUser(employee.outlet);
  if (!auth || !auth.success) throw new Error(auth && auth.message ? auth.message : 'Outlet belum tersedia pada database Lost And Found.');
  auth.code = employee.outlet;
  auth.employeeName = employee.name;
  auth.position = employee.position;
  return { employee: employee, auth: auth };
}

function getLostFoundBootstrap(token) {
  return safe_(function () { return lostFoundContext_(token).auth; });
}

function getLostFoundOutlets(token) {
  return safe_(function () {
    const context = lostFoundContext_(token);
    return context.auth.role === 'HQ' ? LOST_FOUND.fetchOutletList() : [];
  });
}

function getLostFoundItems(token) {
  return safe_(function () {
    const context = lostFoundContext_(token);
    return LOST_FOUND.fetchItemsList(context.auth.code, context.auth.role);
  });
}

function getLostFoundItemDetail(token, itemId) {
  return safe_(function () {
    const context = lostFoundContext_(token);
    return LOST_FOUND.fetchItemDetail(context.auth.code, itemId);
  });
}

function saveLostFoundItem(token, form) {
  return safe_(function () {
    const context = lostFoundContext_(token);
    return LOST_FOUND.submitNewItem(context.auth.code, form || {});
  });
}

function updateLostFoundItem(token, form) {
  return safe_(function () {
    const context = lostFoundContext_(token);
    return LOST_FOUND.updateItemData(context.auth.code, form || {});
  });
}

function processLostFoundItem(token, actionType, formData) {
  return safe_(function () {
    const context = lostFoundContext_(token);
    return LOST_FOUND.processItemAction(context.auth.code, actionType, formData || {});
  });
}

// ---------- Analisa Sales ----------
// Modul asli ditempatkan dalam scope tersendiri agar helper dan konfigurasi
// BigQuery-nya tidak bertabrakan dengan backend utama BI-Space.
const SALES_ANALYSIS = (function () {
/**
 * ============================================================
 *  SALES ANALYSIS CALENDAR — Google Apps Script Backend — BIGQUERY ONLY V9.2 GLOBAL ANALYSIS ITEMS
 *  Multi-outlet (Bakerzin) + Login + HQ Aggregate Mode
 *
 *  BIGQUERY-ONLY MODE V9.2:
 *  - Dashboard membaca langsung dari BigQuery.
 *  - Simpan Daily / Weekly / Monthly / Target langsung ke BigQuery.
 *  - Spreadsheet tidak lagi dipakai untuk runtime aplikasi.
 *
 *  SETUP:
 *  1. Apps Script → Services → aktifkan BigQuery API.
 *  2. Paste isi file ini ke Code.gs.
 *  3. Paste Index.html.
 *  4. Run `testBigQueryConnection` → authorize.
 *  5. Deploy → Web app → Anyone.
 * ============================================================
 */

// SHEET_ID tidak dipakai lagi di runtime V8. Biarkan kosong untuk menghindari dependency Spreadsheet.
const SHEET_ID  = '';
const TZ        = 'Asia/Jakarta';
const APP_TITLE = 'Bakerzin · Sales Analysis Calendar';

// ---- BigQuery config ----
// Pastikan Apps Script → Services → BigQuery API sudah aktif.
const BQ_PROJECT_ID = 'berita-acara-digital';
const BQ_DATASET_ID = 'bakerzin_sales_analysis';
const BQ_LOCATION   = 'asia-southeast2';
const BQ_USE_FOR_DASHBOARD = true;
const BQ_WRITE_ENABLED     = true;
const BQ_ONLY_MODE         = true;

// Konfigurasi runtime tanpa Spreadsheet.
const APP_CONFIG = {
  brand_name: 'Bakerzin',
  monthly_target: 420000000,
  week_start: 'monday',
  currency: 'IDR',
  min_analysis_chars: 20,
  session_ttl_hours: 12
};

// ---- master outlet list ----
const OUTLETS = [
  { code: 'BIHQ',  name: 'Head Office (Summary)',          role: 'admin' },
  { code: 'BIPS',  name: 'Bakerzin Plaza Senayan',         role: 'store' },
  { code: 'BIPIM', name: 'Bakerzin Pondok Indah Mall',     role: 'store' },
  { code: 'BIKK',  name: 'Bakerzin Kota Kasablanka',       role: 'store' },
  { code: 'BICP',  name: 'Bakerzin Central Park',          role: 'store' },
  { code: 'BITU',  name: 'Bakerzin Terminal Ultimate',     role: 'store' },
  { code: 'BISS',  name: 'Bakerzin Senayan Park',          role: 'store' },
  { code: 'BILW',  name: 'Bakerzin Living World',          role: 'store' },
  { code: 'BILK',  name: 'Bakerzin Lippo Kemang',          role: 'store' },
  { code: 'BIMC',  name: 'Bakerzin Margo City',            role: 'store' },
  { code: 'BIPWB', name: 'Bakerzin Pakuwon Mall Bekasi',   role: 'store' },
  { code: 'BIPR',  name: 'Bakerzin Puri Indah Mall',       role: 'store' }
];
const DEFAULT_PASSWORD = 'bakerzin2026';

// ---- nama tab + skema kolom ----
const SHEETS = {
  CONFIG: {
    name: 'Config',
    headers: ['key','value','description'],
    seed: [
      ['brand_name',        'Bakerzin',                                'Nama brand'],
      ['monthly_target',    420000000,                                 'Target sales bulanan default (Rp)'],
      ['week_start',        'monday',                                  'monday | sunday'],
      ['currency',          'IDR',                                     'Mata uang'],
      ['min_analysis_chars',20,                                        'Minimum karakter kolom analisa'],
      ['session_ttl_hours', 12,                                        'Durasi sesi login (jam)']
    ]
  },
  USERS: {
    name: 'Users',
    headers: ['outlet_code','outlet_name','password','role','active','last_login']
  },
  DAILY: {
    name: 'DailySales',
    headers: [
      'outlet_code','date','year','month','week','day_of_week',
      'sales','analisa_harian','analisa_status',
      'submitted_by','submitted_at','updated_at'
    ]
  },
  WEEKLY: {
    name: 'WeeklyAnalysis',
    headers: [
      'outlet_code','period_key','year','month','week',
      'period_start','period_end','total_sales',
      'analisa_mingguan','status',
      'submitted_by','submitted_at','updated_at'
    ]
  },
  MONTHLY: {
    name: 'MonthlyAnalysis',
    headers: [
      'outlet_code','period_key','year','month',
      'total_sales','target','achievement_pct',
      'analisa_bulanan','status',
      'submitted_by','submitted_at','updated_at'
    ]
  },
  TARGETS: {
    name: 'Targets',
    headers: ['outlet_code','year','month','target']
  },
  LOG: {
    name: 'AuditLog',
    headers: ['timestamp','outlet_code','user','action','scope','period_key','payload_json']
  }
};

/* ============================================================
 *  WEB APP ENTRY
 * ============================================================ */
function doGet(e) {
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.bootData = JSON.stringify(getBootstrap_());
  return tpl.evaluate()
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport','width=1440');
}
function include(name){ return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/* ============================================================
 *  MENU
 * ============================================================ */
function onOpen() {
  // BigQuery-only mode: tidak membuat menu Spreadsheet.
}


/* ============================================================
 *  DIAGNOSTIK
 * ============================================================ */
function testActiveSheet() {
  Logger.log('BigQuery-only mode: Spreadsheet tidak digunakan.');
  return 'BigQuery-only mode: Spreadsheet tidak digunakan.';
}

function testAccess() {
  Logger.log('BigQuery-only mode: Spreadsheet tidak digunakan. Jalankan testBigQueryConnection().');
  return 'BigQuery-only mode: Spreadsheet tidak digunakan. Jalankan testBigQueryConnection().';
}

function testBigQueryConnection() {
  try {
    bqEnsureGlobalDailyAnalysisTable_();
    bqEnsureGlobalDailyAnalysisItemsTable_();
    var rows = bqQuery_("SELECT COUNT(1) AS rows_count FROM " + bqTable_('daily_sales'));
    var msg = 'OK BigQuery. Dataset: ' + BQ_PROJECT_ID + '.' + BQ_DATASET_ID + '\nRows daily_sales: ' + (rows[0] ? rows[0].rows_count : 0);
    Logger.log(msg);
    return { ok:true, message:msg, rows: rows[0] ? rows[0].rows_count : 0 };
  } catch (e) {
    var msg = 'GAGAL BigQuery: ' + e.message;
    Logger.log(msg);
    return { ok:false, error:msg };
  }
}


/* ============================================================
 *  SETUP (BIGQUERY-ONLY MODE)
 * ============================================================ */
function setupSheetsMinimal() {
  throw new Error('BigQuery-only mode: setup Spreadsheet tidak diperlukan.');
}
function setupSheets() {
  throw new Error('BigQuery-only mode: setup Spreadsheet tidak diperlukan.');
}
function seedUsers() {
  throw new Error('BigQuery-only mode: Users memakai konstanta OUTLETS, bukan Spreadsheet.');
}
function seedUsers_(ss) {
  throw new Error('BigQuery-only mode: Users memakai konstanta OUTLETS, bukan Spreadsheet.');
}
function seedSampleData() {
  throw new Error('BigQuery-only mode: seed sample data ke Spreadsheet tidak diperlukan.');
}

/* ============================================================
 *  AUTH
 * ============================================================ */
function getBootstrap_() {
  return {
    today: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'),
    outlets: OUTLETS,
    brand: 'Bakerzin'
  };
}
function getBootstrap(){ return getBootstrap_(); }

/**
 * Login dengan outlet_code saja (passwordless).
 * @return {{ok, outlet_code, outlet_name, role, token, expires_at}|{ok:false, error}}
 */
function login(outletCode, password) {
  try {
    outletCode = String(outletCode || '').trim().toUpperCase();
    if (!outletCode) return { ok:false, error:'Kode outlet wajib diisi.' };

    var outlet = OUTLETS.find(function(o){ return String(o.code).toUpperCase() === outletCode; });
    if (!outlet) return { ok:false, error:'Kode outlet tidak ditemukan.' };

    var token = Utilities.getUuid();
    var cfg = readConfig_();
    var ttl = Number(cfg.session_ttl_hours) || 12;
    var expires = new Date(Date.now() + ttl*3600*1000);

    CacheService.getScriptCache().put('sess_' + token, outletCode, ttl*3600);
    audit_(outletCode, outletCode, 'login', 'auth', '', { mode:'BigQueryOnly' });

    return {
      ok:true,
      token: token,
      outlet_code: outlet.code,
      outlet_name: outlet.name,
      role: outlet.role || 'store',
      expires_at: expires.toISOString(),
      dataSource: 'BigQuery'
    };
  } catch (e) {
    return { ok:false, error:'Server error: ' + e.message };
  }
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove('sess_' + token);
  return { ok:true };
}

/** Validasi token → kembalikan {outlet_code, role}. Throws kalau invalid. */
function validateSession_(token) {
  if (!token) throw new Error('NO_SESSION');
  var cached = CacheService.getScriptCache().get('sess_' + token);
  if (!cached) throw new Error('SESSION_EXPIRED');

  cached = String(cached).toUpperCase();
  var outlet = OUTLETS.find(function(o){ return String(o.code).toUpperCase() === cached; });
  if (!outlet) throw new Error('USER_NOT_FOUND');

  return {
    outlet_code: outlet.code,
    role: outlet.role || 'store',
    outlet_name: outlet.name
  };
}



/* ============================================================
 *  DASHBOARD CACHE HELPERS — BIGQUERY ONLY V9 GLOBAL DAILY ANALYSIS.1
 *  Fix ReferenceError: cacheKeyDashboard_ / getCacheJson_ / putCacheJson_ / clearDashboardCache_
 * ============================================================ */
function dashCacheVersion_() {
  var props = PropertiesService.getScriptProperties();
  var v = props.getProperty('DASH_CACHE_VERSION_V9_2');
  if (!v) {
    v = String(Date.now());
    props.setProperty('DASH_CACHE_VERSION_V9_2', v);
  }
  return v;
}
function clearDashboardCache_() {
  // CacheService tidak punya remove-by-prefix. Naikkan versi agar cache lama otomatis diabaikan.
  PropertiesService.getScriptProperties().setProperty('DASH_CACHE_VERSION_V9_2', String(Date.now()));
}
function cacheKeyDashboard_(sess, year, month, outletFilter) {
  var scope = (sess && sess.role === 'admin')
    ? String(outletFilter || 'ALL').toUpperCase()
    : String((sess && sess.outlet_code) || outletFilter || '').toUpperCase();
  return ['DASHV9_2', dashCacheVersion_(), scope, year, pad2_(month)].join('_');
}
function getCacheJson_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var metaRaw = cache.get(key + '_meta');
    if (!metaRaw) return null;
    var meta = JSON.parse(metaRaw);
    if (!meta || !meta.parts) return null;

    var joined = '';
    for (var i = 0; i < meta.parts; i++) {
      var part = cache.get(key + '_' + i);
      if (part == null) return null;
      joined += part;
    }

    var bytes = Utilities.base64Decode(joined);
    var blob = Utilities.newBlob(bytes, 'application/x-gzip', 'cache.gz');
    var text = Utilities.ungzip(blob).getDataAsString('UTF-8');
    return JSON.parse(text);
  } catch (e) {
    Logger.log('cache read skip: ' + e.message);
    return null;
  }
}
function putCacheJson_(key, obj, seconds) {
  try {
    var cache = CacheService.getScriptCache();
    var text = JSON.stringify(obj);
    var gz = Utilities.gzip(Utilities.newBlob(text, 'application/json', 'cache.json'));
    var b64 = Utilities.base64Encode(gz.getBytes());
    var chunkSize = 85000;
    var parts = Math.ceil(b64.length / chunkSize);

    // Hindari quota/cache item terlalu besar. Kalau dashboard terlalu besar, skip cache saja.
    if (parts > 8) {
      Logger.log('cache skip: payload terlalu besar, parts=' + parts);
      return;
    }

    var ttl = seconds || 600;
    for (var i = 0; i < parts; i++) {
      cache.put(key + '_' + i, b64.slice(i * chunkSize, (i + 1) * chunkSize), ttl);
    }
    cache.put(key + '_meta', JSON.stringify({ parts: parts, ts: Date.now() }), ttl);
  } catch (e) {
    Logger.log('cache write skip: ' + e.message);
  }
}


/* ============================================================
 *  API — dashboard data
 * ============================================================ */

/**
 * Get dashboard untuk satu outlet (atau ALL / aggregate untuk admin BIHQ).
 * V7: menggunakan BigQuery sebagai sumber utama agar BIHQ / ALL Outlet jauh lebih ringan.
 * Jika BigQuery service belum aktif atau query gagal, aplikasi akan menampilkan error agar data source tetap tunggal.
 * @param {string} token
 * @param {number} year
 * @param {number} month  1..12
 * @param {string} outletFilter  'ALL' or outlet_code (admin only). Store user: dipaksa ke outlet sendiri.
 */
function getMonthDashboard(token, year, month, outletFilter) {
  if (!bqIsAvailable_()) {
    throw new Error('BigQuery API belum aktif / konfigurasi BigQuery belum lengkap. Aktifkan Services → BigQuery API, lalu cek BQ_PROJECT_ID dan BQ_DATASET_ID.');
  }
  return getMonthDashboardBigQuery_(token, year, month, outletFilter);
}

function getMonthDashboardBigQuery_(token, year, month, outletFilter) {
  var sess = validateSession_(token);
  year = Number(year); month = Number(month);
  outletFilter = (outletFilter || sess.outlet_code).toUpperCase();
  if (sess.role !== 'admin') outletFilter = sess.outlet_code;

  var cacheKey = cacheKeyDashboard_(sess, year, month, outletFilter) + '_BQ';
  var cached = getCacheJson_(cacheKey);
  if (cached) {
    cached.fromCache = true;
    cached.dataSource = 'BigQuery';
    cached.user = { outlet_code: sess.outlet_code, outlet_name: sess.outlet_name, role: sess.role };
    cached.today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    return cached;
  }

  var cfg = readConfig_();
  var defaultTarget = Number(cfg.monthly_target) || 0;
  var daysInMonth = new Date(year, month, 0).getDate();

  var outletList = (outletFilter === 'ALL')
    ? OUTLETS.filter(function(o){ return o.role !== 'admin'; }).map(function(o){ return o.code; })
    : [outletFilter];

  var firstDayDt = new Date(year, month-1, 1);
  var lastDayDt  = new Date(year, month-1, daysInMonth);
  var firstDayOffset = (firstDayDt.getDay()+6)%7; // Mon-start: 0=Mon, 6=Sun
  var firstRowStart = new Date(year, month-1, 1 - firstDayOffset);
  var prevWeekStart = new Date(firstRowStart); prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  var lastDayDow = (lastDayDt.getDay()+6)%7;
  var lastOffset = lastDayDow < 6 ? 6-lastDayDow : 0;
  var lastRowEnd = new Date(year, month-1, daysInMonth + lastOffset);

  // Ambil semua daily sales yang dibutuhkan dalam 1 query: current month, cross-month calendar row,
  // previous week comparison, dan previous same-weekday comparison.
  var dailyRows = bqFetchDailyRows_(outletList, prevWeekStart, lastRowEnd);
  var weeklyRows = bqFetchWeeklyRows_(outletList, year, month);
  var monthlyRows = bqFetchMonthlyRows_(outletList, year, month);
  var targetsMap = bqGetTargetsMap_(year, month);
  var comparison = bqFetchComparisonSums_(outletList, year, month);
  var globalRows = bqFetchGlobalDailyRows_(firstRowStart, lastRowEnd);

  var globalByDate = {};
  globalRows.forEach(function(g){
    if (g && g.date) globalByDate[String(g.date).slice(0,10)] = g;
  });

  var salesByDate = {};
  var salesByOutletDate = {};
  var dailyByOutletDate = {};
  dailyRows.forEach(function(r){
    var oc = String(r.outlet_code || '').toUpperCase();
    var key = r.date;
    var sales = Number(r.sales) || 0;
    if (!key || outletList.indexOf(oc) === -1) return;
    if (!salesByDate[key]) salesByDate[key] = 0;
    salesByDate[key] += sales;
    salesByOutletDate[oc + '|' + key] = sales;
    dailyByOutletDate[oc + '|' + key] = {
      date: key,
      sales: sales,
      analisa_harian: r.analisa_harian || '',
      analisa_status: r.analisa_status || ''
    };
  });

  var weeklyByW = {};
  weeklyRows.forEach(function(r){
    var wk = Number(r.week) || 0;
    var oc = String(r.outlet_code || '').toUpperCase();
    if (!wk) return;
    if (!weeklyByW[wk]) weeklyByW[wk] = { w:wk, analysis:'', status:'na', total:0, contributors:[] };
    weeklyByW[wk].contributors.push({
      outlet: oc,
      outletName: outletName_(oc),
      text: r.analisa_mingguan || '',
      status: r.status || 'na'
    });
    if (outletList.length === 1) {
      weeklyByW[wk].analysis = r.analisa_mingguan || '';
      weeklyByW[wk].status = r.status || 'pending';
    }
  });
  Object.keys(weeklyByW).forEach(function(wk){
    if (outletList.length > 1) {
      var contributors = weeklyByW[wk].contributors || [];
      var anyPend = contributors.some(function(c){ return c.status === 'pending'; });
      var anyDone = contributors.some(function(c){ return c.status === 'done'; });
      weeklyByW[wk].status = anyPend ? 'pending' : (anyDone ? 'done' : 'na');
    }
  });

  var monthRow = null;
  if (monthlyRows.length) {
    monthRow = { analysis:'', status:'na', contributors:[] };
    monthlyRows.forEach(function(r){
      var oc = String(r.outlet_code || '').toUpperCase();
      monthRow.contributors.push({
        outlet: oc,
        outletName: outletName_(oc),
        text: r.analisa_bulanan || '',
        status: r.status || 'na'
      });
      if (outletList.length === 1) {
        monthRow.analysis = r.analisa_bulanan || '';
        monthRow.status = r.status || 'pending';
      }
    });
  }

  var perOutlet = {};
  outletList.forEach(function(oc){ perOutlet[oc] = { code:oc, name:outletName_(oc), total:0 }; });

  var days = [];
  for (var d=1; d<=daysInMonth; d++) {
    var dt = new Date(year, month-1, d);
    var key = Utilities.formatDate(dt, TZ, 'yyyy-MM-dd');
    var prevDt = new Date(dt); prevDt.setDate(prevDt.getDate() - 7);
    var prevKey = Utilities.formatDate(prevDt, TZ, 'yyyy-MM-dd');

    var rec = {
      date: key, day: d, dow: dt.getDay(), week: weekOfMonth_(dt),
      sales: 0,
      prevDate: prevKey,
      prevSales: salesByDate[prevKey] || 0,
      global: globalByDate[key] || defaultGlobalDailyAnalysis_(key),
      daily: { status:'na', text:'' },
      contributors: []
    };

    outletList.forEach(function(oc){
      var row = dailyByOutletDate[oc + '|' + key];
      var sales = row ? (Number(row.sales)||0) : 0;
      var prevSales = salesByOutletDate[oc + '|' + prevKey] || 0;
      rec.sales += sales;
      if (perOutlet[oc]) perOutlet[oc].total += sales;
      rec.contributors.push({
        outlet: oc,
        outletName: outletName_(oc),
        sales: sales,
        prevDate: prevKey,
        prevSales: prevSales,
        deltaNominal: sales - prevSales,
        deltaPct: prevSales > 0 ? ((sales - prevSales) / prevSales * 100) : null,
        status: row ? (row.analisa_status || 'pending') : 'na',
        text: row ? (row.analisa_harian || '') : ''
      });
      if (outletList.length === 1) {
        rec.daily = {
          status: row && row.analisa_status === 'done' ? 'done' : (row && row.sales ? 'pending' : 'na'),
          text: row ? (row.analisa_harian || '') : ''
        };
      }
    });

    if (outletList.length > 1) {
      var anyPending = rec.contributors.some(function(c){ return c.status === 'pending'; });
      var anyDone = rec.contributors.some(function(c){ return c.status === 'done'; });
      rec.daily.status = anyPending ? 'pending' : (anyDone ? 'done' : 'na');
    }
    days.push(rec);
  }

  var weeksMap = {};
  days.forEach(function(d){
    if (!weeksMap[d.week]) weeksMap[d.week] = { w:d.week, start:d.date, end:d.date, total:0 };
    weeksMap[d.week].end = d.date;
    weeksMap[d.week].total += d.sales;
  });

  var crossPrev = [];
  if (firstDayOffset > 0) {
    var pmYear = month===1?year-1:year, pmMonth = month===1?12:month-1;
    var pmDim = new Date(pmYear, pmMonth, 0).getDate();
    for (var ci=0; ci<firstDayOffset; ci++) {
      var cdt = new Date(pmYear, pmMonth-1, pmDim-firstDayOffset+1+ci);
      var ck = Utilities.formatDate(cdt, TZ, 'yyyy-MM-dd');
      var cs = salesByDate[ck] || 0;
      crossPrev.push({ date:ck, day:cdt.getDate(), month:cdt.getMonth()+1, year:cdt.getFullYear(), dow:cdt.getDay(), sales:cs, global: globalByDate[ck] || defaultGlobalDailyAnalysis_(ck) });
    }
    var firstWkNum = days.length>0?days[0].week:1;
    if (weeksMap[firstWkNum]) {
      crossPrev.forEach(function(x){ weeksMap[firstWkNum].total += x.sales; });
      if (crossPrev.length) weeksMap[firstWkNum].start = crossPrev[0].date;
    }
  }

  var crossNext = [];
  if (lastOffset > 0) {
    var nmYear = month===12?year+1:year, nmMonth = month===12?1:month+1;
    for (var ni=1; ni<=lastOffset; ni++) {
      var ndt = new Date(nmYear, nmMonth-1, ni);
      var nk = Utilities.formatDate(ndt, TZ, 'yyyy-MM-dd');
      var ns = salesByDate[nk] || 0;
      crossNext.push({ date:nk, day:ndt.getDate(), month:ndt.getMonth()+1, year:ndt.getFullYear(), dow:ndt.getDay(), sales:ns, global: globalByDate[nk] || defaultGlobalDailyAnalysis_(nk) });
    }
    var lastWkNum = days.length>0?days[days.length-1].week:1;
    if (weeksMap[lastWkNum]) {
      crossNext.forEach(function(x){ weeksMap[lastWkNum].total += x.sales; });
      if (crossNext.length) weeksMap[lastWkNum].end = crossNext[crossNext.length-1].date;
    }
  }

  var prevWeekEnd = new Date(firstRowStart); prevWeekEnd.setDate(firstRowStart.getDate() - 1);
  var prevWeekTotalForW1 = sumSalesByDateRange_(salesByDate, prevWeekStart, prevWeekEnd);
  var weekNums = Object.keys(weeksMap).map(Number).sort(function(a,b){ return a-b; });
  var weeks = weekNums.map(function(wkNum, i){
    var w = weeksMap[wkNum];
    var meta = weeklyByW[wkNum] || { analysis:'', status:'pending', contributors:[] };
    var prevTotal = (i===0) ? prevWeekTotalForW1 : (weeksMap[weekNums[i-1]] ? weeksMap[weekNums[i-1]].total : 0);
    return {
      w:w.w, start:w.start, end:w.end, total:w.total, prevTotal:prevTotal,
      analysis:meta.analysis, status:meta.status, contributors:meta.contributors || []
    };
  });

  var monthTotal = days.reduce(function(sum, d){ return sum + (Number(d.sales)||0); }, 0);
  var aggregateTarget = outletList.reduce(function(sum, oc){
    return sum + (targetsMap[oc] != null ? Number(targetsMap[oc])||0 : defaultTarget);
  }, 0);
  var singleTarget = targetsMap[outletFilter] != null ? Number(targetsMap[outletFilter])||0 : defaultTarget;
  var finalTarget = outletFilter === 'ALL' ? aggregateTarget : singleTarget;

  var result = {
    year:year, monthNumber:month, daysInMonth:daysInMonth,
    outlet: outletFilter,
    outletName: outletFilter==='ALL' ? 'Semua Outlet (Aggregate)' : outletName_(outletFilter),
    isAggregate: outletFilter === 'ALL',
    monthTarget: finalTarget,
    today: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'),
    days: days,
    weeks: weeks,
    crossDays: { prev: crossPrev, next: crossNext },
    globalAnalysisByDate: globalByDate,
    ytdTotal: comparison.ytdTotal || 0,
    prevYtdTotal: comparison.prevYtdTotal || 0,
    prevMonthTotal: comparison.prevMonthTotal || 0,
    month: {
      total: monthTotal,
      target: finalTarget,
      pct: finalTarget ? (monthTotal / finalTarget * 100) : 0,
      analysis: monthRow ? monthRow.analysis : '',
      status: monthRow ? monthRow.status : 'pending',
      contributors: monthRow ? monthRow.contributors : []
    },
    perOutlet: Object.values(perOutlet).sort(function(a,b){ return b.total - a.total; }),
    user: { outlet_code: sess.outlet_code, outlet_name: sess.outlet_name, role: sess.role },
    fromCache: false,
    dataSource: 'BigQuery'
  };
  putCacheJson_(cacheKey, result, 600);
  return result;
}

/**
 * Legacy stub: fallback Spreadsheet dinonaktifkan di V8.
 */
function getMonthDashboardSheet_(token, year, month, outletFilter) {
  throw new Error('BigQuery-only mode: Spreadsheet fallback dinonaktifkan.');
}



/* ============================================================
 *  BIGQUERY HELPERS — V7
 * ============================================================ */
function bqIsAvailable_() {
  return typeof BigQuery !== 'undefined' && BQ_PROJECT_ID && BQ_DATASET_ID;
}
function bqTable_(tableId) {
  return '`' + BQ_PROJECT_ID + '.' + BQ_DATASET_ID + '.' + tableId + '`';
}
function bqQuote_(value) {
  if (value === null || value === undefined) return 'NULL';
  // BigQuery Standard SQL tidak boleh menerima newline mentah di dalam quoted string.
  // Analisa harian sering berisi enter, tanda petik, slash, emoji, dll.
  // Maka semua text dikirim sebagai base64 lalu didecode di SQL agar aman.
  var s = String(value).replace(/\u0000/g, '');
  var b64 = Utilities.base64Encode(Utilities.newBlob(s, 'text/plain').getBytes());
  return "CAST(FROM_BASE64('" + b64 + "') AS STRING)";
}
function bqDateLiteral_(dateOrKey) {
  if (!dateOrKey) return 'NULL';
  var key = (dateOrKey instanceof Date) ? Utilities.formatDate(dateOrKey, TZ, 'yyyy-MM-dd') : String(dateOrKey).slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return 'NULL';
  return "DATE '" + key + "'";
}
function bqNum_(value) {
  var n = Number(value);
  return isNaN(n) ? 'NULL' : String(n);
}
function bqBool_(value) {
  return value ? 'TRUE' : 'FALSE';
}
function bqInt_(value) {
  var n = parseInt(value, 10);
  return isNaN(n) ? 'NULL' : String(n);
}
function bqInList_(list) {
  return list.map(function(x){ return bqQuote_(String(x).toUpperCase()); }).join(',');
}
function bqCellValue_(cell) {
  if (!cell || cell.v === undefined || cell.v === null) return null;
  return cell.v;
}
function bqQuery_(sql) {
  if (!bqIsAvailable_()) throw new Error('BigQuery API belum aktif di Apps Script Services.');
  var request = { query: sql, useLegacySql: false, location: BQ_LOCATION };
  var res = BigQuery.Jobs.query(request, BQ_PROJECT_ID);
  var jobId = res.jobReference.jobId;
  var args = { location: BQ_LOCATION, maxResults: 10000 };
  var waitMs = 150;
  while (!res.jobComplete) {
    Utilities.sleep(waitMs);
    res = BigQuery.Jobs.getQueryResults(BQ_PROJECT_ID, jobId, args);
    waitMs = Math.min(waitMs * 2, 1200);
  }
  if (res.errors && res.errors.length) throw new Error(JSON.stringify(res.errors));
  var fields = (res.schema && res.schema.fields) ? res.schema.fields : [];
  var out = [];
  function pushRows_(r) {
    (r.rows || []).forEach(function(row){
      var obj = {};
      fields.forEach(function(f, i){ obj[f.name] = bqCellValue_(row.f[i]); });
      out.push(obj);
    });
  }
  pushRows_(res);
  var pageToken = res.pageToken;
  while (pageToken) {
    var pageArgs = { location: BQ_LOCATION, maxResults: 10000, pageToken: pageToken };
    var page = BigQuery.Jobs.getQueryResults(BQ_PROJECT_ID, jobId, pageArgs);
    if (!fields.length && page.schema && page.schema.fields) fields = page.schema.fields;
    pushRows_(page);
    pageToken = page.pageToken;
  }
  return out;
}
function bqRunDml_(sql) {
  return bqQuery_(sql);
}
function dateKey_(date) {
  return Utilities.formatDate(date, TZ, 'yyyy-MM-dd');
}
function addDays_(date, days) {
  var d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function minDate_() {
  var arr = Array.prototype.slice.call(arguments);
  return arr.reduce(function(a,b){ return a.getTime() <= b.getTime() ? a : b; });
}
function maxDate_() {
  var arr = Array.prototype.slice.call(arguments);
  return arr.reduce(function(a,b){ return a.getTime() >= b.getTime() ? a : b; });
}
function sumSalesByDateRange_(salesByDate, startDate, endDate) {
  var total = 0;
  var d = new Date(startDate);
  var endKey = dateKey_(endDate);
  while (dateKey_(d) <= endKey) {
    total += Number(salesByDate[dateKey_(d)] || 0);
    d.setDate(d.getDate() + 1);
  }
  return total;
}
function bqFetchDailyRows_(outletList, startDate, endDate) {
  if (!outletList || !outletList.length) return [];
  var sql = "" +
    "SELECT outlet_code, FORMAT_DATE('%F', date) AS date, " +
    "CAST(IFNULL(sales,0) AS FLOAT64) AS sales, " +
    "IFNULL(analisa_harian,'') AS analisa_harian, IFNULL(analisa_status,'') AS analisa_status " +
    "FROM " + bqTable_('daily_sales') + " " +
    "WHERE UPPER(outlet_code) IN (" + bqInList_(outletList) + ") " +
    "AND date BETWEEN " + bqDateLiteral_(startDate) + " AND " + bqDateLiteral_(endDate) + " " +
    "QUALIFY ROW_NUMBER() OVER (PARTITION BY UPPER(outlet_code), date ORDER BY updated_at DESC NULLS LAST, submitted_at DESC NULLS LAST) = 1";
  return bqQuery_(sql);
}
function bqFetchWeeklyRows_(outletList, year, month) {
  if (!outletList || !outletList.length) return [];
  var sql = "" +
    "SELECT outlet_code, CAST(week AS INT64) AS week, IFNULL(analisa_mingguan,'') AS analisa_mingguan, IFNULL(status,'') AS status " +
    "FROM " + bqTable_('weekly_analysis') + " " +
    "WHERE UPPER(outlet_code) IN (" + bqInList_(outletList) + ") " +
    "AND CAST(year AS INT64) = " + bqInt_(year) + " AND CAST(month AS INT64) = " + bqInt_(month) + " " +
    "QUALIFY ROW_NUMBER() OVER (PARTITION BY UPPER(outlet_code), CAST(week AS INT64) ORDER BY updated_at DESC NULLS LAST, submitted_at DESC NULLS LAST) = 1";
  return bqQuery_(sql);
}
function bqFetchMonthlyRows_(outletList, year, month) {
  if (!outletList || !outletList.length) return [];
  var sql = "" +
    "SELECT outlet_code, IFNULL(analisa_bulanan,'') AS analisa_bulanan, IFNULL(status,'') AS status " +
    "FROM " + bqTable_('monthly_analysis') + " " +
    "WHERE UPPER(outlet_code) IN (" + bqInList_(outletList) + ") " +
    "AND CAST(year AS INT64) = " + bqInt_(year) + " AND CAST(month AS INT64) = " + bqInt_(month) + " " +
    "QUALIFY ROW_NUMBER() OVER (PARTITION BY UPPER(outlet_code), CAST(year AS INT64), CAST(month AS INT64) ORDER BY updated_at DESC NULLS LAST, submitted_at DESC NULLS LAST) = 1";
  return bqQuery_(sql);
}
function bqGetTargetsMap_(year, month) {
  var out = {};
  try {
    var sql = "" +
      "SELECT UPPER(outlet_code) AS outlet_code, CAST(target AS FLOAT64) AS target " +
      "FROM " + bqTable_('targets') + " " +
      "WHERE CAST(year AS INT64) = " + bqInt_(year) + " AND CAST(month AS INT64) = " + bqInt_(month) + " " +
      "QUALIFY ROW_NUMBER() OVER (PARTITION BY UPPER(outlet_code), CAST(year AS INT64), CAST(month AS INT64) ORDER BY outlet_code) = 1";
    bqQuery_(sql).forEach(function(r){ out[String(r.outlet_code).toUpperCase()] = Number(r.target)||0; });
  } catch (e) {
    Logger.log('bqGetTargetsMap_ fallback empty: ' + e.message);
  }
  return out;
}
function bqFetchComparisonSums_(outletList, year, month) {
  var currentEnd = new Date(year, month, 0);
  var prevEnd = new Date(year-1, month, 0);
  var prevMonthStart = new Date(year-1, month-1, 1);
  var sql = "" +
    "WITH src AS (" +
    "SELECT outlet_code, date, CAST(IFNULL(sales,0) AS FLOAT64) AS sales " +
    "FROM " + bqTable_('daily_sales') + " " +
    "WHERE UPPER(outlet_code) IN (" + bqInList_(outletList) + ") " +
    "AND date BETWEEN DATE '" + (year-1) + "-01-01' AND " + bqDateLiteral_(currentEnd) + " " +
    "QUALIFY ROW_NUMBER() OVER (PARTITION BY UPPER(outlet_code), date ORDER BY updated_at DESC NULLS LAST, submitted_at DESC NULLS LAST) = 1" +
    ") SELECT " +
    "SUM(IF(date BETWEEN DATE '" + year + "-01-01' AND " + bqDateLiteral_(currentEnd) + ", sales, 0)) AS ytdTotal, " +
    "SUM(IF(date BETWEEN DATE '" + (year-1) + "-01-01' AND " + bqDateLiteral_(prevEnd) + ", sales, 0)) AS prevYtdTotal, " +
    "SUM(IF(date BETWEEN " + bqDateLiteral_(prevMonthStart) + " AND " + bqDateLiteral_(prevEnd) + ", sales, 0)) AS prevMonthTotal " +
    "FROM src";
  var rows = bqQuery_(sql);
  var r = rows[0] || {};
  return {
    ytdTotal: Number(r.ytdTotal) || 0,
    prevYtdTotal: Number(r.prevYtdTotal) || 0,
    prevMonthTotal: Number(r.prevMonthTotal) || 0
  };
}

function bqEnsureGlobalDailyAnalysisTable_() {
  if (!bqIsAvailable_()) return;
  var props = PropertiesService.getScriptProperties();
  var propKey = 'BQ_GLOBAL_DAILY_ANALYSIS_TABLE_READY_V1';
  if (props.getProperty(propKey) === 'yes') return;
  var sql = "" +
    "CREATE TABLE IF NOT EXISTS " + bqTable_('global_daily_analysis') + " (" +
    "date DATE NOT NULL, " +
    "is_national_holiday BOOL, " +
    "national_holiday_note STRING, " +
    "has_promo BOOL, " +
    "promo_note STRING, " +
    "has_event BOOL, " +
    "event_note STRING, " +
    "other_analysis STRING, " +
    "submitted_by STRING, " +
    "submitted_at TIMESTAMP, " +
    "updated_at TIMESTAMP" +
    ") PARTITION BY date";
  bqRunDml_(sql);
  props.setProperty(propKey, 'yes');
}

function bqEnsureGlobalDailyAnalysisItemsTable_() {
  if (!bqIsAvailable_()) return;
  var props = PropertiesService.getScriptProperties();
  var propKey = 'BQ_GLOBAL_DAILY_ANALYSIS_ITEMS_TABLE_READY_V1';
  if (props.getProperty(propKey) === 'yes') return;
  var sql = "" +
    "CREATE TABLE IF NOT EXISTS " + bqTable_('global_daily_analysis_items') + " (" +
    "item_id STRING NOT NULL, " +
    "date DATE NOT NULL, " +
    "analysis_type STRING NOT NULL, " +
    "note STRING, " +
    "active BOOL, " +
    "submitted_by STRING, " +
    "submitted_at TIMESTAMP, " +
    "updated_at TIMESTAMP" +
    ") PARTITION BY date";
  bqRunDml_(sql);
  props.setProperty(propKey, 'yes');
}

function defaultGlobalDailyAnalysis_(key) {
  return {
    date: key || '',
    items: [],
    is_national_holiday: false,
    national_holiday_note: '',
    has_promo: false,
    promo_note: '',
    has_event: false,
    event_note: '',
    other_analysis: '',
    hasAny: false
  };
}

function normalizeBool_(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  var s = String(value).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'ya' || s === '1';
}

function normalizeGlobalAnalysisType_(value) {
  var s = String(value || '').trim().toUpperCase();
  if (s === 'PUBLIC_HOLIDAY' || s === 'HOLIDAY' || s === 'LIBUR_NASIONAL' || s === 'NATIONAL_HOLIDAY') return 'PH';
  if (s === 'P' || s === 'PROMO') return 'PROMO';
  if (s === 'E' || s === 'EVENT') return 'EVENT';
  if (s === 'A' || s === 'ANALISA_LAIN' || s === 'OTHER_ANALYSIS' || s === 'LAIN') return 'OTHER';
  if (s === 'PH') return 'PH';
  if (s === 'OTHER') return 'OTHER';
  return '';
}

function globalTypeLabel_(type) {
  type = normalizeGlobalAnalysisType_(type);
  if (type === 'PH') return 'Public Holiday';
  if (type === 'PROMO') return 'Promo';
  if (type === 'EVENT') return 'Event';
  if (type === 'OTHER') return 'Analisa Lain';
  return type || 'Analisa';
}

function normalizeGlobalItems_(items) {
  if (!items) return [];
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch(e) { items = []; }
  }
  if (!Array.isArray(items)) return [];
  return items.map(function(it){
    var type = normalizeGlobalAnalysisType_(it.analysis_type || it.type || it.kind);
    var note = String(it.note || it.text || it.description || '').trim();
    if (!type || !note) return null;
    return {
      item_id: String(it.item_id || it.id || ''),
      type: type,
      analysis_type: type,
      label: globalTypeLabel_(type),
      note: note,
      submitted_by: String(it.submitted_by || ''),
      updated_at: String(it.updated_at || '')
    };
  }).filter(function(x){ return !!x; });
}

function notesByType_(items, type) {
  type = normalizeGlobalAnalysisType_(type);
  return items.filter(function(it){ return normalizeGlobalAnalysisType_(it.type || it.analysis_type) === type; })
    .map(function(it){ return it.note; })
    .filter(Boolean)
    .join('\n');
}

function legacyGlobalToItems_(r) {
  var items = [];
  var key = r && r.date ? String(r.date).slice(0,10) : '';
  if (normalizeBool_(r && r.is_national_holiday)) items.push({ item_id:'legacy-ph-' + key, type:'PH', analysis_type:'PH', label:'Public Holiday', note:String((r && r.national_holiday_note) || 'Public Holiday').trim() || 'Public Holiday' });
  if (normalizeBool_(r && r.has_promo)) items.push({ item_id:'legacy-promo-' + key, type:'PROMO', analysis_type:'PROMO', label:'Promo', note:String((r && r.promo_note) || 'Ada promo global').trim() || 'Ada promo global' });
  if (normalizeBool_(r && r.has_event)) items.push({ item_id:'legacy-event-' + key, type:'EVENT', analysis_type:'EVENT', label:'Event', note:String((r && r.event_note) || 'Ada event global').trim() || 'Ada event global' });
  if (r && r.other_analysis) items.push({ item_id:'legacy-other-' + key, type:'OTHER', analysis_type:'OTHER', label:'Analisa Lain', note:String(r.other_analysis).trim() });
  return items.filter(function(it){ return !!it.note; });
}

function normalizeGlobalDailyRow_(r) {
  var key = r && r.date ? String(r.date).slice(0,10) : '';
  var items = normalizeGlobalItems_(r && r.items);

  // Backward compatibility untuk table lama global_daily_analysis.
  if (!items.length) items = legacyGlobalToItems_(r);

  var phNote = notesByType_(items, 'PH');
  var promoNote = notesByType_(items, 'PROMO');
  var eventNote = notesByType_(items, 'EVENT');
  var otherNote = notesByType_(items, 'OTHER');
  var obj = {
    date: key,
    items: items,
    is_national_holiday: !!phNote,
    national_holiday_note: phNote,
    has_promo: !!promoNote,
    promo_note: promoNote,
    has_event: !!eventNote,
    event_note: eventNote,
    other_analysis: otherNote,
    submitted_by: (r && r.submitted_by) || '',
    updated_at: (r && r.updated_at) || ''
  };
  obj.hasAny = items.length > 0;
  return obj;
}

function bqFetchGlobalDailyRows_(startDate, endDate) {
  try {
    bqEnsureGlobalDailyAnalysisTable_();
    bqEnsureGlobalDailyAnalysisItemsTable_();
    var byDate = {};

    var sqlItems = "" +
      "SELECT FORMAT_DATE('%F', date) AS date, item_id, UPPER(analysis_type) AS analysis_type, IFNULL(note,'') AS note, " +
      "IFNULL(submitted_by,'') AS submitted_by, CAST(updated_at AS STRING) AS updated_at " +
      "FROM " + bqTable_('global_daily_analysis_items') + " " +
      "WHERE date BETWEEN " + bqDateLiteral_(startDate) + " AND " + bqDateLiteral_(endDate) + " " +
      "AND IFNULL(active, TRUE) = TRUE " +
      "ORDER BY date, submitted_at, updated_at";
    bqQuery_(sqlItems).forEach(function(r){
      var key = String(r.date || '').slice(0,10);
      if (!key) return;
      if (!byDate[key]) byDate[key] = { date:key, items:[] };
      byDate[key].items.push({
        item_id: r.item_id || '',
        type: normalizeGlobalAnalysisType_(r.analysis_type),
        analysis_type: normalizeGlobalAnalysisType_(r.analysis_type),
        label: globalTypeLabel_(r.analysis_type),
        note: r.note || '',
        submitted_by: r.submitted_by || '',
        updated_at: r.updated_at || ''
      });
    });

    // Legacy table tetap dibaca agar data PH/Promo/Event yang sudah pernah disimpan tidak hilang.
    var sqlLegacy = "" +
      "SELECT FORMAT_DATE('%F', date) AS date, " +
      "IFNULL(is_national_holiday, FALSE) AS is_national_holiday, IFNULL(national_holiday_note,'') AS national_holiday_note, " +
      "IFNULL(has_promo, FALSE) AS has_promo, IFNULL(promo_note,'') AS promo_note, " +
      "IFNULL(has_event, FALSE) AS has_event, IFNULL(event_note,'') AS event_note, " +
      "IFNULL(other_analysis,'') AS other_analysis, IFNULL(submitted_by,'') AS submitted_by, CAST(updated_at AS STRING) AS updated_at " +
      "FROM " + bqTable_('global_daily_analysis') + " " +
      "WHERE date BETWEEN " + bqDateLiteral_(startDate) + " AND " + bqDateLiteral_(endDate) + " " +
      "QUALIFY ROW_NUMBER() OVER (PARTITION BY date ORDER BY updated_at DESC NULLS LAST, submitted_at DESC NULLS LAST) = 1";
    bqQuery_(sqlLegacy).forEach(function(r){
      var key = String(r.date || '').slice(0,10);
      if (!key) return;
      if (!byDate[key]) byDate[key] = { date:key, items:[] };
      var legacyItems = legacyGlobalToItems_(r);
      legacyItems.forEach(function(it){
        var duplicate = byDate[key].items.some(function(existing){
          return normalizeGlobalAnalysisType_(existing.type || existing.analysis_type) === normalizeGlobalAnalysisType_(it.type) && String(existing.note || '').trim() === String(it.note || '').trim();
        });
        if (!duplicate) byDate[key].items.push(it);
      });
    });

    return Object.keys(byDate).map(function(key){ return normalizeGlobalDailyRow_(byDate[key]); });
  } catch (e) {
    Logger.log('bqFetchGlobalDailyRows_ kosong/gagal: ' + e.message);
    return [];
  }
}

function bqInsertGlobalDailyAnalysisItem_(key, type, note, submittedBy) {
  if (!BQ_WRITE_ENABLED || !bqIsAvailable_()) return '';
  bqEnsureGlobalDailyAnalysisItemsTable_();
  var itemId = Utilities.getUuid();
  var sql = "" +
    "INSERT INTO " + bqTable_('global_daily_analysis_items') + " " +
    "(item_id,date,analysis_type,note,active,submitted_by,submitted_at,updated_at) VALUES (" +
    bqQuote_(itemId) + ", " + bqDateLiteral_(key) + ", " + bqQuote_(type) + ", " + bqQuote_(note || '') + ", TRUE, " +
    bqQuote_(submittedBy || 'BIHQ') + ", CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())";
  bqRunDml_(sql);
  return itemId;
}

function bqDeactivateGlobalDailyAnalysisItem_(key, itemId) {
  if (!BQ_WRITE_ENABLED || !bqIsAvailable_()) return;
  bqEnsureGlobalDailyAnalysisItemsTable_();
  var sql = "" +
    "UPDATE " + bqTable_('global_daily_analysis_items') + " " +
    "SET active=FALSE, updated_at=CURRENT_TIMESTAMP() " +
    "WHERE date=" + bqDateLiteral_(key) + " AND item_id=" + bqQuote_(itemId || '');
  bqRunDml_(sql);
}

function bqFetchOneGlobalDaily_(key) {
  var rows = bqFetchGlobalDailyRows_(key, key);
  return rows[0] || defaultGlobalDailyAnalysis_(key);
}

// Legacy writer tetap ada supaya tidak mematahkan fungsi lama, tetapi UI V9.2 memakai addGlobalDailyAnalysisItem().
function bqSyncGlobalDailyAnalysis_(key, isHoliday, holidayNote, hasPromo, promoNote, hasEvent, eventNote, otherAnalysis, submittedBy) {
  if (!BQ_WRITE_ENABLED || !bqIsAvailable_()) return;
  if (isHoliday && holidayNote) bqInsertGlobalDailyAnalysisItem_(key, 'PH', holidayNote, submittedBy);
  if (hasPromo && promoNote) bqInsertGlobalDailyAnalysisItem_(key, 'PROMO', promoNote, submittedBy);
  if (hasEvent && eventNote) bqInsertGlobalDailyAnalysisItem_(key, 'EVENT', eventNote, submittedBy);
  if (otherAnalysis) bqInsertGlobalDailyAnalysisItem_(key, 'OTHER', otherAnalysis, submittedBy);
}

function bqSyncDaily_(oc, key, year, month, week, dow, sales, analisa, status, submittedBy) {
  if (!BQ_WRITE_ENABLED || !bqIsAvailable_()) return;
  var sql = "" +
    "MERGE " + bqTable_('daily_sales') + " T USING (SELECT " +
    bqQuote_(oc) + " AS outlet_code, " + bqDateLiteral_(key) + " AS date, " +
    bqInt_(year) + " AS year, " + bqInt_(month) + " AS month, " + bqInt_(week) + " AS week, " +
    bqQuote_(dow) + " AS day_of_week, CAST(" + bqNum_(sales) + " AS NUMERIC) AS sales, " +
    bqQuote_(analisa || '') + " AS analisa_harian, " + bqQuote_(status || '') + " AS analisa_status, " +
    bqQuote_(submittedBy || oc) + " AS submitted_by, CURRENT_TIMESTAMP() AS ts) S " +
    "ON UPPER(T.outlet_code)=UPPER(S.outlet_code) AND T.date=S.date " +
    "WHEN MATCHED THEN UPDATE SET year=S.year, month=S.month, week=S.week, day_of_week=S.day_of_week, sales=S.sales, " +
    "analisa_harian=S.analisa_harian, analisa_status=S.analisa_status, submitted_by=S.submitted_by, updated_at=S.ts " +
    "WHEN NOT MATCHED THEN INSERT (outlet_code,date,year,month,week,day_of_week,sales,analisa_harian,analisa_status,submitted_by,submitted_at,updated_at) " +
    "VALUES (S.outlet_code,S.date,S.year,S.month,S.week,S.day_of_week,S.sales,S.analisa_harian,S.analisa_status,S.submitted_by,S.ts,S.ts)";
  bqRunDml_(sql);
}
function bqSyncWeekly_(oc, periodKey, year, month, week, periodStart, periodEnd, total, analisa, status, submittedBy) {
  if (!BQ_WRITE_ENABLED || !bqIsAvailable_()) return;
  var sql = "" +
    "MERGE " + bqTable_('weekly_analysis') + " T USING (SELECT " +
    bqQuote_(oc) + " AS outlet_code, " + bqQuote_(periodKey) + " AS period_key, " + bqInt_(year) + " AS year, " +
    bqInt_(month) + " AS month, " + bqInt_(week) + " AS week, " + bqDateLiteral_(periodStart) + " AS period_start, " +
    bqDateLiteral_(periodEnd) + " AS period_end, CAST(" + bqNum_(total) + " AS NUMERIC) AS total_sales, " +
    bqQuote_(analisa || '') + " AS analisa_mingguan, " + bqQuote_(status || '') + " AS status, " +
    bqQuote_(submittedBy || oc) + " AS submitted_by, CURRENT_TIMESTAMP() AS ts) S " +
    "ON T.period_key=S.period_key " +
    "WHEN MATCHED THEN UPDATE SET year=S.year, month=S.month, week=S.week, period_start=S.period_start, period_end=S.period_end, total_sales=S.total_sales, " +
    "analisa_mingguan=S.analisa_mingguan, status=S.status, submitted_by=S.submitted_by, updated_at=S.ts " +
    "WHEN NOT MATCHED THEN INSERT (outlet_code,period_key,year,month,week,period_start,period_end,total_sales,analisa_mingguan,status,submitted_by,submitted_at,updated_at) " +
    "VALUES (S.outlet_code,S.period_key,S.year,S.month,S.week,S.period_start,S.period_end,S.total_sales,S.analisa_mingguan,S.status,S.submitted_by,S.ts,S.ts)";
  bqRunDml_(sql);
}
function bqSyncMonthly_(oc, periodKey, year, month, total, target, achievementPct, analisa, status, submittedBy) {
  if (!BQ_WRITE_ENABLED || !bqIsAvailable_()) return;
  var sql = "" +
    "MERGE " + bqTable_('monthly_analysis') + " T USING (SELECT " +
    bqQuote_(oc) + " AS outlet_code, " + bqQuote_(periodKey) + " AS period_key, " + bqInt_(year) + " AS year, " +
    bqInt_(month) + " AS month, CAST(" + bqNum_(total) + " AS NUMERIC) AS total_sales, CAST(" + bqNum_(target) + " AS NUMERIC) AS target, " +
    "CAST(" + bqNum_(achievementPct) + " AS FLOAT64) AS achievement_pct, " + bqQuote_(analisa || '') + " AS analisa_bulanan, " +
    bqQuote_(status || '') + " AS status, " + bqQuote_(submittedBy || oc) + " AS submitted_by, CURRENT_TIMESTAMP() AS ts) S " +
    "ON T.period_key=S.period_key " +
    "WHEN MATCHED THEN UPDATE SET year=S.year, month=S.month, total_sales=S.total_sales, target=S.target, achievement_pct=S.achievement_pct, " +
    "analisa_bulanan=S.analisa_bulanan, status=S.status, submitted_by=S.submitted_by, updated_at=S.ts " +
    "WHEN NOT MATCHED THEN INSERT (outlet_code,period_key,year,month,total_sales,target,achievement_pct,analisa_bulanan,status,submitted_by,submitted_at,updated_at) " +
    "VALUES (S.outlet_code,S.period_key,S.year,S.month,S.total_sales,S.target,S.achievement_pct,S.analisa_bulanan,S.status,S.submitted_by,S.ts,S.ts)";
  bqRunDml_(sql);
}
function bqSyncTarget_(oc, year, month, target) {
  if (!BQ_WRITE_ENABLED || !bqIsAvailable_()) return;
  if (target == null) {
    var del = "DELETE FROM " + bqTable_('targets') + " WHERE UPPER(outlet_code)=UPPER(" + bqQuote_(oc) + ") AND CAST(year AS INT64)=" + bqInt_(year) + " AND CAST(month AS INT64)=" + bqInt_(month);
    bqRunDml_(del);
    return;
  }
  var sql = "" +
    "MERGE " + bqTable_('targets') + " T USING (SELECT " +
    bqQuote_(oc) + " AS outlet_code, " + bqInt_(year) + " AS year, " + bqInt_(month) + " AS month, CAST(" + bqNum_(target) + " AS NUMERIC) AS target) S " +
    "ON UPPER(T.outlet_code)=UPPER(S.outlet_code) AND CAST(T.year AS INT64)=S.year AND CAST(T.month AS INT64)=S.month " +
    "WHEN MATCHED THEN UPDATE SET target=S.target " +
    "WHEN NOT MATCHED THEN INSERT (outlet_code,year,month,target) VALUES (S.outlet_code,S.year,S.month,S.target)";
  bqRunDml_(sql);
}

/* ============================================================
 *  SAVE APIs (require session)
 * ============================================================ */

function addGlobalDailyAnalysisItem(token, payload) {
  var sess = validateSession_(token);
  if (sess.role !== 'admin') return { ok:false, error:'Hanya BIHQ yang boleh menambah analisa global.' };
  payload = payload || {};
  var key = String(payload.date || '').slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return { ok:false, error:'Tanggal tidak valid.' };

  var type = normalizeGlobalAnalysisType_(payload.analysis_type || payload.type);
  if (!type) return { ok:false, error:'Jenis analisa wajib dipilih.' };

  var note = String(payload.note || payload.text || payload.description || '').trim();
  if (!note) return { ok:false, error:'Keterangan wajib diisi.' };

  try {
    var itemId = bqInsertGlobalDailyAnalysisItem_(key, type, note, sess.outlet_code);
    clearDashboardCache_();
    var saved = bqFetchOneGlobalDaily_(key);
    audit_(sess.outlet_code, sess.outlet_code, 'add_global_daily_analysis_item', 'global_day', key, { item_id:itemId, type:type, note:note });
    return { ok:true, date:key, item_id:itemId, global:saved, syncedTo:'BigQuery', dataSource:'BigQuery' };
  } catch (e) {
    Logger.log('BQ add global item gagal: ' + e.message);
    return { ok:false, error:'Gagal menambah analisa global ke BigQuery: ' + e.message };
  }
}

function deleteGlobalDailyAnalysisItem(token, payload) {
  var sess = validateSession_(token);
  if (sess.role !== 'admin') return { ok:false, error:'Hanya BIHQ yang boleh menghapus analisa global.' };
  payload = payload || {};
  var key = String(payload.date || '').slice(0,10);
  var itemId = String(payload.item_id || payload.id || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return { ok:false, error:'Tanggal tidak valid.' };
  if (!itemId) return { ok:false, error:'Item analisa tidak valid.' };
  if (itemId.indexOf('legacy-') === 0) return { ok:false, error:'Item lama tidak bisa dihapus dari panel ini. Tambahkan item baru sebagai pengganti.' };

  try {
    bqDeactivateGlobalDailyAnalysisItem_(key, itemId);
    clearDashboardCache_();
    var saved = bqFetchOneGlobalDaily_(key);
    audit_(sess.outlet_code, sess.outlet_code, 'delete_global_daily_analysis_item', 'global_day', key, { item_id:itemId });
    return { ok:true, date:key, global:saved, syncedTo:'BigQuery', dataSource:'BigQuery' };
  } catch (e) {
    Logger.log('BQ delete global item gagal: ' + e.message);
    return { ok:false, error:'Gagal menghapus analisa global di BigQuery: ' + e.message };
  }
}

function saveDaily(token, payload) {
  var sess = validateSession_(token);
  if (sess.role === 'admin') return { ok:false, error:'Akun HQ tidak boleh input sales.' };
  if (!bqIsAvailable_()) return { ok:false, error:'BigQuery API belum aktif.' };

  var dt = parseDateKey_(payload.date);
  var key = dateKey_(dt);
  var oc = sess.outlet_code;
  var analisa = (payload.analisa || '').trim();
  var status = analisa.length >= (Number(readConfig_().min_analysis_chars) || 20) ? 'done' : 'pending';
  var sales = Number(payload.sales) || 0;

  try {
    bqSyncDaily_(oc, key, dt.getFullYear(), dt.getMonth()+1, weekOfMonth_(dt), dowName_(dt.getDay()), sales, analisa, status, sess.outlet_code);
  } catch (e) {
    Logger.log('BQ save daily gagal: ' + e.message);
    return { ok:false, error:'Gagal simpan ke BigQuery: ' + e.message };
  }

  audit_(oc, sess.outlet_code, 'save_daily', 'day', key, payload);
  clearDashboardCache_();
  return { ok:true, date:key, status:status, sales:sales, syncedTo:'BigQuery', dataSource:'BigQuery' };
}


function saveGlobalDailyAnalysis(token, payload) {
  var sess = validateSession_(token);
  if (sess.role !== 'admin') return { ok:false, error:'Hanya BIHQ yang boleh menyimpan analisa global.' };
  if (!bqIsAvailable_()) return { ok:false, error:'BigQuery API belum aktif.' };

  var dt = parseDateKey_(payload.date);
  var key = dateKey_(dt);
  var isHoliday = normalizeBool_(payload.is_national_holiday || payload.libur_nasional || payload.is_ph || payload.ph);
  var hasPromo = normalizeBool_(payload.has_promo || payload.promo);
  var hasEvent = normalizeBool_(payload.has_event || payload.event);
  var holidayNote = isHoliday ? String(payload.national_holiday_note || payload.libur_nasional_note || payload.ph_note || '').trim() : '';
  var promoNote = hasPromo ? String(payload.promo_note || '').trim() : '';
  var eventNote = hasEvent ? String(payload.event_note || '').trim() : '';
  var otherAnalysis = String(payload.other_analysis || payload.analisa_lain || '').trim();

  try {
    bqSyncGlobalDailyAnalysis_(key, isHoliday, holidayNote, hasPromo, promoNote, hasEvent, eventNote, otherAnalysis, sess.outlet_code);
  } catch (e) {
    Logger.log('BQ save global daily gagal: ' + e.message);
    return { ok:false, error:'Gagal simpan analisa global ke BigQuery: ' + e.message };
  }

  var saved = normalizeGlobalDailyRow_({
    date: key,
    is_national_holiday: isHoliday,
    national_holiday_note: holidayNote,
    has_promo: hasPromo,
    promo_note: promoNote,
    has_event: hasEvent,
    event_note: eventNote,
    other_analysis: otherAnalysis,
    submitted_by: sess.outlet_code,
    updated_at: new Date().toISOString()
  });
  audit_(sess.outlet_code, sess.outlet_code, 'save_global_daily_analysis', 'global_day', key, saved);
  clearDashboardCache_();
  return { ok:true, date:key, global:saved, syncedTo:'BigQuery', dataSource:'BigQuery' };
}

function saveWeekly(token, payload) {
  var sess = validateSession_(token);
  if (sess.role === 'admin') return { ok:false, error:'Akun HQ tidak boleh input analisa outlet.' };
  if (!bqIsAvailable_()) return { ok:false, error:'BigQuery API belum aktif.' };

  var oc = sess.outlet_code;
  var year = Number(payload.year);
  var month = Number(payload.month);
  var week = Number(payload.week);
  var periodKey = oc + '-' + year + '-' + pad2_(month) + '-W' + week;
  var analisa = (payload.analisa || '').trim();
  var status = analisa.length >= (Number(readConfig_().min_analysis_chars) || 20) ? 'done' : 'pending';

  var dash = getMonthDashboard(token, year, month, oc);
  var wk = (dash.weeks || []).find(function(w){ return Number(w.w) === week; });
  var total = wk ? Number(wk.total) || 0 : 0;
  var range = wk ? [wk.start, wk.end] : ['', ''];

  try {
    bqSyncWeekly_(oc, periodKey, year, month, week, range[0], range[1], total, analisa, status, sess.outlet_code);
  } catch (e) {
    Logger.log('BQ save weekly gagal: ' + e.message);
    return { ok:false, error:'Gagal simpan ke BigQuery: ' + e.message };
  }

  audit_(oc, sess.outlet_code, 'save_weekly', 'week', periodKey, payload);
  clearDashboardCache_();
  return { ok:true, period:periodKey, status:status, total:total, syncedTo:'BigQuery', dataSource:'BigQuery' };
}

function saveMonthly(token, payload) {
  var sess = validateSession_(token);
  if (sess.role === 'admin') return { ok:false, error:'Akun HQ tidak boleh input analisa outlet.' };
  if (!bqIsAvailable_()) return { ok:false, error:'BigQuery API belum aktif.' };

  var oc = sess.outlet_code;
  var year = Number(payload.year);
  var month = Number(payload.month);
  var periodKey = oc + '-' + year + '-' + pad2_(month);
  var analisa = (payload.analisa || '').trim();
  var status = analisa.length >= (Number(readConfig_().min_analysis_chars) || 20) ? 'done' : 'pending';

  var dash = getMonthDashboard(token, year, month, oc);
  var total = dash.month ? Number(dash.month.total) || 0 : 0;
  var target = dash.month ? Number(dash.month.target) || 0 : 0;
  var pct = dash.month ? Number(dash.month.pct) || 0 : 0;

  try {
    bqSyncMonthly_(oc, periodKey, year, month, total, target, pct, analisa, status, sess.outlet_code);
  } catch (e) {
    Logger.log('BQ save monthly gagal: ' + e.message);
    return { ok:false, error:'Gagal simpan ke BigQuery: ' + e.message };
  }

  audit_(oc, sess.outlet_code, 'save_monthly', 'month', periodKey, payload);
  clearDashboardCache_();
  return { ok:true, period:periodKey, status:status, total:total, syncedTo:'BigQuery', dataSource:'BigQuery' };
}

/* ============================================================
 *  HELPERS
 * ============================================================ */
function readConfig_() {
  // BigQuery-only mode: konfigurasi runtime disimpan di konstanta APP_CONFIG,
  // supaya aplikasi tidak perlu membuka Spreadsheet untuk login/load/save.
  return Object.assign({}, APP_CONFIG);
}
function getTargetFor_(outletCode, year, month) {
  var targets = bqGetTargetsMap_(year, month);
  return targets[String(outletCode).toUpperCase()] || null;
}

function readDaily_(outletCode, year, month) {
  return {};
}

function readWeekly_(outletCode, year, month) {
  return {};
}

function readMonthly_(outletCode, year, month) {
  return null;
}

function headerIdx_(headerRow) { var idx={}; headerRow.forEach(function(h,i){ idx[h]=i; }); return idx; }

/**
 * Convert berbagai bentuk tanggal dari Sheet (Date object / string yyyy-MM-dd)
 * menjadi key stabil yyyy-MM-dd tanpa bias timezone.
 */
function dateKeyFromCell_(value) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, TZ, 'yyyy-MM-dd');
  var s = String(value).trim();
  var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  var d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}

/** Parse yyyy-MM-dd as local calendar date. */
function parseDateKey_(key) {
  var p = String(key).split('-').map(Number);
  return new Date(p[0], p[1]-1, p[2]);
}

/**
 * Read daily sales for outletList within an arbitrary date range.
 * Returns { 'yyyy-MM-dd': { date, sales } }
 * Perbandingan menggunakan date key, bukan getTime(), supaya tanggal akhir range
 * tidak terpotong oleh perbedaan timezone/jam dari Google Sheet.
 */
function readDailyCrossMonth_(outletList, startDate, endDate) {
  return {};
}



function sumDailyCrossMonth_(outletList, startDate, endDate) {
  var data = readDailyCrossMonth_(outletList, startDate, endDate);
  return Object.keys(data).reduce(function(sum, k){
    return sum + (Number(data[k].sales) || 0);
  }, 0);
}

/**
 * Sum all daily sales for outletList in a given year, months 1..throughMonth.
 */
function getYtdSales_(outletList, year, throughMonth) {
  return 0;
}


function weekOfMonth_(date) {
  var first = new Date(date.getFullYear(), date.getMonth(), 1);
  var offset = (first.getDay()+6) % 7;
  return Math.floor((date.getDate()-1 + offset)/7) + 1;
}
function dowName_(dow){ return ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][dow]; }
function pad2_(n){ n=Number(n); return n<10?'0'+n:''+n; }
function outletName_(code) {
  for (var i=0; i<OUTLETS.length; i++) if (OUTLETS[i].code===code) return OUTLETS[i].name;
  return code;
}
function audit_(outletCode, user, action, scope, periodKey, payload) {
  try {
    Logger.log(JSON.stringify({
      ts: new Date().toISOString(),
      outlet_code: outletCode,
      user: user,
      action: action,
      scope: scope,
      period_key: periodKey,
      payload: payload || {}
    }));
  } catch (e) {}
}

function showWebAppUrl_() {
  var url = ScriptApp.getService().getUrl();
  Logger.log(url ? 'Web App URL: ' + url : 'Belum deploy. Deploy → New deployment → Web app.');
  return url || '';
}


/* ============================================================
 *  TARGET MANAGEMENT (admin only)
 * ============================================================ */

/**
 * Get all custom targets for a given period.
 * Returns { OUTLET_CODE: target_value } (only outlets that have custom target).
 */
function getTargets(token, year, month) {
  validateSession_(token); // any logged-in user can read targets
  year = Number(year); month = Number(month);
  var defaultTarget = Number(readConfig_().monthly_target) || 0;
  if (!bqIsAvailable_()) return { defaultTarget: defaultTarget, targets: {}, dataSource:'BigQueryUnavailable' };
  return { defaultTarget: defaultTarget, targets: bqGetTargetsMap_(year, month), dataSource:'BigQuery' };
}

/**
 * Bulk save / reset targets. Admin (BIHQ) only.
 * @param updates { OUTLET_CODE: number | null }  (null = remove custom row, fall back to default)
 */
function saveTargets(token, year, month, updates) {
  var sess = validateSession_(token);
  if (sess.role !== 'admin') return { ok:false, error:'Hanya BIHQ yang boleh ubah target.' };
  if (!bqIsAvailable_()) return { ok:false, error:'BigQuery API belum aktif.' };

  year = Number(year); month = Number(month);
  updates = updates || {};
  var saved = 0, removed = 0;

  try {
    Object.keys(updates).forEach(function(oc){
      oc = String(oc).toUpperCase();
      if (updates[oc] == null) removed++;
      else saved++;
      bqSyncTarget_(oc, year, month, updates[oc]);
    });
  } catch (e) {
    Logger.log('BQ save targets gagal: ' + e.message);
    return { ok:false, error:'Gagal simpan target ke BigQuery: ' + e.message };
  }

  audit_('ALL', sess.outlet_code, 'save_targets', 'targets', year+'-'+pad2_(month), { saved:saved, removed:removed, updates:updates });
  clearDashboardCache_();
  return { ok:true, saved:saved, removed:removed, syncedTo:'BigQuery', dataSource:'BigQuery' };
}

function syncOutlets_(records) {
  (records || []).forEach(function (record) {
    var code = String(record.code || '').trim().toUpperCase();
    if (!code) return;
    var existing = OUTLETS.find(function (row) { return String(row.code).toUpperCase() === code; });
    if (existing) {
      existing.name = record.name || existing.name || code;
      existing.role = record.role || existing.role || 'store';
    } else {
      OUTLETS.push({ code: code, name: record.name || code, role: record.role || 'store' });
    }
  });
}

function issueBiSpaceSession_(outletCode, outletName, role) {
  outletCode = String(outletCode || '').trim().toUpperCase();
  syncOutlets_([{ code: outletCode, name: outletName || outletCode, role: role || 'store' }]);
  var token = Utilities.getUuid();
  var ttl = Number(APP_CONFIG.session_ttl_hours) || 12;
  CacheService.getScriptCache().put('sess_' + token, outletCode, ttl * 3600);
  return {
    ok: true,
    token: token,
    outlet_code: outletCode,
    outlet_name: outletName || outletCode,
    role: role || 'store',
    expires_at: new Date(Date.now() + ttl * 3600 * 1000).toISOString(),
    dataSource: 'BigQuery'
  };
}

return Object.freeze({
  syncOutlets: syncOutlets_,
  issueSession: issueBiSpaceSession_,
  getBootstrap: getBootstrap,
  getMonthDashboard: getMonthDashboard,
  getTargets: getTargets,
  saveTargets: saveTargets,
  saveDaily: saveDaily,
  saveWeekly: saveWeekly,
  saveMonthly: saveMonthly,
  saveGlobalDailyAnalysis: saveGlobalDailyAnalysis,
  addGlobalDailyAnalysisItem: addGlobalDailyAnalysisItem,
  deleteGlobalDailyAnalysisItem: deleteGlobalDailyAnalysisItem
});
}());

function salesAnalysisOutletDirectory_() {
  var codes = readActiveOutlets_();
  var directory = null;
  try { directory = readStoreCodeDirectory_(); } catch (error) { console.warn(error.message); }
  var rows = [{ code: 'BIHQ', name: 'Head Office (Summary)', role: 'admin' }];
  codes.forEach(function (code) {
    code = String(code || '').trim().toUpperCase();
    if (!code || code === 'BIHQ') return;
    var entry = directory && directory.byCode ? directory.byCode[code] : null;
    rows.push({ code: code, name: entry && entry.name ? entry.name : code, role: 'store' });
  });
  return rows;
}

function salesAnalysisContext_(token) {
  var mainSession = requireSession_(token);
  var employee = findEmployee_(mainSession.nik);
  assertEmployeeActive_(employee);
  var outlets = salesAnalysisOutletDirectory_();
  SALES_ANALYSIS.syncOutlets(outlets);
  var role = employee.outlet === 'BIHQ' ? 'admin' : 'store';
  var outlet = outlets.filter(function (row) { return row.code === employee.outlet; })[0] || { code: employee.outlet, name: employee.outlet, role: role };
  var analysisSession = SALES_ANALYSIS.issueSession(outlet.code, outlet.name, role);
  return { employee: employee, outlets: outlets, session: analysisSession };
}

function getSalesAnalysisBootstrap(token) {
  return safe_(function () {
    var context = salesAnalysisContext_(token);
    var result = context.session;
    result.boot = SALES_ANALYSIS.getBootstrap();
    result.boot.outlets = context.outlets;
    return result;
  });
}

function getSalesAnalysisDashboard(token, year, month, outletFilter) {
  return safe_(function () {
    var context = salesAnalysisContext_(token);
    return SALES_ANALYSIS.getMonthDashboard(context.session.token, year, month, outletFilter);
  });
}

function getSalesAnalysisTargets(token, year, month) {
  return safe_(function () {
    var context = salesAnalysisContext_(token);
    return SALES_ANALYSIS.getTargets(context.session.token, year, month);
  });
}

function saveSalesAnalysisTargets(token, year, month, updates) {
  return safe_(function () {
    var context = salesAnalysisContext_(token);
    return SALES_ANALYSIS.saveTargets(context.session.token, year, month, updates || {});
  });
}

function saveSalesAnalysisDaily(token, payload) {
  return safe_(function () {
    var context = salesAnalysisContext_(token);
    return SALES_ANALYSIS.saveDaily(context.session.token, payload || {});
  });
}

function saveSalesAnalysisWeekly(token, payload) {
  return safe_(function () {
    var context = salesAnalysisContext_(token);
    return SALES_ANALYSIS.saveWeekly(context.session.token, payload || {});
  });
}

function saveSalesAnalysisMonthly(token, payload) {
  return safe_(function () {
    var context = salesAnalysisContext_(token);
    return SALES_ANALYSIS.saveMonthly(context.session.token, payload || {});
  });
}

function saveSalesAnalysisGlobal(token, payload) {
  return safe_(function () {
    var context = salesAnalysisContext_(token);
    return SALES_ANALYSIS.saveGlobalDailyAnalysis(context.session.token, payload || {});
  });
}

function addSalesAnalysisGlobalItem(token, payload) {
  return safe_(function () {
    var context = salesAnalysisContext_(token);
    return SALES_ANALYSIS.addGlobalDailyAnalysisItem(context.session.token, payload || {});
  });
}

function deleteSalesAnalysisGlobalItem(token, payload) {
  return safe_(function () {
    var context = salesAnalysisContext_(token);
    return SALES_ANALYSIS.deleteGlobalDailyAnalysisItem(context.session.token, payload || {});
  });
}
