/* Goods uploads run on the server after acceptance; this panel only reads status. */
var GOODS_UPLOAD_PANEL = { timer: null, loading: false, jobs: [], generation: 0 };
function goodsUploadRequestId(state) {
  if (!state.requestId) state.requestId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : 'goods-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  return state.requestId;
}
function queueGoodsUploadFromForm(kind) {
  var key = kind === 'GOODS_DELIVERY' ? 'goodsDelivery' : 'goodsReceipt', state = APP[key];
  if (!state.verified || !state.base64 || state.uploading) return;
  var delivery = kind === 'GOODS_DELIVERY', progress = delivery ? setGoodsDeliveryProgress : setGoodsReceiptProgress;
  var payload = delivery ? goodsDeliveryPayload() : goodsReceiptPayload();
  if (key === 'wip') { payload.fileName = state.upload.fileName; payload.base64 = state.upload.base64; if (state.backgroundContext) { payload.outlet = state.backgroundContext.outlet; payload.location = state.backgroundContext.location; } }
  payload.type = kind; payload.requestId = goodsUploadRequestId(state);
  state.uploading = true;
  byId(delivery ? 'confirmGoodsDeliveryUpload' : 'confirmGoodsReceiptUpload').disabled = true;
  byId(delivery ? 'chooseGoodsDeliveryFile' : 'chooseGoodsReceiptFile').disabled = true;
  progress(10, 'Mengirim file ke proses background. Tunggu konfirmasi file diterima.', 'MENGIRIM');
  BAKERZIN_API.call('queueGoodsUpload', [APP.token, payload]).then(function (response) {
    if (!response || !response.ok) throw new Error(response && response.error || 'File belum dapat diterima.');
    state.uploading = false;
    progress(100, 'File diterima. Proses berjalan di background.', 'DITERIMA');
    if (delivery) closeGoodsDeliveryModal(); else closeGoodsReceiptModal();
    toast('File diterima. Kamu bisa lanjut aktivitas. Pantau lewat Status Upload.');
    refreshGoodsUploadStatus();
  }).catch(function (error) {
    // Keep this request ID and file: acceptance retries return the existing server job.
    state.uploading = false;
    byId(delivery ? 'confirmGoodsDeliveryUpload' : 'confirmGoodsReceiptUpload').disabled = false;
    byId(delivery ? 'chooseGoodsDeliveryFile' : 'chooseGoodsReceiptFile').disabled = false;
    var box = byId(key + 'ErrorBox'); box.classList.remove('hidden');
    byId(key + 'ErrorMessage').textContent = error.message + ' Periksa Status Upload atau klik Upload lagi untuk mengonfirmasi permintaan yang sama.';
    progress(10, 'Penerimaan file belum terkonfirmasi.', 'PERIKSA STATUS');
    refreshGoodsUploadStatus();
  });
}
function openGoodsUploadStatus() {
  byId('goodsUploadStatusModal').classList.remove('hidden');
  byId('goodsUploadStatusClose').focus(); refreshGoodsUploadStatus();
}
function closeGoodsUploadStatus() {
  byId('goodsUploadStatusModal').classList.add('hidden'); clearTimeout(GOODS_UPLOAD_PANEL.timer);
  byId('goodsUploadStatusButton').focus();
}
function goodsUploadStatusLabel(status) {
  return { QUEUED: 'Diproses', PREPARING: 'Memeriksa', PROCESSING: 'Diproses', COMPLETE: 'Selesai', ACTION_REQUIRED: 'Perlu Tindakan', FAILED: 'Gagal' }[status] || status;
}
function renderGoodsUploadStatus(jobs) {
  GOODS_UPLOAD_PANEL.jobs = jobs;
  var active = jobs.filter(function (job) { return ['QUEUED', 'PREPARING', 'PROCESSING'].indexOf(job.status) >= 0; }).length;
  var attention = jobs.filter(function (job) { return ['ACTION_REQUIRED', 'FAILED'].indexOf(job.status) >= 0; }).length;
  byId('goodsUploadStatusBadge').textContent = active || attention || '';
  byId('goodsUploadStatusBadge').classList.toggle('hidden', !active && !attention);
  byId('goodsUploadStatusRows').innerHTML = jobs.length ? jobs.map(function (job) {
    var progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
    var action = job.engine && job.engine !== 'GOODS' && job.status === 'FAILED' ? '<button class="btn btn-light btn-small" data-stock-open="' + escapeAttr(job.type) + '">Pilih Ulang File</button>' : job.status === 'ACTION_REQUIRED' ? '<button class="btn btn-light btn-small" data-goods-review="' + escapeAttr(job.jobId) + '">Tinjau</button>' :
      job.status === 'FAILED' ? '<button class="btn btn-primary btn-small" data-goods-retry="' + escapeAttr(job.jobId) + '">Coba Lagi</button>' : '';
    return '<article class="goods-job"><div class="goods-job-heading"><strong>' + escapeHtml(job.fileName) + '</strong><span class="goods-job-status ' + (job.status === 'COMPLETE' ? 'done' : '') + '">' + escapeHtml(goodsUploadStatusLabel(job.status)) + '</span></div>' +
      '<p>' + ({WIP_PRODUCTION:'Produksi WIP',TRANSACTION_REPAIR:'Repair Upload Lama',GOODS_DELIVERY:'Goods Delivery',GOODS_RECEIPT:'Goods Receipt',ITEM_JOURNAL:'Item Journal',STOCK_OPNAME:'Stock Opname',BIHQ_GOODS_DELIVERY:'Batch Goods Delivery',BIHQ_GOODS_RECEIPT:'Batch Goods Receipt',SALES_USAGE:'Usage Penjualan',STOCK_POSITION:'Stock Posisi',EXPIRY:'Expired Date'}[job.type] || job.type) + ' · ' + escapeHtml(job.outlet) + ' · ' + escapeHtml(job.location) + '</p>' +
      '<div class="goods-job-progress" role="progressbar" aria-label="Progres upload" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '"><span style="width:' + progress + '%"></span></div>' +
      '<p>' + progress + '% · ' + escapeHtml(job.stage) + '</p>' + (job.error ? '<p class="goods-job-error">' + escapeHtml(job.error) + '</p>' : '') +
      '<div class="goods-job-footer"><small>' + escapeHtml(new Date(job.createdAt).toLocaleString('id-ID')) + '</small>' + action + '</div></article>';
  }).join('') : '<div class="empty"><strong>Belum ada upload background.</strong><p>Semua upload Stock Card yang dikirim akan tampil di sini.</p></div>';
}
function refreshGoodsUploadStatus() {
  if (!APP.token || GOODS_UPLOAD_PANEL.loading) return;
  clearTimeout(GOODS_UPLOAD_PANEL.timer); GOODS_UPLOAD_PANEL.loading = true;
  byId('goodsUploadStatusMessage').textContent = 'Memuat status...';
  BAKERZIN_API.call('goodsUploadStatus', [APP.token]).then(function (response) {
    if (!response || !response.ok) throw new Error(response && response.error || 'Status belum dapat dibaca.');
    var previous = GOODS_UPLOAD_PANEL.jobs;
    renderGoodsUploadStatus(response.data.jobs || []);
    var completed = GOODS_UPLOAD_PANEL.jobs.some(function (job) { return job.status === 'COMPLETE' && previous.some(function (old) { return old.jobId === job.jobId && old.status !== 'COMPLETE'; }); });
    if (completed) {
      clearStockHistoryBrowserCache(); APP.locationCache = {};
      if (APP.outlet) loadData(APP.location);
      toast('Upload background selesai. Stock Card diperbarui.');
    }
    byId('goodsUploadStatusMessage').textContent = 'Status tersimpan di server. Proses tetap berjalan ketika halaman ditutup.';
  }).catch(function (error) { byId('goodsUploadStatusMessage').textContent = error.message + ' Klik Perbarui untuk mencoba lagi. Proses server tetap berjalan.'; })
    .finally(function () {
      GOODS_UPLOAD_PANEL.loading = false;
      if (!byId('goodsUploadStatusModal').classList.contains('hidden')) GOODS_UPLOAD_PANEL.timer = setTimeout(refreshGoodsUploadStatus, 15000);
    });
}
function retryGoodsUploadJob(id) {
  BAKERZIN_API.call('retryGoodsUpload', [APP.token, id]).then(function (response) {
    if (!response || !response.ok) throw new Error(response && response.error || 'Upload belum dapat dilanjutkan.');
    toast('Upload kembali masuk proses background.'); refreshGoodsUploadStatus();
  }).catch(function (error) { toast(error.message, true); });
}
function reviewGoodsUploadJob(id) {
  BAKERZIN_API.call('goodsUploadRequest', [APP.token, id]).then(function (response) {
    if (!response || !response.ok) throw new Error(response && response.error || 'File tidak dapat dibuka.');
    var data = response.data;
    if(data.job.type==='SHOWCASE_LOG'){window.location.href='showcaselog.html';return;}
    if (['GOODS_DELIVERY','GOODS_RECEIPT'].indexOf(data.job.type) < 0) { reviewOtherStockUpload(data); return; }
    var delivery = data.job.type === 'GOODS_DELIVERY', key = delivery ? 'goodsDelivery' : 'goodsReceipt';
    closeGoodsUploadStatus();
    if (delivery) openGoodsDeliveryModal(); else openGoodsReceiptModal();
    var state = APP[key];
    state.fileName = data.payload.fileName; state.base64 = data.payload.base64; state.requestId = data.payload.requestId;
    state.conversions = data.payload.conversions || {}; state.skipDuplicateRows = data.payload.skipDuplicateRows || []; state.allowDuplicateRows = data.payload.allowDuplicateRows || [];
    state.backgroundContext = { outlet: data.job.outlet, location: data.job.location };
    byId(key + 'Outlet').textContent = data.job.outlet; byId(key + 'Location').textContent = data.job.location;
    byId(key + 'FileName').textContent = state.fileName; byId(key + 'FileCard').classList.remove('hidden');
    if (delivery) requestGoodsDeliveryVerification(); else requestGoodsReceiptVerification();
  }).catch(function (error) { toast(error.message, true); });
}
byId('goodsUploadStatusRows').addEventListener('click', function (event) {
  var retry = event.target.closest('[data-goods-retry]'), review = event.target.closest('[data-goods-review]');
  if (retry) retryGoodsUploadJob(retry.getAttribute('data-goods-retry'));
  if (review) reviewGoodsUploadJob(review.getAttribute('data-goods-review'));
  var open = event.target.closest('[data-stock-open]'); if (open) openExistingUploadForm(open.getAttribute('data-stock-open'));
});
document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !byId('goodsUploadStatusModal').classList.contains('hidden')) closeGoodsUploadStatus(); });
window.addEventListener('focus', refreshGoodsUploadStatus);
refreshGoodsUploadStatus();

