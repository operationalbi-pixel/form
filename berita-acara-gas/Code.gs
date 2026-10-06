/**
 * SISTEM BERITA ACARA (BA) - CLOUDFLARE ONLY BACKEND
 *
 * Source of truth:
 *   Cloudflare Worker -> D1 metadata + R2 payload
 *
 * IMPORTANT:
 * - No BigQuery read.
 * - No BigQuery write.
 * - No BigQuery fallback.
 * - If Cloudflare is unavailable, the request fails explicitly.
 *
 * Auth remains BI-Space session handoff.
 */

// --- CLOUDFLARE ---
const BA_CLOUDFLARE_DEFAULT_URL =
  'https://bakerzin-inventory-api.operational-bi.workers.dev';

const BA_MPP_SPREADSHEET_ID =
  '1PktH42uGDx64B4ZU4_UMYPnZWomNlXu5WYoIfpndrDw';

const BA_MPP_EMP_LIST_SHEET =
  'EMP_LIST';

const BA_FORM_TYPES = [
  'Komplain Customer',
  'Konsumsi General Cleaning',
  'Refund Customer',
  'Customer Entertain',
  'Minute of Meeting',
  'Test Food',
  'Discount Karyawan',
  'Cancel Online',
  'Quotation',
  'Invoice',
  'Void',
  'Waste Pcs To Pcs',
  'Revisi Stock Opname',
  'Penjualan & Dispose Asset',
  'KOL Foodies',
  'Purchasing Non Supplier'
];

const BA_FNB_FIRST_TYPES = [
  'Waste Pcs To Pcs',
  'Purchasing Non Supplier',
  'Test Food',
  'Revisi Stock Opname'
];

/**
 * Jalankan sekali dari editor Apps Script setelah penambahan scope baru.
 * Fungsi ini memicu layar izin Google Sheets untuk akun pemilik deployment.
 */
function authorizeBeritaAcaraServices() {
  const spreadsheet =
    SpreadsheetApp.openById(
      BA_MPP_SPREADSHEET_ID
    );
  const sheet =
    spreadsheet.getSheetByName(
      BA_MPP_EMP_LIST_SHEET
    );

  if (!sheet) {
    throw new Error(
      'Sheet EMP_LIST Master Data MPP tidak ditemukan.'
    );
  }

  return {
    success: true,
    spreadsheet: spreadsheet.getName(),
    sheet: sheet.getName()
  };
}

// --- BI-SPACE SINGLE SIGN-ON ---
const BI_SPACE_API_URL =
  'https://script.google.com/macros/s/AKfycbw2_tBBWOn9Ld6QcCJBorJyZ06Lh1ZB_gEnIEqc76N7D2WWOv3trlGVqtIAqYml060_/exec';

