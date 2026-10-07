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
  payload.type = kind; payload.requestId = goodsUploadRequestId(state);
  state.uploading = true;
  byId(delivery ? 'confirmGoodsDeliveryUpload' : 'confirmGoodsReceiptUpload').disabled = true;
  byId(delivery ? 'chooseGoodsDeliveryFile' : 'chooseGoodsReceiptFile').disabled = true;
  progress(10, 'Mengirim file ke antrean. Tunggu konfirmasi file diterima.', 'MENGIRIM');
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
  return { QUEUED: 'Menunggu', PREPARING: 'Memeriksa', PROCESSING: 'Diproses', COMPLETE: 'Selesai', ACTION_REQUIRED: 'Perlu Tindakan', FAILED: 'Gagal' }[status] || status;
}
function renderGoodsUploadStatus(jobs) {
  GOODS_UPLOAD_PANEL.jobs = jobs;
  var active = jobs.filter(function (job) { return ['QUEUED', 'PREPARING', 'PROCESSING'].indexOf(job.status) >= 0; }).length;
  var attention = jobs.filter(function (job) { return ['ACTION_REQUIRED', 'FAILED'].indexOf(job.status) >= 0; }).length;
  byId('goodsUploadStatusBadge').textContent = active || attention || '';
  byId('goodsUploadStatusBadge').classList.toggle('hidden', !active && !attention);
  byId('goodsUploadStatusRows').innerHTML = jobs.length ? jobs.map(function (job) {
    var progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
    var action = job.status === 'ACTION_REQUIRED' ? '<button class="btn btn-light btn-small" data-goods-review="' + escapeAttr(job.jobId) + '">Tinjau</button>' :
      job.status === 'FAILED' ? '<button class="btn btn-primary btn-small" data-goods-retry="' + escapeAttr(job.jobId) + '">Coba Lagi</button>' : '';
    return '<article class="goods-job"><div class="goods-job-heading"><strong>' + escapeHtml(job.fileName) + '</strong><span class="goods-job-status ' + (job.status === 'COMPLETE' ? 'done' : '') + '">' + escapeHtml(goodsUploadStatusLabel(job.status)) + '</span></div>' +
      '<p>' + (job.type === 'GOODS_DELIVERY' ? 'Goods Delivery' : 'Goods Receipt') + ' · ' + escapeHtml(job.outlet) + ' · ' + escapeHtml(job.location) + '</p>' +
      '<div class="goods-job-progress" role="progressbar" aria-label="Progres upload" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '"><span style="width:' + progress + '%"></span></div>' +
      '<p>' + progress + '% · ' + escapeHtml(job.stage) + '</p>' + (job.error ? '<p class="goods-job-error">' + escapeHtml(job.error) + '</p>' : '') +
      '<div class="goods-job-footer"><small>' + escapeHtml(new Date(job.createdAt).toLocaleString('id-ID')) + '</small>' + action + '</div></article>';
  }).join('') : '<div class="empty"><strong>Belum ada upload background.</strong><p>Goods Delivery dan Goods Receipt yang dikirim akan tampil di sini.</p></div>';
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
    toast('Upload kembali masuk antrean.'); refreshGoodsUploadStatus();
  }).catch(function (error) { toast(error.message, true); });
}
function reviewGoodsUploadJob(id) {
  BAKERZIN_API.call('goodsUploadRequest', [APP.token, id]).then(function (response) {
    if (!response || !response.ok) throw new Error(response && response.error || 'File tidak dapat dibuka.');
    var data = response.data, delivery = data.job.type === 'GOODS_DELIVERY', key = delivery ? 'goodsDelivery' : 'goodsReceipt';
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
});
document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !byId('goodsUploadStatusModal').classList.contains('hidden')) closeGoodsUploadStatus(); });
window.addEventListener('focus', refreshGoodsUploadStatus);
refreshGoodsUploadStatus();
