/**
 * SISTEM BERITA ACARA (BA) - BIGQUERY INTEGRATED BACKEND
 * Database: BigQuery (Append-Only Strategy)
 * Auth: one-time BI-Space session handoff validated against EMP_LIST
 * Update: FIX MAPPING INFO COLUMN (TYPO CORRECTION) & AUTO COMPRESS IMAGE
 */

// --- KONFIGURASI BIGQUERY ---
const BQ_PROJECT_ID = 'berita-acara-digital';
const BQ_DATASET_ID = 'berita_acara_app';
const BQ_TABLE_ID   = 'submissions'; 

// --- BI-SPACE SINGLE SIGN-ON ---
const BI_SPACE_API_URL = 'https://script.google.com/macros/s/AKfycbw2_tBBWOn9Ld6QcCJBorJyZ06Lh1ZB_gEnIEqc76N7D2WWOv3trlGVqtIAqYml060_/exec';

// --- HTML SERVICE ---
function doGet(e) {
  try {
    const handoff = String(e && e.parameter && e.parameter.handoff || '').trim();
    const requestedSession = String(e && e.parameter && e.parameter.baSession || '').trim();
    let user, baSession;
    if (handoff) {
      user = consumeBiSpaceHandoff_(handoff);
      baSession = createBaSession_(user);
    } else {
      baSession = requestedSession;
      user = requireBaSession_(baSession);
    }
    user.BA_SESSION = baSession;
    const template = HtmlService.createTemplateFromFile('Index');
    template.initialUserJson = JSON.stringify(user).replace(/</g, '\\u003c');
    template.baSessionJson = JSON.stringify(baSession);
    template.initialModeJson = JSON.stringify(String(e && e.parameter && e.parameter.mode || ''));
    return template.evaluate()
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle('Sistem Berita Acara - Bakerzin');
  } catch (error) {
    return HtmlService.createHtmlOutput(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
      '<div style="min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#faf7f8;font-family:Arial,sans-serif;color:#362d30">' +
      '<div style="max-width:520px;padding:28px;border:1px solid #eadde0;border-radius:18px;background:#fff;text-align:center;box-shadow:0 16px 45px rgba(70,30,40,.08)">' +
      '<h2 style="margin:0 0 10px;color:#98182e">Akses Berita Acara berakhir</h2><p style="line-height:1.6">' + escapeHtml_(error.message) +
      '</p><p style="color:#807579;font-size:13px">Tutup halaman ini lalu buka kembali menu Berita Acara dari BI-Space.</p></div></div>'
    ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).setTitle('Akses Berita Acara');
  }
}

function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}

function includeForm(filename, userData, existingData) {
  userData = requireBaSession_(userData && userData.BA_SESSION);
  const template = HtmlService.createTemplateFromFile(filename);
  template.userDataJson = JSON.stringify(userData);
  template.existingDataJson = existingData ? JSON.stringify(existingData) : 'null';
  return template.evaluate().getContent();
}