// ==========================================
// HTML SERVICE
// ==========================================
function doGet(e) {
  try {
    const handoff = String(
      e && e.parameter && e.parameter.handoff || ''
    ).trim();

    const requestedSession = String(
      e && e.parameter && e.parameter.baSession || ''
    ).trim();

    let user;
    let baSession;

    if (handoff) {
      user = consumeBiSpaceHandoff_(handoff);
      baSession = createBaSession_(user);
    } else {
      baSession = requestedSession;
      user = requireBaSession_(baSession);
    }

    user.BA_SESSION = baSession;
    if (String(e && e.parameter && e.parameter.prepareOnly || '') === '1') {
      const ready = {baEntryReady:true,entryNonce:String(e.parameter.entryNonce || ''),session:baSession,identityKey:user.ENTRY_IDENTITY_KEY||''};
      return HtmlService.createHtmlOutput('<!doctype html><script>window.top.postMessage(' + JSON.stringify(ready).replace(/</g, '\\u003c') + ',"*");</script>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    user.CAN_BA_APPROVE =
      baUserCanApprove_(user);
    const requestedMode = String(e && e.parameter && e.parameter.mode || '');
    const dashboardPage = user.CAN_BA_APPROVE && requestedMode !== 'user' ? 'ApprovalDashboard' : 'OutletDashboard';

    const template =
      HtmlService.createTemplateFromFile('Index');

    template.initialDashboardHtmlJson = JSON.stringify(include(dashboardPage)).replace(/</g, '\\u003c');
    template.initialDashboardPageJson = JSON.stringify(dashboardPage);
    template.baEntryNonceJson = JSON.stringify(String(e && e.parameter && e.parameter.entryNonce || '')).replace(/</g, '\\u003c');

    template.initialUserJson =
      JSON.stringify(user).replace(/</g, '\\u003c');

    template.baSessionJson =
      JSON.stringify(baSession);

    template.initialModeJson =
      JSON.stringify(
        String(
          e &&
          e.parameter &&
          e.parameter.mode ||
          ''
        )
      );

    return template
      .evaluate()
      .addMetaTag(
        'viewport',
        'width=device-width, initial-scale=1, viewport-fit=cover'
      )
      .setXFrameOptionsMode(
        HtmlService.XFrameOptionsMode.ALLOWALL
      )
      .setTitle(
        'Sistem Berita Acara - Bakerzin'
      );

  } catch (error) {
    return HtmlService
      .createHtmlOutput(
        '<!doctype html>' +
        '<script>window.top.postMessage(' + JSON.stringify({baEntryError:true,entryNonce:String(e && e.parameter && e.parameter.entryNonce || ''),message:error.message}).replace(/</g, '\\u003c') + ',\"*\");</script>' +
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
        '<div style="min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#faf7f8;font-family:Arial,sans-serif;color:#362d30">' +
        '<div style="max-width:520px;padding:28px;border:1px solid #eadde0;border-radius:18px;background:#fff;text-align:center;box-shadow:0 16px 45px rgba(70,30,40,.08)">' +
        '<h2 style="margin:0 0 10px;color:#98182e">Akses Berita Acara berakhir</h2>' +
        '<p style="line-height:1.6">' +
        escapeHtml_(error.message) +
        '</p>' +
        '<p style="color:#807579;font-size:13px">Tutup halaman ini lalu buka kembali menu Berita Acara dari BI-Space.</p>' +
        '</div></div>'
      )
      .setXFrameOptionsMode(
        HtmlService.XFrameOptionsMode.ALLOWALL
      )
      .setTitle(
        'Akses Berita Acara'
      );
  }
}

function include(filename) {
  return HtmlService
    .createTemplateFromFile(filename)
    .evaluate()
    .getContent();
}

function includeForm(
  filename,
  userData,
  existingData
) {
  userData =
    requireBaSession_(
      userData &&
      userData.BA_SESSION
    );

  const template =
    HtmlService.createTemplateFromFile(
      filename
    );

  template.userDataJson =
    JSON.stringify(userData);

  template.existingDataJson =
    existingData
      ? JSON.stringify(existingData)
      : 'null';

  return template
    .evaluate()
    .getContent();
}

// ==========================================
// BI-SPACE AUTH
// ==========================================
function consumeBiSpaceHandoff_(handoff) {
  if (
    !/^[a-f0-9]{64}$/i.test(handoff)
  ) {
    throw new Error(
      'Buka Berita Acara melalui menu BI-Space.'
    );
  }

  const response =
    UrlFetchApp.fetch(
      BI_SPACE_API_URL,
      {
        method: 'post',

        headers: {
          Authorization:
            'Bearer ' +
            ScriptApp.getOAuthToken()
        },

        payload: {
          mobilePayload:
            JSON.stringify({
              action:
                'consumeBeritaAcaraHandoff',
              args: [handoff]
            })
        },

        muteHttpExceptions:
          true
      }
    );

  if (
    response.getResponseCode() !== 200
  ) {
    throw new Error(
      'Validasi EMP_LIST tidak dapat dihubungi.'
    );
  }

  const raw =
    String(
      response.getContentText() ||
      ''
    ).trim();

  let result;

  try {
    result = JSON.parse(raw || '{}');
  } catch (error) {
    console.error(
      'Validasi BI-Space mengembalikan respons non-JSON. ' +
      'HTTP ' + response.getResponseCode() +
      ', Content-Type: ' +
      String(
        response.getHeaders()['Content-Type'] ||
        response.getHeaders()['content-type'] ||
        '-'
      )
    );

    throw new Error(
      'Validasi sesi BI-Space sedang tidak tersedia. ' +
      'Silakan kembali ke BI-Space dan coba lagi beberapa saat.'
    );
  }

  if (
    !result.ok ||
    !result.data
  ) {
    throw new Error(
      result.error ||
      'Sesi BI-Space tidak valid.'
    );
  }

  return result.data;
}

function createBaSession_(user) {
  const sessionId =
    (
      Utilities.getUuid() +
      Utilities.getUuid()
    ).replace(/-/g, '');

  CacheService
    .getScriptCache()
    .put(
      'ba-session:' +
      sessionId,
      JSON.stringify(user),
      21600
    );

  return sessionId;
}

function requireBaSession_(sessionId) {
  sessionId =
    String(
      sessionId ||
      ''
    ).trim();

  if (
    !/^[a-f0-9]{64}$/i.test(
      sessionId
    )
  ) {
    throw new Error(
      'Sesi Berita Acara tidak valid. Buka kembali melalui BI-Space.'
    );
  }

  const cache =
    CacheService
      .getScriptCache();

  const key =
    'ba-session:' +
    sessionId;

  const raw =
    cache.get(key);

  if (!raw) {
    throw new Error(
      'Sesi Berita Acara telah berakhir. Buka kembali melalui BI-Space.'
    );
  }

  cache.put(
    key,
    raw,
    21600
  );

  const user =
    JSON.parse(raw);

  user.BA_SESSION =
    sessionId;

  return user;
}

function verifyLogin() {
  throw new Error(
    'Login Berita Acara sudah dipindahkan ke BI-Space.'
  );
}

function escapeHtml_(value) {
  return String(
    value ||
    ''
  ).replace(
    /[&<>"']/g,
    function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    }
  );
}

// ==========================================
// NOTIFICATION
// ==========================================
function baNotificationState_(row) {
  const state =
    baResolveApprovalState_(row);

  return {
    status: state.currentStatus === 'Approved'
      ? 'Disetujui'
      : (state.currentStatus === 'Rejected' ? 'Ditolak' : state.currentStatus),
    nextApproval: state.currentApprovalPosition
  };
}

/**
 * Best-effort notification only.
 * This is NOT a database fallback.
 */
function notifyBiSpaceBaEvent_(
  userData,
  event
) {
  try {
    const notifyToken =
      String(
        userData &&
        userData.NOTIFY_TOKEN ||
        ''
      ).trim();

    if (!notifyToken) {
      return {
        accepted: false,
        reason:
          'Notify token tidak tersedia.'
      };
    }

    event =
      event ||
      {};

    event.eventId =
      event.eventId ||
      Utilities.getUuid();

    const response =
      UrlFetchApp.fetch(
        BI_SPACE_API_URL,
        {
          method: 'post',

          payload: {
            mobilePayload:
              JSON.stringify({
                action:
                  'notifyBeritaAcaraEvent',
                args: [
                  notifyToken,
                  event
                ]
              })
          },

          muteHttpExceptions:
            true
        }
      );

    const result =
      JSON.parse(
        response.getContentText() ||
        '{}'
      );

    if (
      response.getResponseCode() !== 200 ||
      !result.ok
    ) {
      console.warn(
        'Notifikasi Berita Acara tidak terkirim: ' +
        (
          result.error ||
          response.getContentText()
        )
      );
    }

    return result;

  } catch (error) {
    console.warn(
      'Notifikasi Berita Acara dilewati: ' +
      error.message
    );

    return {
      accepted: false,
      error: error.message
    };
  }
}

/**
 * Verifies the committed decision, then sends its BI-Space notification.
 * The browser invokes this after a successful write so delivery does not delay the approval response.
 */
function notifyCommittedBaEvent(
  submissionId,
  kind,
  userData
) {
  const trustedUser =
    requireBaSession_(
      userData &&
      userData.BA_SESSION
    );

  kind =
    String(kind || '')
      .trim()
      .toUpperCase();

  if (kind !== 'APPROVED' && kind !== 'REJECTED') {
    throw new Error('Jenis notifikasi tidak valid.');
  }

  const row =
    getRawLatestRow(
      submissionId,
      true
    );

  if (!row) {
    throw new Error('Dokumen untuk notifikasi tidak ditemukan.');
  }

  const position =
    String(trustedUser.POSITION || '')
      .trim()
      .toUpperCase();

  const actor =
    String(trustedUser.NAME || '')
      .trim()
      .toUpperCase();

  const approvalState =
    baResolveApprovalState_(row);
  const candidates = [
    {
      position: approvalState.approval1Position,
      by: kind === 'APPROVED' ? row.fnb_approved_by : row.fnb_rejected_by,
      at: kind === 'APPROVED' ? row.fnb_approved_date : row.fnb_rejected_date
    },
    {
      position: approvalState.approval2Position,
      by: kind === 'APPROVED' ? row.am_approved_by : row.am_rejected_by,
      at: kind === 'APPROVED' ? row.am_approved_date : row.am_rejected_date
    }
  ].filter(
    function (entry) {
      return entry.position === position &&
        String(entry.by || '').trim().toUpperCase() === actor;
    }
  ).sort(
    function (a, b) {
      return String(b.at || '').localeCompare(String(a.at || ''));
    }
  );
  const committed = candidates[0] || {};
  const committedAt = committed.at;

  if (
    !committedAt
  ) {
    throw new Error('Notifikasi ditolak karena keputusan belum terverifikasi.');
  }

  const notificationCache = CacheService.getScriptCache();
  const notificationKey = (
    'ba-notify:' + kind + ':' + submissionId + ':' + String(committedAt || '')
  ).slice(0, 240);

  if (notificationCache.get(notificationKey)) {
    return { success: true, deduplicated: true };
  }

  const state =
    baNotificationState_(row);

  const event =
    kind === 'APPROVED'
      ? { kind: 'APPROVED' }
      : { kind: 'REJECTED' };

  Object.assign(
    event,
    {
      submissionId: submissionId,
      baType: row.ba_type,
      outlet: row.outlet,
      ownerNik: row.nik,
      status: state.status,
      nextApproval: state.nextApproval
    }
  );

  const result = notifyBiSpaceBaEvent_(
    trustedUser,
    event
  );

  notificationCache.put(notificationKey, '1', 21600);

  return { success: true, notification: result };
}

// ==========================================
// CLOUDFLARE-ONLY HELPER
// ==========================================
function baCloudflareConnection_() {
  const props =
    PropertiesService
      .getScriptProperties();

  const url =
    String(
      props.getProperty(
        'CLOUDFLARE_BA_URL'
      ) ||
      props.getProperty(
        'CLOUDFLARE_INVENTORY_URL'
      ) ||
      BA_CLOUDFLARE_DEFAULT_URL
    ).replace(/\/+$/, '');

  const apiKey =
    String(
      props.getProperty(
        'CLOUDFLARE_BA_API_KEY'
      ) ||
      props.getProperty(
        'CLOUDFLARE_INVENTORY_API_KEY'
      ) ||
      ''
    ).trim();

  if (!url) {
    throw new Error(
      'Cloudflare BA URL belum tersedia.'
    );
  }

  if (!apiKey) {
    throw new Error(
      'Cloudflare BA API key belum tersedia.'
    );
  }

  return {
    url: url,
    apiKey: apiKey
  };
}

function baCloudflareRequest_(
  method,
  path,
  payload
) {
  const conn =
    baCloudflareConnection_();

  const options = {
    method:
      String(
        method ||
        'get'
      ).toLowerCase(),

    headers: {
      'x-api-key':
        conn.apiKey
    },

    muteHttpExceptions:
      true
  };

  if (
    payload !== undefined &&
    payload !== null
  ) {
    options.contentType =
      'application/json';

    options.payload =
      JSON.stringify(payload);
  }

  const response =
    UrlFetchApp.fetch(
      conn.url +
      path,
      options
    );

  const status =
    response.getResponseCode();

  const raw =
    response.getContentText();

  let body;

  try {
    body =
      JSON.parse(
        raw ||
        '{}'
      );
  } catch (error) {
    throw new Error(
      'Cloudflare BA mengembalikan respons non-JSON.'
    );
  }

  if (
    status < 200 ||
    status >= 300 ||
    body.ok !== true
  ) {
    const message =
      body &&
      body.error &&
      (
        body.error.message ||
        body.error.code
      )
        ? (
            body.error.message ||
            body.error.code
          )
        : (
            body.error ||
            raw ||
            'Unknown Cloudflare error'
          );

    throw new Error(
      'Cloudflare BA Error (' +
      status +
      '): ' +
      String(message)
    );
  }

  return body;
}

function baDefaultApprovalConfig_() {
  return BA_FORM_TYPES.map(
    function (baType) {
      const fnbFirst =
        BA_FNB_FIRST_TYPES.indexOf(baType) >= 0;

      return {
        baType: baType,
        approval1:
          fnbFirst
            ? 'FNB'
            : 'AREA MANAGER',
        approval2:
          fnbFirst
            ? 'AREA MANAGER'
            : ''
      };
    }
  );
}

function baApprovalConfigRows_(forceRefresh) {
  const cache =
    CacheService.getScriptCache();
  const cacheKey =
    'ba-approval-config-v1';

  if (!forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (ignore) {}
    }
  }

  const defaults =
    baDefaultApprovalConfig_();
  const byType = {};

  defaults.forEach(
    function (row) {
      byType[row.baType] = row;
    }
  );

  let result;

  try {
    result =
      baCloudflareRequest_(
        'get',
        '/v1/ba/approval-config'
      );
  } catch (error) {
    console.warn(
      'Konfigurasi approval Cloudflare belum tersedia; ' +
      'menggunakan alur bawaan. ' +
      (error && error.message ? error.message : error)
    );

    cache.put(
      cacheKey,
      JSON.stringify(defaults),
      30
    );

    return defaults;
  }

  (result.data || []).forEach(
    function (row) {
      const baType =
        String(row.ba_type || '').trim();

      if (!baType) return;

      byType[baType] = {
        baType: baType,
        approval1:
          String(row.approval_1_position || '')
            .trim()
            .toUpperCase(),
        approval2:
          String(row.approval_2_position || '')
            .trim()
            .toUpperCase()
      };
    }
  );

  const rows =
    BA_FORM_TYPES.map(
      function (baType) {
        return byType[baType];
      }
    );

  cache.put(
    cacheKey,
    JSON.stringify(rows),
    600
  );

  return rows;
}

function baApprovalConfigMap_() {
  const map = {};

  baApprovalConfigRows_(false).forEach(
    function (row) {
      map[row.baType] = row;
    }
  );

  return map;
}

function baApprovalPositions_() {
  const cache =
    CacheService.getScriptCache();
  const cacheKey =
    'ba-approval-positions-v1';
  const cached = cache.get(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (ignore) {}
  }

  const sheet =
    SpreadsheetApp
      .openById(BA_MPP_SPREADSHEET_ID)
      .getSheetByName(BA_MPP_EMP_LIST_SHEET);

  if (!sheet) {
    throw new Error(
      'Sheet EMP_LIST Master Data MPP tidak ditemukan.'
    );
  }

  const lastRow = sheet.getLastRow();
  const values =
    lastRow > 1
      ? sheet.getRange(2, 5, lastRow - 1, 1).getDisplayValues()
      : [];
  const seen = {};

  values.forEach(
    function (row) {
      const position =
        String(row[0] || '')
          .trim()
          .toUpperCase();

      if (position) seen[position] = true;
    }
  );

  const positions =
    Object.keys(seen).sort();

  cache.put(
    cacheKey,
    JSON.stringify(positions),
    600
  );

  return positions;
}

function baCanEditApprovalConfig_(user) {
  return String(user && user.POSITION || '')
    .trim()
    .toUpperCase() === 'AREA MANAGER';
}

function baUserCanApprove_(user) {
  if (baCanEditApprovalConfig_(user)) {
    return true;
  }

  const position =
    String(user && user.POSITION || '')
      .trim()
      .toUpperCase();

  return baApprovalConfigRows_(false).some(
    function (row) {
      return row.approval1 === position ||
        row.approval2 === position;
    }
  );
}

function getBaApprovalSettings(userData) {
  const user =
    requireBaSession_(
      userData && userData.BA_SESSION
    );
  const rows =
    baApprovalConfigRows_(false);

  return {
    rows: rows,
    positions: baApprovalPositions_(),
    canEdit: baCanEditApprovalConfig_(user),
    canApprove: baUserCanApprove_(user)
  };
}

function getBaApprovalAccess(userData) {
  const user = requireBaSession_(userData && userData.BA_SESSION);
  // The position directory is needed only by the settings editor.
  return { canApprove: baUserCanApprove_(user), canEdit: baCanEditApprovalConfig_(user) };
}

function saveBaApprovalSettings(rows, userData) {
  const user =
    requireBaSession_(
      userData && userData.BA_SESSION
    );

  if (!baCanEditApprovalConfig_(user)) {
    throw new Error(
      'Hanya Area Manager yang dapat mengubah pemetaan approval.'
    );
  }

  const allowedPositions = {};
  baApprovalPositions_().forEach(
    function (position) {
      allowedPositions[position] = true;
    }
  );

  const submitted = {};
  (rows || []).forEach(
    function (row) {
      submitted[String(row.baType || '').trim()] = row;
    }
  );

  const cleanRows =
    BA_FORM_TYPES.map(
      function (baType) {
        const row = submitted[baType] || {};
        const approval1 =
          String(row.approval1 || '')
            .trim()
            .toUpperCase();
        const approval2 =
          String(row.approval2 || '')
            .trim()
            .toUpperCase();

        if (
          (approval1 && !allowedPositions[approval1]) ||
          (approval2 && !allowedPositions[approval2])
        ) {
          throw new Error(
            'Posisi approval harus berasal dari EMP_LIST kolom E.'
          );
        }

        return {
          baType: baType,
          approval1: approval1,
          approval2: approval2
        };
      }
    );

  baCloudflareRequest_(
    'post',
    '/v1/ba/approval-config',
    {
      rows: cleanRows,
      updatedBy: user.NAME
    }
  );

  CacheService
    .getScriptCache()
    .remove('ba-approval-config-v1');

  return {
    success: true,
    rows: baApprovalConfigRows_(true)
  };
}

function baResolveApprovalState_(row, configMap) {
  row = row || {};
  configMap = configMap || baApprovalConfigMap_();

  const baType =
    String(row.ba_type || row.type || '').trim();
  const config =
    configMap[baType] || {
      approval1: '',
      approval2: ''
    };
  const approval1 =
    String(config.approval1 || '').trim().toUpperCase();
  const approval2 =
    String(config.approval2 || '').trim().toUpperCase();
  const useLegacyAmAsApproval1 =
    approval1 === 'AREA MANAGER' &&
    !approval2 &&
    !row.fnb_approved_date &&
    !row.fnb_rejected_date;
  const approval1ApprovedDate =
    row.fnb_approved_date ||
    (useLegacyAmAsApproval1 ? row.am_approved_date : null);
  const approval1RejectedDate =
    row.fnb_rejected_date ||
    (useLegacyAmAsApproval1 ? row.am_rejected_date : null);
  const approval1ApprovedBy =
    row.fnb_approved_by ||
    (useLegacyAmAsApproval1 ? row.am_approved_by : null);
  const approval1RejectedBy =
    row.fnb_rejected_by ||
    (useLegacyAmAsApproval1 ? row.am_rejected_by : null);
  const rejected1 = !!approval1RejectedDate;
  const rejected2 = !!row.am_rejected_date;
  const approved1 = !approval1 || !!approval1ApprovedDate;
  const approved2 = !approval2 || !!row.am_approved_date;
  let currentStatus = 'Approved';
  let currentPosition = '';
  let currentStep = 0;

  if (rejected1 || rejected2) {
    currentStatus = 'Rejected';
  } else if (!approved1) {
    currentStatus = 'Menunggu Approval ' + approval1;
    currentPosition = approval1;
    currentStep = 1;
  } else if (!approved2) {
    currentStatus = 'Menunggu Approval ' + approval2;
    currentPosition = approval2;
    currentStep = 2;
  }

  return {
    currentStatus: currentStatus,
    currentApprovalPosition: currentPosition,
    currentApprovalStep: currentStep,
    approval1Position: approval1,
    approval2Position: approval2,
    timeline: [
      {
        step: 0,
        label: 'Dibuat',
        status: 'COMPLETED',
        name: row.name || '-',
        position: '',
        at: row.submitted_at || row.timestamp || null
      },
      {
        step: 1,
        label: approval1 ? 'Persetujuan 1' : 'Skipped',
        status: !approval1
          ? 'SKIPPED'
          : (rejected1 ? 'REJECTED' : (approval1ApprovedDate ? 'APPROVED' : 'PENDING')),
        name: approval1ApprovedBy || approval1RejectedBy || approval1 || '-',
        position: approval1,
        at: approval1ApprovedDate || approval1RejectedDate || null
      },
      {
        step: 2,
        label: approval2 ? 'Persetujuan 2' : 'Skipped',
        status: !approval2
          ? 'SKIPPED'
          : (rejected2 ? 'REJECTED' : (row.am_approved_date ? 'APPROVED' : 'PENDING')),
        name: row.am_approved_by || row.am_rejected_by || approval2 || '-',
        position: approval2,
        at: row.am_approved_date || row.am_rejected_date || null
      }
    ]
  };
}

function createAssetDokuPayment(
  paymentData,
  userData
) {
  const user =
    requireBaSession_(
      userData &&
      userData.BA_SESSION
    );

  paymentData =
    paymentData ||
    {};

  const result =
    baCloudflareRequest_(
      'post',
      '/v1/ba/payments/doku/create',
      {
        amount:
          Math.round(
            Number(
              paymentData.amount ||
              0
            )
          ),
        customerName:
          String(
            user.NAME ||
            ''
          ),
        customerEmail:
          String(
            paymentData.email ||
            ''
          ),
        outlet:
          String(
            user.OUTLET ||
            ''
          ),
        nik:
          String(
            user.NIK ||
            ''
          )
      }
    );

  return result.payment;
}

function getAssetDokuPaymentStatus(
  orderId,
  userData
) {
  requireBaSession_(
    userData &&
    userData.BA_SESSION
  );

  const safeOrderId =
    String(
      orderId ||
      ''
    ).trim();

  if (!safeOrderId) {
    throw new Error(
      'Order pembayaran tidak valid.'
    );
  }

  const result =
    baCloudflareRequest_(
      'get',
      '/v1/ba/payments/doku/status?order_id=' +
      encodeURIComponent(
        safeOrderId
      )
    );

  return result.payment;
}

function baCloudflareAppend_(row) {
  row =
    Object.assign(
      {},
      row
    );

  if (!row.row_id) {
    row.row_id =
      baCloudflareRowId_(
        row
      );
  }

  return baCloudflareRequest_(
    'post',
    '/v1/ba/submission',
    {
      rows: [row],
      batchId:
        'BA-PROD-' +
        Utilities.getUuid()
    }
  );
}

function baCloudflareRowId_(row) {
  const identity =
    JSON.stringify([
      String(
        row.submission_id ||
        ''
      ),
      Number(
        row.timestamp ||
        0
      ),
      String(
        row.outlet ||
        ''
      ),
      String(
        row.nik ||
        ''
      ),
      String(
        row.ba_type ||
        ''
      ),
      String(
        row.data_json ||
        ''
      ),
      String(
        row.info ||
        ''
      ),
      String(
        row.am_approved_date ||
        ''
      ),
      String(
        row.am_rejected_date ||
        ''
      ),
      String(
        row.fnb_approved_date ||
        ''
      ),
      String(
        row.fnb_rejected_date ||
        ''
      )
    ]);

  const digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      identity,
      Utilities.Charset.UTF_8
    );

  const hex =
    digest.map(
      function (b) {
        const n =
          b < 0
            ? b + 256
            : b;

        return (
          '0' +
          n.toString(16)
        ).slice(-2);
      }
    ).join('');

  return (
    String(
      row.submission_id ||
      'BA'
    ).slice(
      0,
      100
    ) +
    '-' +
    hex
  ).slice(
    0,
    200
  );
}

