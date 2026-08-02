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
  STOCK_VISIBILITY_SHEET: 'STOCK_ITEM_VISIBILITY',
  SHOWCASE_SHEET: 'MENU_SHOWCASE',
  BQ_PROJECT_ID: 'berita-acara-digital',
  BQ_DATASET_ID: 'bakerzin_internal',
  BQ_LOCATION: 'asia-southeast2',
  SESSION_TTL_SECONDS: 10800,
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
    outletProgress: getOutletProgress,
    markTaskComplete: markTaskComplete,
    adminAddNews: adminAddNews,
    adminUpdateNews: adminUpdateNews,
    adminDeleteNews: adminDeleteNews,
    adminAddItem: adminAddItem,
    bootstrap: getStockCardBootstrap,
    data: getStockCardData,
    supplementary: getStockCardSupplementary,
    addLocation: addStockLocation,
    setItemHidden: setStockItemHidden,
    save: saveStockMovement,
    edit: updateStockMovement,
    adjust: adjustStockBalance,
    history: getStockHistory,
    verifyUsage: previewSalesUsageUpload,
    verifyGoodsReceipt: previewGoodsReceiptUpload,
    verifyGoodsDelivery: previewGoodsDeliveryUpload,
    verifyStockPosition: previewStockPositionUpload,
    saveConversions: saveStockUnitConversions,
    getConversions: getStockUnitConversions,
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
    if (token) CacheService.getScriptCache().remove(sessionKey_(token));
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
    const sheet = ensureTaskSheet_();
    sheet.appendRow([
      Utilities.getUuid(), title, cleanText_(payload.description, 500), type, target,
      frequency, cleanAudience_(payload.audience), cleanText_(payload.dueLabel, 80),
      true, new Date(), employee.nik, icon
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
    const taskCompleted = stockTask
      ? Boolean(readCompletionMap_(outlet)[stockTask.id + '|' + currentPeriodKey_('DAILY')])
      : false;
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
      taskCompleted: taskCompleted,
      uploadProgress: readStockUploadProgress_(outlet),
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
    const stockTask = readTasksForEmployee_(employee).filter(function (task) {
      return task.type === 'FORM' && task.target === 'StockCard' && task.frequency === 'DAILY';
    })[0] || null;
    const taskCompleted = stockTask
      ? Boolean(readCompletionMap_(outlet)[stockTask.id + '|' + currentPeriodKey_('DAILY')])
      : false;
    return {
      outlet: outlet, location: location, locations: locations, items: readStockItemsWithQty_(outlet, location),
      taskCompleted: taskCompleted, uploadProgress: readStockUploadProgress_(outlet), supplementaryPending: true
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
      uploadProgress: readStockUploadProgress_(outlet),
      pendingTransfers: readPendingStockTransfers_(outlet)
    };
  });
}

// ---------- Showcase Log daily form ----------