function queueOtherStockUpload(kind) {
  var key = kind === 'WIP_PRODUCTION' ? 'wip' : kind === 'TRANSACTION_REPAIR' ? 'salesRepair' : kind === 'ITEM_JOURNAL' ? 'itemJournal' : kind === 'STOCK_OPNAME' ? 'stockOpname' : 'bihqBatch';
  var state = APP[key]; if (!state || !state.verified || state.uploading) return;
  var payload = key === 'wip' ? wipProductionPayload() : key === 'salesRepair' ? salesRepairPayload() : key === 'itemJournal' ? itemJournalPayload() : key === 'stockOpname' ? stockOpnamePayload() : bihqBatchPayload();
  if (key === 'wip') { payload.fileName = state.upload.fileName; payload.base64 = state.upload.base64; if (state.backgroundContext) { payload.outlet = state.backgroundContext.outlet; payload.location = state.backgroundContext.location; } }
  payload.type = kind; payload.requestId = goodsUploadRequestId(state);
  var button = byId(key === 'wip' ? 'processWipProduction' : key === 'salesRepair' ? 'executeSalesRepairButton' : key === 'itemJournal' ? 'submitItemJournal' : key === 'stockOpname' ? 'confirmStockOpnameUpload' : 'uploadBihqBatchButton');
  state.uploading = true; button.disabled = true;
  toast('Mengirim file. Tunggu konfirmasi File diterima.');
  BAKERZIN_API.call('queueGoodsUpload', [APP.token, payload]).then(function (response) {
    if (!response || !response.ok) throw new Error(response && response.error || 'Penerimaan file belum terkonfirmasi.');
    state.uploading = false;
    if (key === 'wip') closeWipProductionModal(); else if (key === 'salesRepair') closeSalesRepairModal(); else if (key === 'itemJournal') closeItemJournalModal(); else if (key === 'stockOpname') closeStockOpnameModal(); else closeBihqBatchModal();
    toast('File diterima. Proses berjalan di background. Pantau Status Upload.'); refreshGoodsUploadStatus();
  }).catch(function (error) {
    state.uploading = false; button.disabled = false;
    toast(error.message + ' Periksa Status Upload atau kirim ulang permintaan yang sama.', true); refreshGoodsUploadStatus();
  });
}
function reviewOtherStockUpload(data) {
  var type = data.job.type, payload = data.payload, state;
  closeGoodsUploadStatus();
  if (type === 'WIP_PRODUCTION') {
    openWipProductionModal(); state = APP.wip; state.backgroundContext = { outlet: data.job.outlet, location: data.job.location };
    state.upload = { fileName: payload.fileName, base64: payload.base64, sourceHash: payload.sourceHash }; state.lines = payload.lines.map(function (line) { return Object.assign({ name: line.code, stockUnit: line.unit, units: [line.unit] }, line); }); state.requestId = payload.requestId; state.conversions = payload.conversions || {};
    byId('wipEventDate').value = payload.eventDate; renderWipProductionLines(); return;
  } else if (type === 'TRANSACTION_REPAIR') {
    openSalesRepairModal(); state = APP.salesRepair; byId('salesRepairType').value = payload.repairType;
    state.fileName = payload.fileName; state.base64 = payload.base64; state.requestId = payload.requestId; previewSalesRepair(); return;
  } else if (type === 'ITEM_JOURNAL') {
    openItemJournalModal(); state = APP.itemJournal;
  } else if (type === 'STOCK_OPNAME') {
    openStockOpnameModal(); state = APP.stockOpname; state.backgroundContext = { location: data.job.location }; byId('stockOpnameDate').value = payload.eventDate;
    byId('stockOpnameFileCard').classList.remove('hidden'); byId('stockOpnameFileName').textContent = payload.fileName;
  } else {
    openBihqBatchModal(type.slice(5)); state = APP.bihqBatch;
    byId('bihqBatchLocation').value = payload.location;
  }
  state.fileName = payload.fileName; state.base64 = payload.base64; state.requestId = payload.requestId; state.conversions = payload.conversions || {};
  if (type === 'ITEM_JOURNAL') verifyItemJournalUpload(); else if (type === 'STOCK_OPNAME') requestStockOpnameVerification(); else verifyBihqBatch();
}
function openExistingUploadForm(type) {
  closeGoodsUploadStatus();
  if (type === 'SALES_USAGE') openUsageModal(); else if (type === 'STOCK_POSITION') openStockPositionModal(); else openExpiryAlertModal('MISSING');
}

function queueWipFileUpload() {
  var state = APP.wip;
  if (state.uploading) return;
  var payload = wipProductionPayload();
  payload.fileName = state.upload.fileName; payload.base64 = state.upload.base64;
  if (state.backgroundContext) { payload.outlet = state.backgroundContext.outlet; payload.location = state.backgroundContext.location; }
  byId('processWipProduction').disabled = true;
  server('wipUploadPreview', [APP.token, payload], function (data) {
    byId('processWipProduction').disabled = false;
    if (data.requiresConversion) { state.pendingConversions = data.conversions || []; openWipConversionPopup(); return; }
    state.verified = true; queueOtherStockUpload('WIP_PRODUCTION');
  }, { onError: function (message) { byId('processWipProduction').disabled = false; wipProductionError(message); } });
}