function getRawLatestRow(
  submissionId,
  metadataOnly
) {
  submissionId =
    String(
      submissionId ||
      ''
    ).trim();

  if (!submissionId) {
    return null;
  }

  const result =
    baCloudflareRequest_(
      'get',
      '/v1/ba/submission?submission_id=' +
      encodeURIComponent(
        submissionId
      ) +
      (metadataOnly ? '&metadata_only=1' : '')
    );

  return result.data ||
    null;
}

// ==========================================
// GENERAL HELPERS
// ==========================================
function generateStructuredId(
  type,
  nik
) {
  let typeCode =
    'BA';

  const typeMap = {
    'KOL Foodies': 'KF',
    'Void': 'VD',
    'Waste Pcs To Pcs': 'WS',
    'Revisi Stock Opname': 'RSO',
    'Konsumsi General Cleaning': 'GC',
    'Penjualan & Dispose Asset': 'AD',
    'Quotation': 'QTN',
    'Invoice': 'INV',
    'Refund Customer': 'RC',
    'Komplain Customer': 'KC',
    'Minute of Meeting': 'MOM',
    'Purchasing Non Supplier': 'PNS',
    'Customer Entertain': 'CE',
    'Test Food': 'TF',
    'Discount Karyawan': 'DK',
    'Cancel Online': 'CO'
  };

  if (
    typeMap[type]
  ) {
    typeCode =
      typeMap[type];
  }

  const dateStr =
    Utilities.formatDate(
      new Date(),
      'GMT+7',
      'yyyyMMdd'
    );

  const seq =
    Math.floor(
      Math.random() *
      900
    ) + 100;

  return (
    typeCode +
    '-' +
    dateStr +
    '-' +
    nik +
    '-' +
    seq
  );
}