function getShowcaseLogBootstrap(token, requestedOutlet, requestedDate) {
  return safe_(function () {
    const session = requireSession_(token);
    const employee = findEmployee_(session.nik);
    assertEmployeeActive_(employee);
    ensureStockCardInfrastructure_();
    const outlets = employee.outlet === 'BIHQ' ? readActiveOutlets_() : [employee.outlet];
    const outlet = resolveStockOutlet_(employee, requestedOutlet, outlets);
    const eventDate = normalizeDate_(requestedDate, true);
    if (eventDate > todayIso_()) throw new Error('Tanggal Showcase Log tidak boleh melebihi hari ini.');
    const totals = readShowcaseLogTotals_(outlet, eventDate);
    const items = readStockItemsWithQty_(outlet, 'Showcase').map(function (item) {
      const day = totals[item.name.toLowerCase()] || {};
      return {
        code: item.code, category: item.category, name: item.name, unit: item.unit, balance: Number(item.qty || 0),
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
      tasks: tasks, completions: completions,
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
    const entries = rawEntries.map(function (raw) {
      const item = itemMap[String(raw.itemCode || '').trim().toUpperCase()];
      if (!item) throw new Error('Item Showcase tidak ditemukan atau kode item sudah berubah. Muat ulang halaman.');
      const hasInInput = Boolean(raw.hasInInput), hasSoldInput = Boolean(raw.hasSoldInput), hasWasteInput = Boolean(raw.hasWasteInput);
      const values = [raw.inQty, raw.soldQty, raw.wasteQty].map(function (value) {
        if (value === '' || value === null || value === undefined) return 0;
        const qty = Number(value);
        if (!isFinite(qty) || qty < 0) throw new Error(item.name + ': QTY wajib berupa angka 0 atau lebih.');
        return Math.round(qty * 1000000) / 1000000;
      });
      return {
        item: item, inQty: hasInInput ? values[0] : 0, soldQty: hasSoldInput ? values[1] : 0, wasteQty: hasWasteInput ? values[2] : 0,
        hasInInput: hasInInput, hasSoldInput: hasSoldInput, hasWasteInput: hasWasteInput
      };
    }).filter(function (entry) { return entry.hasInInput || entry.hasSoldInput || entry.hasWasteInput; });
    if (!entries.length) throw new Error('Isi minimal satu kolom In, Sold, atau Waste sebelum menyimpan.');

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const productNeeds = {}, mappings = {};
      entries.forEach(function (entry) {
        const current = getCurrentStock_(outlet, 'Showcase', entry.item.code, entry.item.name).qty;
        if (entry.soldQty + entry.wasteQty > current + entry.inQty + 0.0000001) {
          throw new Error(entry.item.name + ': total Sold dan Waste melebihi Balance setelah In.');
        }
        if (!entry.inQty) return;
        const mapping = resolveShowcaseProductMapping_(entry.item);
        mappings[entry.item.code] = mapping;
        if (!productNeeds[mapping.product.code]) productNeeds[mapping.product.code] = { product: mapping.product, qty: 0 };
        productNeeds[mapping.product.code].qty += entry.inQty * mapping.productPerMenu;
      });
      const productPools = {};
      Object.keys(productNeeds).forEach(function (code) {
        const need = productNeeds[code], required = Math.round(need.qty * 1000000) / 1000000;
        const available = getCurrentStock_(outlet, 'Store', need.product.code, need.product.name).qty;
        if (required > available + 0.0000001) {
          throw new Error(need.product.name + ': stok Store tidak mencukupi. Dibutuhkan ' + formatQty_(required) + ' ' + need.product.unit + ', tersedia ' + formatQty_(available) + '.');
        }
        productPools[code] = allocateTransferLots_(outlet, 'Store', need.product, required).map(function (lot) {
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
            const storeInfo = 'Transfer To Showcase · Dari Store · Untuk ' + entry.item.name + ' ' + formatQty_(entry.inQty) + ' ' + entry.item.unit;
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
        [['soldQty', 'Terjual'], ['wasteQty', 'Waste']].forEach(function (definition) {
          const qty = Number(entry[definition[0]] || 0);
          if (qty <= 0) return;
          const movement = stockTransferMovementRow_(Utilities.getUuid(), outlet, 'Showcase', entry.item, 'OUT', qty, definition[1], '', '', employee, now, eventDate);
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
  let factor = 1;
  if (fromUnit !== toUnit) {
    const saved = readStockUnitConversions_()[stockConversionKey_(product.code, fromUnit, toUnit)];
    factor = saved ? Number(saved.factor) : 0;
    if (!isFinite(factor) || factor <= 0) {
      throw new Error(showcaseItem.name + ': konversi ' + showcaseItem.productUnit + ' ke ' + product.unit + ' untuk Product ' + product.name + ' belum tersedia.');
    }
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
  const sql = latestStockMovementCte_() + ' SELECT item_name, direction, movement_type, created_by, source_file, SUM(qty) AS total_qty ' +
    'FROM latest WHERE outlet = @outlet AND location = \'Showcase\' AND event_date = CAST(@eventDate AS DATE) ' +
    'AND ((direction = \'IN\' AND movement_type = \'Transfer In\') OR (direction = \'OUT\' AND movement_type IN (\'Terjual\', \'Waste\'))) ' +
    'GROUP BY item_name, direction, movement_type, created_by, source_file';
  const map = {};
  const employeeNames = readEmployeeNameMap_();
  runNamedQuery_(sql, { outlet: outlet, eventDate: eventDate }, { useQueryCache: false }).forEach(function (row) {
    const key = String(row.item_name || '').trim().toLowerCase();
    if (!map[key]) map[key] = { totalIn: 0, totalSold: 0, totalWaste: 0, inActors: {}, soldActors: {}, wasteActors: {} };
    const item = map[key], qty = Number(row.total_qty || 0), nik = String(row.created_by || ''), name = employeeNames[nik] || 'User tidak diketahui';
    const sourceFile = String(row.source_file || ''), actor = name + ' | ' + (sourceFile && sourceFile !== 'SHOWCASE_LOG' ? 'Generated By Upload' : 'Manual Input');
    if (row.direction === 'IN' && row.movement_type === 'Transfer In') { item.totalIn += qty; item.inActors[actor] = true; }
    if (row.direction === 'OUT' && row.movement_type === 'Terjual') { item.totalSold += qty; item.soldActors[actor] = true; }
    if (row.direction === 'OUT' && row.movement_type === 'Waste') { item.totalWaste += qty; item.wasteActors[actor] = true; }
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
    'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
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

function findShowcaseLogTask_() {
  const sheet = ensureTaskSheet_();
  if (sheet.getLastRow() < 2) return null;
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues().map(taskFromRow_).filter(function (task) {
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
    'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
    'WHERE record_type IN (\'MOVEMENT\', \'IMPORT\') AND outlet = @outlet ' +
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

function markStockTaskCompleteFromUploads_(context, periodKey, completedType) {
  try {
    if (['Goods Receipt', 'Terjual'].indexOf(completedType) < 0) return false;
    const otherType = completedType === 'Goods Receipt' ? 'Terjual' : 'Goods Receipt';
    const sql = 'SELECT COUNT(*) AS total FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
      'WHERE record_type IN (\'MOVEMENT\', \'IMPORT\') AND outlet = @outlet AND event_date = CAST(@periodKey AS DATE) ' +
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
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
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
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const lines = validateTransferLines_(fromOutlet, fromLocation, payload.items);
      const transferId = Utilities.getUuid(), now = new Date(), eventDate = todayIso_(), stockRows = [], pendingRows = [];
      const transferNo = stockTransferReceiptNumber_({ transferId: transferId, createdAt: now.toISOString() });
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
            created_by: employee.nik, created_by_name: employee.name, created_at: now.getTime() / 1000
          }});
        });
      });
      insertStockCardRows_(stockRows);
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

function acceptInterOutletStockTransfer(token, transferId, requestedOutlet, receiveLocation, receivedItems) {
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
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const transfers = readPendingStockTransfers_(outlet).filter(function (transfer) { return transfer.transferId === transferId; });
      if (!transfers.length) throw new Error('Transfer sudah diproses atau tidak ditemukan untuk outlet ini.');
      const transfer = transfers[0], now = new Date(), eventDate = todayIso_();
      const receivedMap = {};
      (Array.isArray(receivedItems) ? receivedItems : []).forEach(function (line) {
        const lineId = cleanText_(line.lineId, 100), qty = Number(line.qty);
        if (!lineId || !isFinite(qty) || qty < 0) throw new Error('QTY diterima wajib berupa angka 0 atau lebih.');
        receivedMap[lineId] = qty;
      });
      const receiptNo = stockTransferReceiptNumber_(transfer), stockRows = [], acceptedRows = [];
      transfer.items.forEach(function (line) {
        const receivedQty = Object.prototype.hasOwnProperty.call(receivedMap, line.lineId) ? receivedMap[line.lineId] : Number(line.qty || 0);
        const item = { code: line.code, category: line.category, name: line.name, unit: line.unit };
        if (receivedQty > 0.0000001) {
          stockRows.push(stockTransferMovementRow_(transferId, outlet, receiveLocation, item, 'IN', receivedQty, 'Transfer In',
            'Transfer From ' + transfer.fromOutlet + ' / ' + transfer.fromLocation + ' · Ke ' + outlet + ' / ' + receiveLocation +
            ' · No Transfer ' + receiptNo + ' · QTY dikirim ' + formatQty_(line.qty) +
            (line.note ? ' · ' + line.note : ''), line.expiryDate, employee, now, eventDate, line.productionDate));
        }
        const eventId = Utilities.getUuid();
        acceptedRows.push({ insertId: eventId, json: {
          event_id: eventId, transfer_id: transferId, status: 'ACCEPTED', from_outlet: transfer.fromOutlet, from_location: transfer.fromLocation,
          to_outlet: outlet, to_location: receiveLocation, item_code: line.code, category: line.category, item_name: line.name,
          unit: line.unit, qty: Number(line.qty || 0), received_qty: receivedQty, note: line.note || '', expiry_date: line.expiryDate || null,
          created_by: transfer.createdBy, created_by_name: transfer.createdByName, created_at: now.getTime() / 1000,
          accepted_by: employee.nik, accepted_by_name: employee.name, accepted_at: now.getTime() / 1000, receipt_no: receiptNo
        }});
      });
      if (stockRows.length) insertStockCardRows_(stockRows);
      insertAll_('stock_transfers', acceptedRows);
      transfer.status = 'ACCEPTED';
      transfer.toLocation = receiveLocation;
      transfer.acceptedBy = employee.nik;
      transfer.acceptedByName = employee.name;
      transfer.acceptedAt = now.toISOString();
      transfer.receiptNo = receiptNo;
      transfer.items.forEach(function (line) { line.receivedQty = Object.prototype.hasOwnProperty.call(receivedMap, line.lineId) ? receivedMap[line.lineId] : Number(line.qty || 0); });
      return { accepted: true, transferId: transferId, itemCount: transfer.items.length, location: receiveLocation, receipt: transfer };
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
    if (!isFinite(qty) || qty <= 0) throw new Error('QTY harus lebih besar dari 0.');
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
    const info = ensureTransferMovementInfo_(direction, movementType, payload.info);
    if (movementType === 'Others' && !info) throw new Error('Catatan wajib diisi ketika Jenis Transaksi Others dipilih.');
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
      movement: { recordId: recordId, logicalId: logicalId, version: 1, date: eventDate, direction: direction, qty: qty, movementType: movementType, info: info, productionDate: productionDate, expiryDate: expiryDate, createdBy: employee.nik, createdByUser: employee.name + ' · ' + employee.nik, createdAt: now.toISOString() }
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

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
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
      insertStockCardRows_([{ insertId: recordId, json: {
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
        negativeItemCount: prepared.negativeItemCount, conversionCount: prepared.conversionCount
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
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const prepared = prepareStockPositionImport_(context, payload, false);
      if (!prepared.items.length) throw new Error('QTY Stock Actual sama dengan saldo terbaru. Tidak ada Stock Adjustment yang perlu dicatat.');
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
  const sql = 'SELECT COUNT(*) AS total FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
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
  const showcaseProducts = showcaseProductNameMap_();
  let showcaseRowsSkipped = 0;
  report.rows.forEach(function (row) {
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
    showcaseRowsSkipped: showcaseRowsSkipped, sourceItemCount: report.rows.length, newItemCount: Object.keys(masterChangeMap).length
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
  if (!items.length && !showcaseRowsSkipped) throw new Error('Tidak ada QTY penjualan lebih dari 0 pada file ini.');
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
    const qty = parseGoodsReceiptNumber_(cells['P' + rowNumber]);
    if (!isFinite(qty) || qty < 0) { invalidQty.push(code + ' baris ' + rowNumber); return; }
    if (qty <= 0.0000001) return;
    // ESB can omit repeated Destination values on following rows. G12 remains
    // the authoritative destination and is used only when a later G cell is blank.
    const outletName = cleanText_(cells['G' + rowNumber], 160) || primaryOutletName;
    if (!outletName) throw new Error('Destination pada G12 tidak dapat dibaca. Download ulang report langsung dari ESB tanpa menyimpan ulang file.');
    outlets[normalizeStoreName_(outletName)] = outletName;
    const transactionDate = parseGoodsReceiptDate_(cells['B' + rowNumber], rowNumber);
    const grNumber = cleanText_(cells['A' + rowNumber], 100), supplier = cleanText_(cells['E' + rowNumber], 180);
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
  if (!rows.length) throw new Error('Tidak ada baris Goods Receipt dengan QTY lebih dari 0. Data harus dimulai pada baris 12.');
  return {
    outletName: outlets[outletKeys[0]], rows: rows, transactionDates: Object.keys(dates),
    receiptCount: Object.keys(receipts).length, supplierCount: Object.keys(suppliers).length
  };
}

/**
 * Reads a Goods Receipt report by column names instead of fixed row numbers.
 * ESB metadata may grow or move; only the table header names are authoritative.
 */
function parseGoodsReceiptReport_(base64, fileName) {
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
    const qty = parseReportNumber_(reportCell_(cells, header, 'QTY', rowNumber));
    if (!isFinite(qty) || qty < 0) {
      invalidQty.push(code + ' · baris ' + rowNumber);
      return;
    }
    if (qty <= 0.0000001) return;
    const destination = cleanText_(reportCell_(cells, header, 'DESTINATION', rowNumber), 160) || lastDestination;
    if (!destination) throw new Error('Destination tidak ditemukan pada baris ' + rowNumber + '.');
    lastDestination = destination;
    const supplier = cleanText_(reportCell_(cells, header, 'ORIGIN', rowNumber), 180) || lastSupplier;
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
  if (outletKeys.length !== 1) throw new Error('Goods Receipt harus berisi tepat satu Destination. Ditemukan: ' +
    outletKeys.map(function (key) { return outlets[key]; }).join(', ') + '.');
  if (!rows.length) throw new Error('Tidak ada baris Goods Receipt dengan QTY lebih dari 0 setelah header baris ' + header.row + '.');
  return {
    outletName: outlets[outletKeys[0]], rows: rows, transactionDates: Object.keys(dates),
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
  return { byName: byName, byCode: byCode };
}

function salesUsageAlreadyImported_(outlet, transactionDate, sourceHash) {
  const sql = 'SELECT COUNT(*) AS total FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
    'WHERE record_type IN (\'MOVEMENT\', \'IMPORT\') AND outlet = @outlet AND movement_type = \'Terjual\' AND source_file IS NOT NULL ' +
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
    const grouped = addBalancesToGroupedHistory_(groupStockHistoryByDate_(history), current.qty).filter(function (day) { return String(day.date).slice(0, 7) === month; });
    const rows = grouped.map(function (day) {
      return [day.date, day.inQty || '', stockMovementInfo_(day.inMovements), day.outQty || '', stockMovementInfo_(day.outMovements), day.balance, fifoDetailText_(reconcileFifoLots_(fifoSnapshots[day.date] || [], day.balance), item.unit, context.location)];
    });
    const detailHeader = 'Prd · Stock In · Arrival · Exp';
    return buildStockExport_('Stock Card · ' + item.code + ' · ' + item.name, context.outlet, context.location, month, ['Tanggal', 'IN', 'Info IN', 'OUT', 'Info OUT', 'Balance', detailHeader], rows, format);
  });
}

function ensureStockCardInfrastructure_() {
  const infrastructureCache = CacheService.getScriptCache();
  if (infrastructureCache.get('stock-card-infrastructure-v11') === 'ready') return;
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
  ensureBigQueryFields_('stock_card', [
    bqField_('item_code', 'STRING'), bqField_('logical_id', 'STRING'), bqField_('version', 'INTEGER'),
    bqField_('source_file', 'STRING'), bqField_('source_hash', 'STRING'), bqField_('source_row', 'INTEGER'),
    bqField_('supplier', 'STRING'), bqField_('transfer_id', 'STRING'),
    bqField_('source_arrival_date', 'DATE'), bqField_('production_date', 'DATE')
  ]);
  ensureBigQueryTable_('stock_balances', [
    bqField_('outlet', 'STRING', 'REQUIRED'), bqField_('location', 'STRING', 'REQUIRED'),
    bqField_('item_code', 'STRING'), bqField_('item_name', 'STRING'),
    bqField_('current_qty', 'FLOAT', 'REQUIRED'), bqField_('updated_at', 'TIMESTAMP', 'REQUIRED')
  ]);
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
    bqField_('rejected_by', 'STRING'), bqField_('rejected_by_name', 'STRING'), bqField_('rejected_at', 'TIMESTAMP'),
    bqField_('rejection_reason', 'STRING'), bqField_('receipt_no', 'STRING')
  ]);
  infrastructureCache.put('stock-card-infrastructure-v11', 'ready', 21600);
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
  let remaining = qty;
  const allocated = [];
  lots.forEach(function (lot) {
    if (remaining <= 0.0000001) return;
    const taken = Math.min(lot.qty, remaining);
    if (taken > 0.0000001) allocated.push({ qty: taken, productionDate: lot.productionDate, expiryDate: lot.expiryDate, sourceDate: lot.sourceDate });
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
  const sql = 'SELECT p.event_id, p.transfer_id, p.from_outlet, p.from_location, p.to_outlet, p.to_location, p.item_code, p.category, p.item_name, p.unit, p.qty, p.note, p.expiry_date, p.created_by, p.created_by_name, p.created_at ' +
    'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_transfers` p WHERE p.status = \'PENDING\' AND p.to_outlet = @outlet ' +
    'AND NOT EXISTS (SELECT 1 FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_transfers` a WHERE a.transfer_id = p.transfer_id AND a.status IN (\'ACCEPTED\', \'REJECTED\')) ORDER BY p.created_at DESC, p.item_name, p.expiry_date';
  const grouped = {};
  runNamedQuery_(sql, { outlet: outlet }).forEach(function (row) {
    const id = String(row.transfer_id || '');
    if (!grouped[id]) grouped[id] = {
      transferId: id, status: 'PENDING', fromOutlet: String(row.from_outlet || ''), fromLocation: String(row.from_location || ''),
      toOutlet: String(row.to_outlet || ''), toLocation: String(row.to_location || ''), createdBy: String(row.created_by || ''),
      createdByName: String(row.created_by_name || row.created_by || ''), createdAt: String(row.created_at || ''), items: []
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
    const tasks = taskSheet.getLastRow() < 2 ? [] : taskSheet.getRange(2, 1, taskSheet.getLastRow() - 1, 12).getValues()
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
      CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
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
  const sql = 'SELECT COUNT(*) AS total FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
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
      newItemCount: prepared.newItemCount, conversionCount: prepared.conversionCount
    };
  });
}

/** Imports a verified Goods Receipt report as append-only stock IN movements. */
function uploadGoodsReceipt(token, payload) {
  return safe_(function () {
    payload = payload || {};
    const context = resolveStockContext_(token, payload.outlet, payload.location);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const prepared = prepareGoodsReceiptImport_(context, payload, false);
      if (prepared.requiresDuplicateDecision) throw new Error('Ditemukan baris duplikat. Pilih Batal Upload, Tetap Upload Duplikat, atau Skip Duplikat.');
      if (!prepared.items.length) throw new Error('Semua baris pada file ini sudah pernah dicatat atau dipilih untuk dilewati. Tidak ada Stock Masuk baru yang di-upload.');
      appendOrActivateStockMasterItems_(prepared.masterChanges);
      const now = new Date();
      const rows = prepared.items.map(function (receipt) {
        const logicalId = Utilities.getUuid(), recordId = Utilities.getUuid();
        const conversionInfo = receipt.converted ? ' · Konversi ' + formatQty_(receipt.originalQty) + ' ' + receipt.originalUnit + ' = ' + formatQty_(receipt.qty) + ' ' + receipt.item.unit : '';
        return { insertId: recordId, json: {
          record_id: recordId, logical_id: logicalId, version: 1, record_type: 'MOVEMENT',
          outlet: context.outlet, location: context.location, item_code: receipt.item.code,
          category: receipt.item.category, item_name: receipt.item.name, unit: receipt.item.unit,
          direction: 'IN', qty: receipt.qty, movement_type: 'Goods Receipt',
          supplier: cleanText_(receipt.supplier || '-', 180),
          info: cleanText_('Supplier ' + (receipt.supplier || '-') + ' · PO ' + (receipt.poNumber || '-') + ' · GR ' + (receipt.grNumber || '-') +
            ' · ' + prepared.fileName + ' · Baris ' + receipt.sourceRow + conversionInfo, 500),
          expiry_date: receipt.expiryDate || null, event_date: receipt.transactionDate,
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
        conversionCount: prepared.conversionCount
      };
    } finally {
      lock.releaseLock();
    }
  });
}

function prepareGoodsReceiptImport_(context, payload, allowPendingConversions) {
  const fileName = cleanText_(payload.fileName, 180);
  const base64 = String(payload.base64 || '').replace(/^data:[^,]+,/, '').trim();
  const report = parseGoodsReceiptReport_(base64, fileName);
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
      if (!conversionMap[key]) {
        conversionMap[key] = { key: key, itemCode: row.code, itemName: row.name || item.name, fromUnit: row.unit || '-', toUnit: item.unit || '-' };
        conversionRequests.push(conversionMap[key]);
      }
      factor = Number(providedConversions[key]);
      if ((!isFinite(factor) || factor <= 0) && savedConversions[key]) factor = Number(savedConversions[key].factor);
      if (!isFinite(factor) || factor <= 0) factor = 0;
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
  return baseResult;
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
    'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
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
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const prepared = prepareGoodsDeliveryImport_(context, payload, false);
      if (prepared.requiresDuplicateDecision) throw new Error('Ditemukan baris duplikat. Pilih Batal Upload, Tetap Upload Duplikat, atau Skip Duplikat.');
      if (!prepared.items.length) throw new Error('Semua baris sudah pernah dicatat atau dipilih untuk dilewati. Tidak ada Transfer Out baru yang di-upload.');
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
            created_by: context.employee.nik, created_by_name: context.employee.name, created_at: now.getTime() / 1000
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

function prepareGoodsDeliveryImport_(context, payload, allowPendingConversions) {
  const fileName = cleanText_(payload.fileName, 180);
  const base64 = String(payload.base64 || '').replace(/^data:[^,]+,/, '').trim();
  const report = parseGoodsDeliveryReport_(base64, fileName);
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
      if (!conversionMap[key]) {
        conversionMap[key] = { key: key, itemCode: row.code, itemName: row.name || item.name, fromUnit: row.unit || '-', toUnit: item.unit || '-' };
        conversionRequests.push(conversionMap[key]);
      }
      factor = Number(providedConversions[key]);
      if ((!isFinite(factor) || factor <= 0) && savedConversions[key]) factor = Number(savedConversions[key].factor);
      if (!isFinite(factor) || factor <= 0) factor = 0;
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
function parseGoodsDeliveryReport_(base64, fileName) {
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
  if (originKeys.length !== 1) throw new Error('Goods Delivery harus berisi tepat satu Origin. Ditemukan: ' +
    originKeys.map(function (key) { return origins[key]; }).join(', ') + '.');
  if (!rows.length) throw new Error('Tidak ada baris Goods Delivery dengan QTY lebih dari 0 setelah header baris ' + header.row + '.');
  return {
    outletName: origins[originKeys[0]], rows: rows, transactionDates: Object.keys(dates),
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
    'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
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
  return 'event_id, transfer_id, status, from_outlet, from_location, to_outlet, to_location, item_code, category, item_name, unit, qty, received_qty, note, expiry_date, created_by, created_by_name, created_at, accepted_by, accepted_by_name, accepted_at, rejected_by, rejected_by_name, rejected_at, rejection_reason, receipt_no';
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
    createdAt: String(first.created_at || ''), receiptNo: '', items: []
  };
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
    transfer.receiptNo = String(accepted[0].receipt_no || '');
    const receivedQueues = {};
    accepted.forEach(function (row) {
      const key = stockTransferLineKey_(row.item_code, row.expiry_date);
      if (!receivedQueues[key]) receivedQueues[key] = [];
      receivedQueues[key].push(Number(row.received_qty === null || row.received_qty === undefined ? row.qty : row.received_qty));
    });
    transfer.items.forEach(function (item) {
      const queue = receivedQueues[stockTransferLineKey_(item.code, item.expiryDate)] || [];
      item.receivedQty = queue.length ? queue.shift() : Number(item.qty || 0);
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
  else if (/^\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const numeric = Number(value);
    date = new Date(numeric < 100000000000 ? numeric * 1000 : numeric);
  } else date = new Date(value);
  if (isNaN(date.getTime())) return String(value).slice(0, 19);
  return Utilities.formatDate(date, 'Asia/Jakarta', withTime ? 'dd MMM yyyy, HH:mm' : 'dd MMM yyyy');
}

function bakerzinReceiptLogo_() {
  return '<svg class="brand-logo" viewBox="0 0 410 92" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bakerzin">' +
    '<text x="4" y="68" font-family="Arial Narrow,Arial,sans-serif" font-size="62" font-weight="300" letter-spacing="5" fill="#211b1d">BAKERZIN</text>' +
    '<path d="M315 37c10-25 25-30 39-33-1 19-8 34-34 43z" fill="#a37a48"/>' +
    '<text x="374" y="24" font-family="Arial,sans-serif" font-size="11" fill="#211b1d">TM</text></svg>';
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
      '<td>' + receiptHtmlEscape_(item.expiryDate ? transferReceiptDate_(item.expiryDate, false) : 'Tidak dicatat') + '</td><td>' + receiptHtmlEscape_(item.note || '-') + '</td></tr>';
  }).join('');
  const receiverName = status === 'ACCEPTED' ? (transfer.acceptedByName || transfer.acceptedBy || '-') : status === 'REJECTED' ? (transfer.rejectedByName || transfer.rejectedBy || '-') : 'Belum dikonfirmasi';
  const processedAt = status === 'ACCEPTED' ? transfer.acceptedAt : status === 'REJECTED' ? transfer.rejectedAt : '';
  const rejection = status === 'REJECTED' ? '<div class="reason"><b>ALASAN PENOLAKAN</b><br>' + receiptHtmlEscape_(transfer.rejectionReason || '-') + '</div>' : '';
  const senderStamp = status === 'ACCEPTED' ? '<div class="party-stamp">WELL RECEIVED BY<small>' +
    receiptHtmlEscape_(transfer.createdByName || transfer.createdBy || 'Pengirim') + '</small></div>' : '';
  const receiverStamp = status === 'ACCEPTED' ? '<div class="party-stamp">WELL RECEIVED BY<small>' +
    receiptHtmlEscape_(receiverName) + '</small></div>' : '';
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#292326;font-size:9px;margin:0}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #9f172b;padding-bottom:14px}.logo{width:205px}.brand-logo{display:block;width:205px;height:auto}.doc-title{text-align:right}.doc-title h1{font-size:18px;margin:0 0 5px}.doc-title b{color:#9f172b}.stamp{margin:16px 0;padding:12px 16px;border:2px solid #b21f35;color:#b21f35;background:#fff2f4;text-align:center;font-weight:800;font-size:15px;letter-spacing:2px}.stamp.accepted{border-color:#247a4a;color:#247a4a;background:#effaf3}.stamp small{display:block;margin-top:5px;font-size:8px;letter-spacing:0;font-weight:600}.meta-grid{display:table;width:100%;table-layout:fixed;margin:14px 0}.meta{display:table-cell;width:50%;border:1px solid #e1dadd;padding:11px;vertical-align:top}.meta:first-child{border-right:0}.label{font-size:7px;color:#8a777d;font-weight:800;letter-spacing:1px}.meta h3{margin:5px 0 7px;font-size:13px}.meta p{margin:3px 0;line-height:1.4}.party-stamp{display:inline-block;margin-top:10px;padding:7px 11px;border:2px solid #247a4a;border-radius:5px;color:#247a4a;background:#effaf3;font-size:10px;font-weight:800;letter-spacing:1px;transform:rotate(-2deg)}.party-stamp small{display:block;margin-top:4px;font-size:7px;font-weight:600;letter-spacing:0}.summary{display:table;width:100%;margin:0 0 14px;background:#f7f3f4}.summary div{display:table-cell;padding:9px 11px}.summary b{display:block;font-size:12px;margin-top:3px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{background:#8d1b2e;color:#fff;font-size:7px;letter-spacing:.5px;padding:8px 5px;text-align:left}td{border-bottom:1px solid #e7e0e2;padding:8px 5px;vertical-align:top;line-height:1.35}td span{color:#655a5e}.num{text-align:right}.variance{color:#b21f35;font-weight:800}.reason{margin-top:14px;padding:11px;border-left:4px solid #b21f35;background:#fff2f4;line-height:1.5}.declaration{margin:16px 0;color:#5d5357;line-height:1.55}.footer{margin-top:22px;border-top:1px solid #d8cfd2;padding-top:8px;color:#88787e;font-size:7px;display:flex;justify-content:space-between}</style></head><body>' +
    '<div class="header"><div class="logo">' + bakerzinReceiptLogo_() + '</div><div class="doc-title"><h1>E-TRANSFER GOODS</h1><b>' + receiptHtmlEscape_(receiptNo) + '</b><div>Transfer ID: ' + receiptHtmlEscape_(transfer.transferId) + '</div></div></div>' +
    '<div class="stamp ' + statusClass + '">' + statusTitle + '<small>' + statusDescription + '</small></div>' +
    '<div class="meta-grid"><div class="meta"><span class="label">PENGIRIM</span><h3>' + receiptHtmlEscape_(transfer.fromOutlet) + '</h3><p>Lokasi: ' + receiptHtmlEscape_(transfer.fromLocation || '-') + '</p><p>Nama: ' + receiptHtmlEscape_(transfer.createdByName || '-') + '</p><p>NIK: ' + receiptHtmlEscape_(transfer.createdBy || '-') + '</p><p>Dikirim: ' + receiptHtmlEscape_(transferReceiptDate_(transfer.createdAt, true)) + '</p>' + senderStamp + '</div>' +
    '<div class="meta"><span class="label">PENERIMA</span><h3>' + receiptHtmlEscape_(transfer.toOutlet) + '</h3><p>Lokasi: ' + receiptHtmlEscape_(transfer.toLocation || 'Belum dipilih') + '</p><p>Nama: ' + receiptHtmlEscape_(receiverName) + '</p><p>NIK: ' + receiptHtmlEscape_(status === 'ACCEPTED' ? transfer.acceptedBy : status === 'REJECTED' ? transfer.rejectedBy : '-') + '</p><p>Diproses: ' + receiptHtmlEscape_(processedAt ? transferReceiptDate_(processedAt, true) : 'Belum diproses') + '</p>' + receiverStamp + '</div></div>' +
    '<div class="summary"><div><span class="label">JUMLAH BARIS</span><b>' + transfer.items.length + '</b></div><div><span class="label">TOTAL QTY DIKIRIM</span><b>' + formatQty_(sentTotal) + '</b></div><div><span class="label">TOTAL QTY DITERIMA</span><b>' + (status === 'ACCEPTED' ? formatQty_(receivedTotal) : '-') + '</b></div></div>' +
    '<table><thead><tr><th style="width:4%">NO</th><th style="width:23%">ITEM</th><th style="width:8%">UNIT</th><th style="width:10%">DIKIRIM</th><th style="width:10%">DITERIMA</th><th style="width:9%">SELISIH</th><th style="width:15%">EXPIRY</th><th style="width:21%">CATATAN</th></tr></thead><tbody>' + rows + '</tbody></table>' + rejection +
    '<div class="declaration">Dokumen elektronik ini merupakan bukti operasional internal Bakerzin. Identitas pengguna, tanggal, jam, nomor dokumen, serta rincian kuantitas tersimpan sebagai jejak audit. Dokumen ini tidak memerlukan tanda tangan manual.</div>' +
    '<div class="footer"><span>BAKERZIN - Stock Transfer Control</span><span>Dibuat: ' + receiptHtmlEscape_(transferReceiptDate_(new Date(), true)) + '</span></div></body></html>';
  const blob = HtmlService.createHtmlOutput(html).getBlob().getAs(MimeType.PDF);
  return blob.setName(cleanExportName_('Tanda_Terima_' + receiptNo) + '.pdf');
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
    const rows = showcaseSeedRows_().map(function (row) { return row.concat(showcaseItemCode_(row[0])); });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sheet.getRange(2, 8, rows.length, 1).setNumberFormat('0.0000');
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

function showcaseItemCode_(menuName) {
  return 'SC-' + digest_(normalizeStoreName_(menuName)).slice(0, 10).toUpperCase();
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
    return {
      code: code, category: cleanText_(row[2], 100) || cleanText_(row[1], 100) || 'SHOWCASE',
      name: name, unit: 'PCS', active: true, showcase: true, sourceRow: index + 2,
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

function saveShowcaseInboundMovement_(outlet, showcaseItem, menuQty, payload, employee) {
  const product = findStockMasterItem_(showcaseItem.productName);
  const fromUnit = normalizeUnit_(showcaseItem.productUnit);
  const toUnit = normalizeUnit_(product.unit);
  let factor = 1;
  if (fromUnit !== toUnit) {
    const conversionKey = stockConversionKey_(product.code, fromUnit, toUnit);
    const saved = readStockUnitConversions_()[conversionKey];
    factor = saved ? Number(saved.factor) : 0;
    if (!isFinite(factor) || factor <= 0) {
      throw new Error(showcaseItem.name + ': unit Product pada ' + CONFIG.SHOWCASE_SHEET + ' (' + showcaseItem.productUnit +
        ') berbeda dari unit Master Stock ' + product.code + ' (' + product.unit + '). Tambahkan konversi unit terlebih dahulu.');
    }
  }
  const productQty = Math.round(Number(menuQty) * Number(showcaseItem.productQty) * factor * 1000000) / 1000000;
  if (!isFinite(productQty) || productQty <= 0) throw new Error('QTY Product Showcase tidak valid pada baris ' + showcaseItem.sourceRow + '.');
  const eventDate = normalizeDate_(payload.eventDate, true);
  const productionDate = normalizeDate_(payload.productionDate, false);
  const note = cleanText_(payload.info, 220);
  const transferId = Utilities.getUuid();
  const now = new Date();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const available = getCurrentStock_(outlet, 'Store', product.code, product.name).qty;
    if (productQty > available + 0.0000001) {
      throw new Error('Stok Store tidak mencukupi untuk ' + showcaseItem.name + '. Dibutuhkan ' + formatQty_(productQty) + ' ' + product.unit +
        ' ' + product.name + ', tersedia ' + formatQty_(available) + ' ' + product.unit + '.');
    }
    const showcaseCurrent = getCurrentStock_(outlet, 'Showcase', showcaseItem.code, showcaseItem.name).qty;
    const detail = showcaseItem.name + ' ' + formatQty_(menuQty) + ' PCS · Product ' + product.name + ' ' + formatQty_(productQty) + ' ' + product.unit;
    const rows = [], showcaseRows = [];
    const productPerMenu = Number(showcaseItem.productQty) * factor;
    const allocatedLots = allocateTransferLots_(outlet, 'Store', product, productQty);
    let assignedMenuQty = 0;
    allocatedLots.forEach(function (lot, lotIndex) {
      rows.push(stockTransferMovementRow_(transferId, outlet, 'Store', product, 'OUT', lot.qty, 'Transfer Out',
        'Transfer To Showcase · Dari Store · ' + detail + (note ? ' · ' + note : ''), lot.expiryDate, employee, now, eventDate, lot.productionDate));
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
    updates[stockBalanceStateKey_('dirty', row.outlet, row.location)] = timestamp;
  });
  if (Object.keys(updates).length) properties.setProperties(updates, false);
}

function insertStockCardRows_(rows) {
  markStockBalanceDirty_(rows);
  insertAll_('stock_card', rows);
  // Refresh the marker after a successful insert so a concurrent rebuild cannot clear it too early.
  markStockBalanceDirty_(rows);
  invalidateFastStockHistoryRows_(rows);
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
}

function readStockBalanceRows_(outlet, location) {
  const properties = PropertiesService.getScriptProperties();
  const readyKey = stockBalanceStateKey_('ready', outlet, location);
  const dirtyKey = stockBalanceStateKey_('dirty', outlet, location);
  let ready = properties.getProperty(readyKey) === '1';
  let dirtyToken = String(properties.getProperty(dirtyKey) || '');

  try {
    // BigQuery streaming inserts may need a moment before they are query-visible.
    if (dirtyToken && Date.now() - Number(dirtyToken.split('-')[0]) < 3000) {
      return readStockLedgerBalanceRows_(outlet, location);
    }
    if (!ready || dirtyToken) {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) return readStockLedgerBalanceRows_(outlet, location);
      try {
        // Another request may have completed the rebuild while this request waited.
        ready = properties.getProperty(readyKey) === '1';
        dirtyToken = String(properties.getProperty(dirtyKey) || '');
        if (dirtyToken && Date.now() - Number(dirtyToken.split('-')[0]) < 3000) {
          return readStockLedgerBalanceRows_(outlet, location);
        }
        if (!ready || dirtyToken) rebuildStockBalanceSummary_(outlet, location, dirtyToken);
      } finally {
        lock.releaseLock();
      }
    }
    // A transaction written during the rebuild leaves a newer dirty token behind.
    if (properties.getProperty(dirtyKey)) return readStockLedgerBalanceRows_(outlet, location);
    const sql = 'SELECT item_code, item_name, current_qty FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_balances` ' +
      'WHERE outlet = @outlet AND location = @location';
    return runNamedQuery_(sql, { outlet: outlet, location: location });
  } catch (error) {
    console.error('Ringkasan stok gagal digunakan; membaca stock_card sebagai cadangan. ' + error.message);
    return readStockLedgerBalanceRows_(outlet, location);
  }
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
  let factor = 1;
  if (fromUnit !== toUnit) {
    const saved = readStockUnitConversions_()[stockConversionKey_(product.code, fromUnit, toUnit)];
    factor = saved ? Number(saved.factor) : 0;
  }
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
  return 'WITH latest AS (SELECT * FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
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
  const lots = [], snapshots = {};
  movements.forEach(function (movement) {
    const qty = Number(movement.qty || 0);
    movement.fifoUsageLots = [];
    movement.fifoUncovered = 0;
    if (movement.direction === 'IN') {
      lots.push({
        qty: qty,
        productionDate: String(movement.productionDate || ''),
        expiryDate: String(movement.expiryDate || ''),
        sourceDate: String(movement.sourceArrivalDate || movement.date || ''),
        showcaseDate: String(movement.date || '')
      });
    } else if (movement.direction === 'OUT') {
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
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
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
        rejected_at: now.getTime() / 1000, rejection_reason: reason, receipt_no: receiptNo
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
  const locations = ['Store', 'Gudang', 'Showcase'];
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
  const allowedIn = ['Opening Stock', 'Supplier In', 'Vendor In', 'Transfer In', 'Goods Receipt', 'Stock Adjustment', 'Others'];
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
  return Number(qty || 0).toFixed(3).replace(/\.000$/, '').replace(/(\.\d*?)0+$/, '$1');
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

function readTasksForEmployee_(employee) {
  const sheet = ensureTaskSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues().map(taskFromRow_)
    .filter(function (task) { return task.active && taskApplies_(task, employee); });
}

function taskFromRow_(r) {
  const frequency = String(r[5]).toUpperCase();
  const type = String(r[3]).toUpperCase();
  const target = String(r[4] || '');
  return {
    id: String(r[0]), title: String(r[1]), description: String(r[2] || ''), type: type,
    target: target, frequency: frequency, periodKey: currentPeriodKey_(frequency), audience: String(r[6] || 'ALL').toUpperCase(),
    dueLabel: String(r[7] || ''), active: truthy_(r[8]), createdAt: dateIso_(r[9]), icon: cleanTaskIcon_(r[11], type, target)
  };
}

function ensureTaskSheet_() {
  const headers = ['ID', 'TITLE', 'DESCRIPTION', 'TYPE', 'TARGET', 'FREQUENCY', 'AUDIENCE', 'DUE_LABEL', 'ACTIVE', 'CREATED_AT', 'CREATED_BY', 'ICON'];
  const sheet = ensureSheet_(CONFIG.TASK_SHEET, headers);
  const currentIconHeader = String(sheet.getRange(1, 12).getDisplayValue() || '').trim().toUpperCase();
  if (currentIconHeader !== 'ICON') {
    sheet.getRange(1, 12).setValue('ICON').setFontWeight('bold').setBackground('#9f172b').setFontColor('#ffffff');
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
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
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
      'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_card` ' +
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