// ==========================================
// 1. OTENTIKASI MELALUI EMP_LIST BI-SPACE
// ==========================================
function consumeBiSpaceHandoff_(handoff) {
  if (!/^[a-f0-9]{64}$/i.test(handoff)) throw new Error('Buka Berita Acara melalui menu BI-Space.');
  const response = UrlFetchApp.fetch(BI_SPACE_API_URL, {
    method: 'post',
    payload: { mobilePayload: JSON.stringify({ action: 'consumeBeritaAcaraHandoff', args: [handoff] }) },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Validasi EMP_LIST tidak dapat dihubungi.');
  const result = JSON.parse(response.getContentText() || '{}');
  if (!result.ok || !result.data) throw new Error(result.error || 'Sesi BI-Space tidak valid.');
  return result.data;
}

function createBaSession_(user) {
  const sessionId = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  CacheService.getScriptCache().put('ba-session:' + sessionId, JSON.stringify(user), 21600);
  return sessionId;
}

function requireBaSession_(sessionId) {
  sessionId = String(sessionId || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(sessionId)) throw new Error('Sesi Berita Acara tidak valid. Buka kembali melalui BI-Space.');
  const cache = CacheService.getScriptCache(), key = 'ba-session:' + sessionId, raw = cache.get(key);
  if (!raw) throw new Error('Sesi Berita Acara telah berakhir. Buka kembali melalui BI-Space.');
  cache.put(key, raw, 21600);
  const user = JSON.parse(raw);
  user.BA_SESSION = sessionId;
  return user;
}

function verifyLogin() {
  throw new Error('Login Berita Acara sudah dipindahkan ke BI-Space.');
}

function escapeHtml_(value) {
  return String(value || '').replace(/[&<>"']/g, function (char) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
  });
}

// ==========================================
// 2. BIGQUERY HELPER FUNCTIONS
// ==========================================

function runBqQuery(sql) {
  const request = { query: sql, useLegacySql: false };
  let queryResults;
  try {
    queryResults = BigQuery.Jobs.query(request, BQ_PROJECT_ID);
    const jobId = queryResults.jobReference.jobId;
    let sleepTimeMs = 500;
    while (!queryResults.jobComplete) {
      Utilities.sleep(sleepTimeMs);
      sleepTimeMs *= 2;
      queryResults = BigQuery.Jobs.getQueryResults(BQ_PROJECT_ID, jobId);
    }
    return parseBqRows(queryResults);
  } catch (e) {
    throw new Error("BigQuery Error: " + e.message);
  }
}

function parseBqRows(result) {
  if (!result.rows) return [];
  const schema = result.schema.fields;
  return result.rows.map(row => {
    let obj = {};
    schema.forEach((field, index) => {
      let val = row.f[index].v;
      if (field.type === 'TIMESTAMP' && val) {
        obj[field.name] = new Date(parseFloat(val) * 1000).toISOString();
      } else {
        obj[field.name] = val;
      }
    });
    return obj;
  });
}

function insertToBq(rowData) {
  const insertReq = { rows: [{ json: rowData }] };
  const response = BigQuery.Tabledata.insertAll(insertReq, BQ_PROJECT_ID, BQ_DATASET_ID, BQ_TABLE_ID);
  if (response.insertErrors && response.insertErrors.length > 0) {
    throw new Error("BQ Insert Failed: " + JSON.stringify(response.insertErrors));
  }
}

function getRawLatestRow(submissionId) {
  const sql = `
    SELECT *
    FROM \`${BQ_PROJECT_ID}.${BQ_DATASET_ID}.${BQ_TABLE_ID}\`
    WHERE submission_id = '${submissionId}'
    ORDER BY timestamp DESC
    LIMIT 1
  `;
  const rows = runBqQuery(sql);
  return rows.length > 0 ? rows[0] : null;
}

function generateStructuredId(type, nik) {
  let typeCode = 'BA';
  const typeMap = {
    'KOL Foodies': 'KF', 'Void': 'VD', 'Waste Pcs To Pcs': 'WS',
    'Revisi Stock Opname': 'RSO', 'Konsumsi General Cleaning': 'GC',
    'Penjualan & Dispose Asset': 'AD', 'Quotation': 'QTN', 'Invoice': 'INV',
    'Refund Customer': 'RC', 'Komplain Customer': 'KC', 'Minute of Meeting': 'MOM',
    'Purchasing Non Supplier': 'PNS', 'Customer Entertain': 'CE', 'Test Food': 'TF',
    'Discount Karyawan': 'DK', 'Cancel Online': 'CO'
  };
  if (typeMap[type]) typeCode = typeMap[type];
  const dateStr = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");
  const seq = Math.floor(Math.random() * 900) + 100; 
  return `${typeCode}-${dateStr}-${nik}-${seq}`;
}

// --- HELPER: AUTO COMPRESS IMAGE (Server-Side) ---
function compressImageIfNeeded(base64Str) {
  if (!base64Str || typeof base64Str !== 'string') return base64Str;
  
  // Hanya proses jika string terlihat seperti gambar base64
  if (!base64Str.startsWith('data:image')) return base64Str;

  // Cek ukuran kasar (1 karakter base64 ~= 0.75 byte). Jika > 1MB, coba compress
  if (base64Str.length > 1000000) { 
    try {
      // Ekstrak data murni
      const contentType = base64Str.split(',')[0].split(':')[1].split(';')[0];
      const data = base64Str.split(',')[1];
      const blob = Utilities.newBlob(Utilities.base64Decode(data), contentType);
      
      // Trik: Convert ke JPEG biasanya otomatis compress ukuran file dibanding PNG
      const compressedBlob = blob.getAs('image/jpeg'); 
      const compressedBase64 = Utilities.base64Encode(compressedBlob.getBytes());
      
      return 'data:image/jpeg;base64,' + compressedBase64;
    } catch (e) {
      console.warn("Auto-compress failed, using original: " + e.message);
      return base64Str; 
    }
  }
  return base64Str;
}

// ==========================================
// 3. REKAM DATA (STRATEGI APPEND-ONLY)
// ==========================================
function rekamData(formData, baType, userData, isUpdate = false, submissionId = null) {
  try {
    userData = requireBaSession_(userData && userData.BA_SESSION);
    const fmtRupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
    
    // Auto Calculate Total
    if (!formData.grandTotal && !formData.totalBill) {
        if (['Penjualan & Dispose Asset', 'Konsumsi General Cleaning', 'Waste Pcs To Pcs', 'Void'].includes(baType)) {
          let calcTotal = 0;
          if (formData.items && Array.isArray(formData.items)) {
              formData.items.forEach(item => {
                  const price = parseFloat(String(item.price || item.hargaJual || 0).replace(/[^0-9,-]+/g,"").replace(",", ".")) || 0;
                  calcTotal += (parseFloat(item.qty) || 0) * price;
              });
          }
          if(baType === 'Penjualan & Dispose Asset') formData.grandTotalJual = fmtRupiah(calcTotal);
          else formData.grandTotal = fmtRupiah(calcTotal);
        }
    }

    // --- AUTO COMPRESS PHOTOS ---
    for (const key in formData) {
      if (typeof formData[key] === 'string' && formData[key].startsWith('data:image')) {
        formData[key] = compressImageIfNeeded(formData[key]);
      } else if (Array.isArray(formData[key])) {
        formData[key] = formData[key].map(item => {
           if (typeof item === 'string' && item.startsWith('data:image')) {
             return compressImageIfNeeded(item);
           } else if (typeof item === 'object' && item !== null) {
             for (const subKey in item) {
                if (typeof item[subKey] === 'string' && item[subKey].startsWith('data:image')) {
                  item[subKey] = compressImageIfNeeded(item[subKey]);
                }
             }
           }
           return item;
        });
      }
    }

    // --- GENERATE INFO COLUMN LOGIC (FIXED TYPOS) ---
    // Logika ini diperbaiki untuk mengantisipasi perbedaan nama variabel (vendor vs namaVendor, company vs companyName, dll)
    let infoStr = '-';
    switch(baType) {
        case 'Void': 
            infoStr = formData.noBill || '-'; break;
        case 'KOL Foodies': 
            infoStr = formData.namaFoodies || '-'; break;
        case 'Quotation': 
        case 'Invoice': 
            // Fix: Form kadang pakai 'company' atau 'customer'
            infoStr = formData.company || formData.companyName || formData.customer || formData.customerName || '-'; break;
        case 'Komplain Customer': 
            // Fix: Antisipasi typo 'jenisKomplain' vs 'jenisComplain'
            const jenis = formData.jenisKomplain || formData.jenisComplain || '';
            const sumber = formData.sumberComplain || '';
            infoStr = (jenis && sumber) ? `${jenis} - ${sumber}` : (jenis || sumber || '-'); 
            break;
        case 'Minute of Meeting': 
            infoStr = formData.namaMeeting || '-'; break;
        case 'Revisi Stock Opname': 
            // Fix: Tambahkan 'periodeSO'
            infoStr = formData.keterangan || formData.periode || formData.periodeSO || '-'; break;
        case 'Customer Entertain': 
            // Fix: Tambahkan 'customer' dan 'namaCustomer' sesuai request
            infoStr = formData.namaCustomer || formData.customer || formData.tujuan || '-'; break;
        case 'Cancel Online': 
            infoStr = (formData.platform || '') + ' - ' + (formData.noTransaksi || ''); break;
        case 'Discount Karyawan': 
            infoStr = formData.namaKaryawan || '-'; break;
        case 'Waste Pcs To Pcs': 
            infoStr = formData.alasan || '-'; break;
        case 'Test Food': 
            infoStr = (formData.keperluanTest || '') + ' @ ' + (formData.lokasiTest || ''); break;
        case 'Penjualan & Dispose Asset': 
            infoStr = formData.tindakan || '-'; break;
        case 'Refund Customer': 
            // Fix: Prioritaskan 'namaCustomer' sesuai request
            infoStr = formData.namaCustomer || formData.atasNama || '-'; break;
        case 'Purchasing Non Supplier': 
            // Fix: Form pakai 'vendor'
            infoStr = formData.vendor || formData.namaVendor || '-'; break;
        case 'Konsumsi General Cleaning':
            infoStr = '-'; break;
        default:
            infoStr = '-';
    }

    const nowTs = (new Date()).getTime() / 1000;

    // A. KASUS REVISI (UPDATE)
    if (isUpdate && submissionId) {
      const oldRow = getRawLatestRow(submissionId);
      if (!oldRow) return { success: false, message: 'Data lama tidak ditemukan di BQ.' };

      const newRow = { ...oldRow };
      newRow.timestamp = nowTs; 
      newRow.data_json = JSON.stringify(formData); 
      newRow.info = infoStr; // Update Info Column

      // Reset Approval
      newRow.am_approved_date = null; newRow.am_approved_by = null;
      newRow.am_rejected_date = null; newRow.am_rejected_by = null; newRow.am_reject_reason = null;
      newRow.fnb_approved_date = null; newRow.fnb_approved_by = null;
      newRow.fnb_rejected_date = null; newRow.fnb_rejected_by = null; newRow.fnb_reject_reason = null;

      insertToBq(newRow);
      return { success: true, baId: submissionId, message: `Revisi Berhasil (BQ)! ID: ${submissionId}` };
    } 
    
    // B. KASUS BARU (INSERT)
    else {
      const newId = generateStructuredId(baType, userData.NIK);
      const creatorPosition = String(userData.POSITION || '').trim().toUpperCase();
      const requiresFnb = ['Waste Pcs To Pcs', 'Penjualan & Dispose Asset', 'Purchasing Non Supplier', 'Test Food', 'Revisi Stock Opname'].includes(baType);
      const autoFnbApproved = requiresFnb && (creatorPosition === 'FNB' || creatorPosition === 'AREA MANAGER');
      const autoAmApproved = creatorPosition === 'AREA MANAGER';
      const approvalTime = new Date().toISOString();
      const rowData = {
        submission_id: newId,
        timestamp: nowTs,
        outlet: userData.OUTLET,
        name: userData.NAME,
        nik: userData.NIK,
        ba_type: baType,
        data_json: JSON.stringify(formData),
        info: infoStr, // Insert Info Column
        
        am_approved_date: autoAmApproved ? approvalTime : null,
        am_approved_by: autoAmApproved ? userData.NAME : null,
        am_rejected_date: null, am_rejected_by: null, am_reject_reason: null,
        fnb_approved_date: autoFnbApproved ? approvalTime : null,
        fnb_approved_by: autoFnbApproved ? userData.NAME : null,
        fnb_rejected_date: null, fnb_rejected_by: null, fnb_reject_reason: null
      };

      insertToBq(rowData);
      return { success: true, baId: newId, message: `Berhasil (BQ)! ID: ${newId}` };
    }

  } catch (e) {
    return { success: false, message: "Gagal Rekam BQ: " + e.toString() };
  }
}

// ==========================================
// 4. DATA FETCHING (GET LATEST VERSION ONLY)
// ==========================================
function getAllSubmissions(userData) {
  try {
    userData = requireBaSession_(userData && userData.BA_SESSION);
    // UPDATED: SELECT kolom 'info' dari BQ
    let sql = `
      SELECT 
        submission_id, timestamp, outlet, name, nik, ba_type, info,
        am_approved_date, am_approved_by, am_rejected_date, am_rejected_by, am_reject_reason,
        fnb_approved_date, fnb_approved_by, fnb_rejected_date, fnb_rejected_by, fnb_reject_reason,
        ROW_NUMBER() OVER(PARTITION BY submission_id ORDER BY timestamp DESC) as rn
      FROM \`${BQ_PROJECT_ID}.${BQ_DATASET_ID}.${BQ_TABLE_ID}\`
    `;

    // Filter Outlet
    if (userData.ROLE === 'OUTLET') {
      sql = `SELECT * FROM (${sql}) WHERE rn = 1 AND outlet = '${userData.OUTLET}'`;
    } else {
      sql = `SELECT * FROM (${sql}) WHERE rn = 1`;
    }

    sql += ` ORDER BY timestamp DESC LIMIT 3000`;

    const rows = runBqQuery(sql);

    return rows.map(r => {
      let status = '';
      const listFnbFlow = ['Waste Pcs To Pcs', 'Penjualan & Dispose Asset', 'Purchasing Non Supplier', 'Test Food', 'Revisi Stock Opname'];
      
      const cleanType = (r.ba_type || '').trim();
      const isFnbFlow = listFnbFlow.some(f => cleanType.includes(f));

      if (r.am_rejected_date || r.fnb_rejected_date) status = 'Rejected';
      else if (r.am_approved_date) status = 'Approved';
      else if (isFnbFlow && r.fnb_approved_date) status = 'Menunggu Approval AM';
      else if (isFnbFlow) status = 'Under FNB Review';
      else status = 'Menunggu Approval AM';

      return {
        sheetName: r.submission_id, 
        rowNumber: 0, 

        Submission_ID: r.submission_id,
        Timestamp: r.timestamp,
        Outlet: r.outlet,
        NAME: r.name,
        NIK: r.nik,
        type: cleanType,
        info: r.info || '-', // Map info ke frontend
        
        AM_Approved_Date: r.am_approved_date,
        AM_Rejected_Date: r.am_rejected_date,
        FNB_Approved_Date: r.fnb_approved_date,
        FNB_Rejected_Date: r.fnb_rejected_date,
        
        currentStatus: status
      };
    });

  } catch (e) {
    console.error(e);
    throw new Error('Data Berita Acara gagal dimuat: ' + e.message);
  }
}

// ==========================================
// 5. DATA FETCHING (DETAIL)
// ==========================================
function getSubmissionDetail(submissionId) {
  try {
    const r = getRawLatestRow(submissionId);
    if (!r) return null;

    let status = '';
    const listFnbFlow = ['Waste Pcs To Pcs', 'Penjualan & Dispose Asset', 'Purchasing Non Supplier', 'Test Food', 'Revisi Stock Opname'];
    const cleanType = (r.ba_type || '').trim();
    const isFnbFlow = listFnbFlow.some(f => cleanType.includes(f));

    if (r.am_rejected_date || r.fnb_rejected_date) status = 'Rejected';
    else if (r.am_approved_date) status = 'Approved';
    else if (isFnbFlow && r.fnb_approved_date) status = 'Menunggu Approval AM';
    else if (isFnbFlow) status = 'Under FNB Review';
    else status = 'Menunggu Approval AM';

    return {
      Submission_ID: r.submission_id,
      Timestamp: r.timestamp,
      Outlet: r.outlet,
      NAME: r.name,
      NIK: r.nik,
      type: cleanType,
      info: r.info,
      Data_JSON: r.data_json, 
      
      AM_Approved_Date: r.am_approved_date,
      AM_Approved_By: r.am_approved_by,
      AM_Rejected_Date: r.am_rejected_date,
      AM_Rejected_By: r.am_rejected_by,
      AM_Reject_Reason: r.am_reject_reason,

      FNB_Approved_Date: r.fnb_approved_date,
      FNB_Approved_By: r.fnb_approved_by,
      FNB_Rejected_Date: r.fnb_rejected_date,
      FNB_Rejected_By: r.fnb_rejected_by,
      FNB_Reject_Reason: r.fnb_reject_reason,

      currentStatus: status,
      sheetName: r.submission_id,
      rowNumber: 0
    };

  } catch (e) {
    return null;
  }
}

// ==========================================
// 6. APPROVAL ACTIONS (STRATEGI APPEND-ONLY)
// ==========================================

function approveBa(sheetName, rowNumber, approverName, approverPosition, userData) {
  const trustedUser = requireBaSession_(userData && userData.BA_SESSION);
  approverName = trustedUser.NAME;
  approverPosition = trustedUser.POSITION;
  const submissionId = sheetName; 

  const oldRow = getRawLatestRow(submissionId);
  if (!oldRow) return { success: false, message: 'Dokumen tidak ditemukan di BQ.' };

  const listFnbFlow = ['Waste Pcs To Pcs', 'Penjualan & Dispose Asset', 'Purchasing Non Supplier', 'Test Food', 'Revisi Stock Opname'];
  const cleanType = (oldRow.ba_type || '').trim();
  const isFnbFlow = listFnbFlow.some(f => cleanType.includes(f));

  const newRow = { ...oldRow };
  newRow.timestamp = (new Date()).getTime() / 1000; 

  if (approverPosition === 'FNB') {
    if (!isFnbFlow) return { success: false, message: 'Dokumen ini tidak butuh FNB.' };
    newRow.fnb_approved_date = new Date().toISOString();
    newRow.fnb_approved_by = approverName;
    newRow.fnb_rejected_date = null; 
  } 
  else if (approverPosition === 'AREA MANAGER') {
    if (isFnbFlow && !oldRow.fnb_approved_date) {
      return { success: false, message: 'Harus disetujui FNB terlebih dahulu.' };
    }
    newRow.am_approved_date = new Date().toISOString();
    newRow.am_approved_by = approverName;
    newRow.am_rejected_date = null;
  }
  else {
    return { success: false, message: 'Posisi tidak valid.' };
  }

  try {
    insertToBq(newRow);
    return { success: true, message: 'Berhasil Disetujui (BQ)!' };
  } catch (e) {
    return { success: false, message: "Error BQ: " + e.message };
  }
}

function rejectBa(sheetName, rowNumber, approverName, approverPosition, reason, userData) {
  const trustedUser = requireBaSession_(userData && userData.BA_SESSION);
  approverName = trustedUser.NAME;
  approverPosition = trustedUser.POSITION;
  const submissionId = sheetName;
  const oldRow = getRawLatestRow(submissionId);
  if (!oldRow) return { success: false, message: 'Dokumen tidak ditemukan.' };

  const newRow = { ...oldRow };
  newRow.timestamp = (new Date()).getTime() / 1000;

  if (approverPosition === 'FNB') {
    newRow.fnb_rejected_date = new Date().toISOString();
    newRow.fnb_rejected_by = approverName;
    newRow.fnb_reject_reason = reason;
    newRow.fnb_approved_date = null;
  } 
  else if (approverPosition === 'AREA MANAGER') {
    newRow.am_rejected_date = new Date().toISOString();
    newRow.am_rejected_by = approverName;
    newRow.am_reject_reason = reason;
    newRow.am_approved_date = null;
  }
  else {
    return { success: false, message: 'Posisi tidak valid.' };
  }

  try {
    insertToBq(newRow);
    return { success: true, message: 'Berhasil Ditolak (BQ)!' };
  } catch (e) {
    return { success: false, message: "Error BQ: " + e.message };
  }
}