function compressImageIfNeeded(
  base64Str
) {
  if (
    !base64Str ||
    typeof base64Str !==
      'string'
  ) {
    return base64Str;
  }

  if (
    !base64Str.startsWith(
      'data:image'
    )
  ) {
    return base64Str;
  }

  if (
    base64Str.length >
    1000000
  ) {
    try {
      const contentType =
        base64Str
          .split(',')[0]
          .split(':')[1]
          .split(';')[0];

      const data =
        base64Str
          .split(',')[1];

      const blob =
        Utilities.newBlob(
          Utilities.base64Decode(
            data
          ),
          contentType
        );

      const compressedBlob =
        blob.getAs(
          'image/jpeg'
        );

      const compressedBase64 =
        Utilities.base64Encode(
          compressedBlob
            .getBytes()
        );

      return (
        'data:image/jpeg;base64,' +
        compressedBase64
      );

    } catch (error) {
      console.warn(
        'Auto-compress failed, using original: ' +
        error.message
      );

      return base64Str;
    }
  }

  return base64Str;
}

function baInfoString_(
  baType,
  formData
) {
  let infoStr =
    '-';

  switch (baType) {
    case 'Void':
      infoStr =
        formData.noBill ||
        '-';
      break;

    case 'KOL Foodies':
      infoStr =
        formData.namaFoodies ||
        '-';
      break;

    case 'Quotation':
    case 'Invoice':
      infoStr =
        formData.company ||
        formData.companyName ||
        formData.customer ||
        formData.customerName ||
        '-';
      break;

    case 'Komplain Customer':
      const jenis =
        formData.jenisKomplain ||
        formData.jenisComplain ||
        '';

      const sumber =
        formData.sumberComplain ||
        '';

      infoStr =
        jenis &&
        sumber
          ? (
              jenis +
              ' - ' +
              sumber
            )
          : (
              jenis ||
              sumber ||
              '-'
            );
      break;

    case 'Minute of Meeting':
      infoStr =
        formData.namaMeeting ||
        '-';
      break;

    case 'Revisi Stock Opname':
      infoStr =
        formData.keterangan ||
        formData.periode ||
        formData.periodeSO ||
        '-';
      break;

    case 'Customer Entertain':
      infoStr =
        formData.namaCustomer ||
        formData.customer ||
        formData.tujuan ||
        '-';
      break;

    case 'Cancel Online':
      infoStr =
        (
          formData.platform ||
          ''
        ) +
        ' - ' +
        (
          formData.noTransaksi ||
          ''
        );
      break;

    case 'Discount Karyawan':
      infoStr =
        formData.namaKaryawan ||
        '-';
      break;

    case 'Waste Pcs To Pcs':
      infoStr =
        formData.alasan ||
        '-';
      break;

    case 'Test Food':
      infoStr =
        (
          formData.keperluanTest ||
          ''
        ) +
        ' @ ' +
        (
          formData.lokasiTest ||
          ''
        );
      break;

    case 'Penjualan & Dispose Asset':
      infoStr =
        formData.tindakan ||
        '-';
      break;

    case 'Refund Customer':
      infoStr =
        formData.namaCustomer ||
        formData.atasNama ||
        '-';
      break;

    case 'Purchasing Non Supplier':
      infoStr =
        formData.vendor ||
        formData.namaVendor ||
        '-';
      break;

    case 'Konsumsi General Cleaning':
    default:
      infoStr =
        '-';
  }

  return infoStr;
}

function baCompressImages_(
  formData
) {
  for (
    const key in formData
  ) {
    if (
      typeof formData[key] ===
        'string' &&
      formData[key].startsWith(
        'data:image'
      )
    ) {
      formData[key] =
        compressImageIfNeeded(
          formData[key]
        );

    } else if (
      Array.isArray(
        formData[key]
      )
    ) {
      formData[key] =
        formData[key].map(
          function (item) {
            if (
              typeof item ===
                'string' &&
              item.startsWith(
                'data:image'
              )
            ) {
              return compressImageIfNeeded(
                item
              );
            }

            if (
              typeof item ===
                'object' &&
              item !== null
            ) {
              for (
                const subKey in item
              ) {
                if (
                  typeof item[subKey] ===
                    'string' &&
                  item[subKey].startsWith(
                    'data:image'
                  )
                ) {
                  item[subKey] =
                    compressImageIfNeeded(
                      item[subKey]
                    );
                }
              }
            }

            return item;
          }
        );
    }
  }

  return formData;
}

// ==========================================
// CREATE / UPDATE
// ==========================================
function rekamData(
  formData,
  baType,
  userData,
  isUpdate,
  submissionId
) {
  try {
    isUpdate =
      isUpdate === true;

    submissionId =
      submissionId ||
      null;

    userData =
      requireBaSession_(
        userData &&
        userData.BA_SESSION
      );

    const fmtRupiah =
      function (n) {
        return new Intl.NumberFormat(
          'id-ID',
          {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
          }
        ).format(n);
      };

    const plannedSubmissionId =
      isUpdate
        ? submissionId
        : generateStructuredId(
            baType,
            userData.NIK
          );

    if (
      !formData.grandTotal &&
      !formData.totalBill
    ) {
      if (
        [
          'Penjualan & Dispose Asset',
          'Konsumsi General Cleaning',
          'Waste Pcs To Pcs',
          'Void'
        ].includes(baType)
      ) {
        let calcTotal =
          0;

        if (
          formData.items &&
          Array.isArray(
            formData.items
          )
        ) {
          formData.items.forEach(
            function (item) {
              const price =
                parseFloat(
                  String(
                    item.price ||
                    item.hargaJual ||
                    0
                  )
                    .replace(
                      /[^0-9,-]+/g,
                      ''
                    )
                    .replace(
                      ',',
                      '.'
                    )
                ) ||
                0;

              calcTotal +=
                (
                  parseFloat(
                    item.qty
                  ) ||
                  0
                ) *
                price;
            }
          );
        }

        if (
          baType ===
          'Penjualan & Dispose Asset'
        ) {
          formData.grandTotalJual =
            fmtRupiah(
              calcTotal
            );
        } else {
          formData.grandTotal =
            fmtRupiah(
              calcTotal
            );
        }
      }
    }

    if (
      baType === 'Penjualan & Dispose Asset' &&
      !isUpdate &&
      String(formData.tindakan || '').trim() === 'Penjualan'
    ) {
      const expectedPayment =
        parseFloat(formData.paymentExpectedAmount) || 0;

      const calculatedPayment =
        parseFloat(
          String(formData.grandTotalJual || '')
            .replace(/[^0-9,-]+/g, '')
            .replace(',', '.')
        ) || 0;

      if (calculatedPayment <= 0) {
        return {
          success: false,
          message: 'Grand Total Harga Jual harus lebih dari Rp 0 sebelum pembayaran.'
        };
      }

      let verifiedPayment;

      try {
        verifiedPayment =
          baCloudflareRequest_(
            'get',
            '/v1/ba/payments/doku/status?order_id=' +
            encodeURIComponent(
              String(
                formData.paymentOrderId ||
                ''
              )
            )
          ).payment;
      } catch (paymentError) {
        return {
          success: false,
          message: 'Pembayaran belum dapat diverifikasi: ' +
            String(
              paymentError &&
              paymentError.message ||
              paymentError
            )
        };
      }

      if (
        expectedPayment !== calculatedPayment ||
        !verifiedPayment ||
        verifiedPayment.status !== 'PAID' ||
        Number(verifiedPayment.amount) !== calculatedPayment
      ) {
        return {
          success: false,
          message: 'Pembayaran belum berhasil atau nominalnya tidak sesuai Grand Total.'
        };
      }

      formData.paymentConfirmed =
        true;

      formData.paymentConfirmedAt =
        verifiedPayment.paid_at ||
        new Date().toISOString();

      formData.paymentStatus =
        verifiedPayment.status;

      formData.paymentType =
        verifiedPayment.payment_type ||
        '';

      formData.paymentVerificationMethod =
        'DOKU_HTTP_NOTIFICATION';

      try {
        baCloudflareRequest_(
          'post',
          '/v1/ba/payments/doku/claim',
          {
            orderId:
              String(
                formData.paymentOrderId ||
                ''
              ),
            amount:
              calculatedPayment,
            submissionId:
              plannedSubmissionId
          }
        );
      } catch (claimError) {
        return {
          success: false,
          message: 'Pembayaran tidak dapat dipakai: ' +
            String(
              claimError &&
              claimError.message ||
              claimError
            )
        };
      }
    }

    formData =
      baCompressImages_(
        formData
      );

    const infoStr =
      baInfoString_(
        baType,
        formData
      );

    const nowTs =
      (
        new Date()
      ).getTime() /
      1000;

    if (
      isUpdate &&
      submissionId
    ) {
      const oldRow =
        getRawLatestRow(
          submissionId
        );

      if (!oldRow) {
        return {
          success: false,
          message:
            'Data lama tidak ditemukan di Cloudflare.'
        };
      }

      const newRow =
        Object.assign(
          {},
          oldRow
        );

      delete newRow.row_id;
      delete newRow.data_object_key;
      delete newRow.created_at;
      delete newRow.rn;

      newRow.timestamp =
        nowTs;

      newRow.data_json =
        JSON.stringify(
          formData
        );

      newRow.info =
        infoStr;

      newRow.am_approved_date =
        null;

      newRow.am_approved_by =
        null;

      newRow.am_rejected_date =
        null;

      newRow.am_rejected_by =
        null;

      newRow.am_reject_reason =
        null;

      newRow.fnb_approved_date =
        null;

      newRow.fnb_approved_by =
        null;

      newRow.fnb_rejected_date =
        null;

      newRow.fnb_rejected_by =
        null;

      newRow.fnb_reject_reason =
        null;

      newRow.migrated_from =
        'CLOUDFLARE_APP';

      baCloudflareAppend_(
        newRow
      );

      const updateState =
        baNotificationState_(
          newRow
        );

      notifyBiSpaceBaEvent_(
        userData,
        {
          kind:
            'UPDATED',

          submissionId:
            submissionId,

          baType:
            newRow.ba_type,

          outlet:
            newRow.outlet,

          ownerNik:
            newRow.nik,

          status:
            updateState.status,

          nextApproval:
            updateState.nextApproval
        }
      );

      return {
        success: true,
        baId:
          submissionId,
        message:
          'Revisi Berhasil (Cloudflare)! ID: ' +
          submissionId
      };
    }

    const newId =
      plannedSubmissionId;

    const rowData = {
      submission_id:
        newId,

      timestamp:
        nowTs,

      outlet:
        userData.OUTLET,

      name:
        userData.NAME,

      nik:
        userData.NIK,

      ba_type:
        baType,

      data_json:
        JSON.stringify(
          formData
        ),

      info:
        infoStr,

      am_approved_date:
        null,

      am_approved_by:
        null,

      am_rejected_date:
        null,

      am_rejected_by:
        null,

      am_reject_reason:
        null,

      fnb_approved_date:
        null,

      fnb_approved_by:
        null,

      fnb_rejected_date:
        null,

      fnb_rejected_by:
        null,

      fnb_reject_reason:
        null,

      migrated_from:
        'CLOUDFLARE_APP'
    };

    baCloudflareAppend_(
      rowData
    );

    const newState =
      baNotificationState_(
        rowData
      );

    notifyBiSpaceBaEvent_(
      userData,
      {
        kind:
          'NEW',

        submissionId:
          newId,

        baType:
          rowData.ba_type,

        outlet:
          rowData.outlet,

        ownerNik:
          rowData.nik,

        status:
          newState.status,

        nextApproval:
          newState.nextApproval
      }
    );

    return {
      success: true,
      baId:
        newId,
      message:
        'Berhasil (Cloudflare)! ID: ' +
        newId
    };

  } catch (error) {
    return {
      success: false,
      message:
        'Gagal Rekam Cloudflare: ' +
        error.toString()
    };
  }
}

// ==========================================
// LIST
// ==========================================
function getAllSubmissions(
  userData
) {
  try {
    userData =
      requireBaSession_(
        userData &&
        userData.BA_SESSION
      );

    let path =
      '/v1/ba/submissions?limit=3000';

    if (
      userData.ROLE ===
      'OUTLET'
    ) {
      path +=
        '&outlet=' +
        encodeURIComponent(
          userData.OUTLET ||
          ''
        );
    }

    const result =
      baCloudflareRequest_(
        'get',
        path
      );

    const rows =
      result.data ||
      [];

    const configMap =
      baApprovalConfigMap_();

    return rows.map(
      function (r) {
        const cleanType =
          (
            r.ba_type ||
            ''
          ).trim();
        const state =
          baResolveApprovalState_(r, configMap);

        return {
          sheetName:
            r.submission_id,

          rowNumber:
            0,

          Submission_ID:
            r.submission_id,

          Timestamp:
            r.submitted_at ||
            r.timestamp,

          Outlet:
            r.outlet,

          NAME:
            r.name,

          NIK:
            r.nik,

          type:
            cleanType,

          info:
            r.info ||
            '-',

          AM_Approved_Date:
            r.am_approved_date,

          AM_Rejected_Date:
            r.am_rejected_date,

          FNB_Approved_Date:
            r.fnb_approved_date,

          FNB_Rejected_Date:
            r.fnb_rejected_date,

          currentStatus:
            state.currentStatus,

          Current_Approval_Position:
            state.currentApprovalPosition,

          Current_Approval_Step:
            state.currentApprovalStep,

          Approval_1_Position:
            state.approval1Position,

          Approval_2_Position:
            state.approval2Position
        };
      }
    );

  } catch (error) {
    console.error(
      error
    );

    throw new Error(
      'Data Berita Acara gagal dimuat dari Cloudflare: ' +
      error.message
    );
  }
}

// ==========================================
// DETAIL
// ==========================================
function getSubmissionDetail(
  submissionId
) {
  try {
    const r =
      getRawLatestRow(
        submissionId
      );

    if (!r) {
      return null;
    }

    const cleanType =
      (
        r.ba_type ||
        ''
      ).trim();
    const state =
      baResolveApprovalState_(r);

    return {
      Submission_ID:
        r.submission_id,

      Timestamp:
        r.submitted_at ||
        r.timestamp,

      Outlet:
        r.outlet,

      NAME:
        r.name,

      NIK:
        r.nik,

      type:
        cleanType,

      info:
        r.info,

      Data_JSON:
        r.data_json,

      AM_Approved_Date:
        r.am_approved_date,

      AM_Approved_By:
        r.am_approved_by,

      AM_Rejected_Date:
        r.am_rejected_date,

      AM_Rejected_By:
        r.am_rejected_by,

      AM_Reject_Reason:
        r.am_reject_reason,

      FNB_Approved_Date:
        r.fnb_approved_date,

      FNB_Approved_By:
        r.fnb_approved_by,

      FNB_Rejected_Date:
        r.fnb_rejected_date,

      FNB_Rejected_By:
        r.fnb_rejected_by,

      FNB_Reject_Reason:
        r.fnb_reject_reason,

      currentStatus:
        state.currentStatus,

      Current_Approval_Position:
        state.currentApprovalPosition,

      Current_Approval_Step:
        state.currentApprovalStep,

      Approval_1_Position:
        state.approval1Position,

      Approval_2_Position:
        state.approval2Position,

      Approval_Timeline:
        state.timeline,

      sheetName:
        r.submission_id,

      rowNumber:
        0
    };

  } catch (error) {
    console.error(
      'getSubmissionDetail Cloudflare error: ' +
      error.message
    );

    return null;
  }
}

// ==========================================
// APPROVE
// ==========================================
function approveBa(
  sheetName,
  rowNumber,
  approverName,
  approverPosition,
  userData
) {
  const trustedUser =
    requireBaSession_(
      userData &&
      userData.BA_SESSION
    );

  approverName =
    trustedUser.NAME;

  approverPosition =
    trustedUser.POSITION;

  const submissionId =
    sheetName;

  const oldRow =
    getRawLatestRow(
      submissionId,
      true
    );

  if (!oldRow) {
    return {
      success: false,
      message:
        'Dokumen tidak ditemukan di Cloudflare.'
    };
  }

  const approvalState =
    baResolveApprovalState_(oldRow);
  const trustedPosition =
    String(approverPosition || '')
      .trim()
      .toUpperCase();

  if (
    !approvalState.currentApprovalStep ||
    approvalState.currentApprovalPosition !== trustedPosition
  ) {
    return {
      success: false,
      message:
        approvalState.currentStatus === 'Approved'
          ? 'Dokumen sudah selesai disetujui.'
          : 'Dokumen sedang menunggu persetujuan posisi ' +
            (approvalState.currentApprovalPosition || '-') + '.'
    };
  }

  const newRow =
    Object.assign(
      {},
      oldRow
    );

  delete newRow.row_id;
  delete newRow.created_at;
  delete newRow.rn;

  newRow.timestamp =
    (
      new Date()
    ).getTime() /
    1000;

  newRow.migrated_from =
    'CLOUDFLARE_APP';

  if (approvalState.currentApprovalStep === 1) {
    newRow.fnb_approved_date =
      new Date()
        .toISOString();

    newRow.fnb_approved_by =
      approverName;

    newRow.fnb_rejected_date =
      null;

    newRow.fnb_rejected_by =
      null;

    newRow.fnb_reject_reason =
      null;

  } else if (approvalState.currentApprovalStep === 2) {
    newRow.am_approved_date =
      new Date()
        .toISOString();

    newRow.am_approved_by =
      approverName;

    newRow.am_rejected_date =
      null;

    newRow.am_rejected_by =
      null;

    newRow.am_reject_reason =
      null;

  }

  try {
    baCloudflareAppend_(
      newRow
    );

    return {
      success: true,
      notificationPending: true,
      message:
        'Berhasil Disetujui (Cloudflare)!'
    };

  } catch (error) {
    return {
      success: false,
      message:
        'Error Cloudflare: ' +
        error.message
    };
  }
}

// ==========================================
// REJECT
// ==========================================
function rejectBa(
  sheetName,
  rowNumber,
  approverName,
  approverPosition,
  reason,
  userData
) {
  const trustedUser =
    requireBaSession_(
      userData &&
      userData.BA_SESSION
    );

  approverName =
    trustedUser.NAME;

  approverPosition =
    trustedUser.POSITION;

  const submissionId =
    sheetName;

  const oldRow =
    getRawLatestRow(
      submissionId,
      true
    );

  if (!oldRow) {
    return {
      success: false,
      message:
        'Dokumen tidak ditemukan di Cloudflare.'
    };
  }

  const approvalState =
    baResolveApprovalState_(oldRow);
  const trustedPosition =
    String(approverPosition || '')
      .trim()
      .toUpperCase();

  if (
    !approvalState.currentApprovalStep ||
    approvalState.currentApprovalPosition !== trustedPosition
  ) {
    return {
      success: false,
      message:
        approvalState.currentStatus === 'Approved'
          ? 'Dokumen sudah selesai disetujui.'
          : 'Dokumen sedang menunggu persetujuan posisi ' +
            (approvalState.currentApprovalPosition || '-') + '.'
    };
  }

  const newRow =
    Object.assign(
      {},
      oldRow
    );

  delete newRow.row_id;
  delete newRow.created_at;
  delete newRow.rn;

  newRow.timestamp =
    (
      new Date()
    ).getTime() /
    1000;

  newRow.migrated_from =
    'CLOUDFLARE_APP';

  if (approvalState.currentApprovalStep === 1) {
    newRow.fnb_rejected_date =
      new Date()
        .toISOString();

    newRow.fnb_rejected_by =
      approverName;

    newRow.fnb_reject_reason =
      reason;

    newRow.fnb_approved_date =
      null;

    newRow.fnb_approved_by =
      null;

  } else if (approvalState.currentApprovalStep === 2) {
    newRow.am_rejected_date =
      new Date()
        .toISOString();

    newRow.am_rejected_by =
      approverName;

    newRow.am_reject_reason =
      reason;

    newRow.am_approved_date =
      null;

    newRow.am_approved_by =
      null;

  }

  try {
    baCloudflareAppend_(
      newRow
    );

    return {
      success: true,
      notificationPending: true,
      message:
        'Berhasil Ditolak (Cloudflare)!'
    };

  } catch (error) {
    return {
      success: false,
      message:
        'Error Cloudflare: ' +
        error.message
    };
  }
}
