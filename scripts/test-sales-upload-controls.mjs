import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('docs/Code.gs', 'utf8');
function harness(initialJob) {
  const values = new Map([['sales-cogs-upload-job-J', JSON.stringify(initialJob)]]);
  const properties = {
    getProperty: key => values.get(key) || null,
    setProperty: (key, value) => values.set(key, value),
    deleteProperty: key => values.delete(key),
    getProperties: () => Object.fromEntries(values)
  };
  const lock = { waitLock() {}, releaseLock() {} };
  const ctx = { console: { log() {}, error() {}, warn() {} }, PropertiesService: { getScriptProperties: () => properties },
    LockService: { getUserLock: () => lock }, acquireStockScopeLock_: () => lock,
    requireSession_: () => ({ nik: 'N' }), findEmployee_: () => ({ nik: 'N', outlet: 'BIMC' }),
    assertEmployeeActive_() {}, stockUploadJobEmployee_() {}, cleanText_: value => String(value),
    scheduleSalesCogsWorker_: () => true, ScriptApp: { getProjectTriggers: () => [] } };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  Object.assign(ctx, { acquireStockScopeLock_: () => lock,
    requireSession_: () => ({ nik: 'N' }), findEmployee_: () => ({ nik: 'N', outlet: 'BIMC' }),
    assertEmployeeActive_() {}, stockUploadJobEmployee_() {}, cleanText_: value => String(value),
    scheduleSalesCogsWorker_: () => true });
  return { ctx, values, job: () => JSON.parse(values.get('sales-cogs-upload-job-J')) };
}

const original = { jobId: 'J', ownerNik: 'N', ownerOutlet: 'BIMC', sourceHash: 'H',
  sourceFileName: 'sales.xlsx', status: 'PROCESSING', progress: 44, processed: 6843,
  total: 19419, preparedDriveId: 'PREPARED', pendingDriveId: 'PENDING',
  workerLeaseUntil: 0, createdAt: '2026-11-01T00:00:00Z' };

const idle = harness(original);
const stopped = idle.ctx.cancelSalesCogsUpload('T', 'J');
assert.equal(stopped.ok, true);
assert.equal(stopped.data.status, 'CANCELLED');
assert.equal(idle.job().processed, 6843);
assert.equal(idle.job().pendingDriveId, 'PENDING', 'the exact pending batch is retained');
assert.equal(idle.values.has('sales-cogs-cancel-J'), false);
assert.match(idle.job().stage, /Transaksi yang sudah tersimpan tetap berlaku/);
const resumed = idle.ctx.retryStockUpload('T', 'J', 'USAGE');
assert.equal(resumed.ok, true);
assert.equal(idle.job().status, 'QUEUED');
assert.equal(idle.job().processed, 6843);
assert.equal(idle.job().pendingDriveId, 'PENDING');

const reupload = harness({ ...original, status: 'CANCELLED' });
reupload.ctx.Utilities = { base64Decode: () => [80, 75], base64Encode: () => 'bytes' };
reupload.ctx.digest_ = () => 'H';
reupload.ctx.DriveApp = { createFile: () => assert.fail('a duplicate workbook must not create a fresh job') };
const sameFile = reupload.ctx.queueSalesCogsUpload('T', { fileName: 'sales.xlsx', base64: 'bytes' });
assert.equal(sameFile.ok, true);
assert.equal(sameFile.data.jobId, 'J');
assert.equal(reupload.job().status, 'QUEUED');
assert.equal(reupload.job().processed, 6843);
const failedReupload = harness({ ...original, status: 'FAILED' });
failedReupload.ctx.Utilities = reupload.ctx.Utilities;
failedReupload.ctx.digest_ = () => 'H';
failedReupload.ctx.DriveApp = reupload.ctx.DriveApp;
assert.equal(failedReupload.ctx.queueSalesCogsUpload('T', { fileName: 'sales.xlsx', base64: 'bytes' }).ok, false);
assert.equal(failedReupload.job().status, 'FAILED');

const active = harness({ ...original, workerLeaseUntil: Date.now() + 300000 });
const requested = active.ctx.cancelSalesCogsUpload('T', 'J');
assert.equal(requested.ok, true);
assert.equal(requested.data.cancelRequested, true);
assert.equal(active.job().status, 'PROCESSING', 'the active batch is not interrupted mid-write');
assert.equal(active.values.has('sales-cogs-cancel-J'), true);
active.values.set('sales-cogs-upload-job-J', JSON.stringify({ ...active.job(), workerLeaseUntil: 0 }));
let chunks = 0;
active.ctx.processSalesCogsJobChunk_ = () => { chunks++; throw Error('should not run'); };
const worker = active.ctx.processSalesCogsUploadJobs('J');
assert.equal(worker.status, 'CANCELLED');
assert.equal(chunks, 0, 'a pending stop is observed before the next batch');
assert.equal(active.job().processed, 6843);
assert.equal(active.values.has('sales-cogs-cancel-J'), false);

const other = harness(original);
other.ctx.requireSession_ = () => ({ nik: 'OTHER' });
other.ctx.findEmployee_ = () => ({ nik: 'OTHER', outlet: 'BIMC' });
assert.equal(other.ctx.cancelSalesCogsUpload('T', 'J').ok, false);
assert.equal(other.job().status, 'PROCESSING');

const uiSource = fs.readFileSync('docs/stock-upload-jobs.js', 'utf8');
const begin = uiSource.indexOf('function goodsUploadStatusLabel(');
const end = uiSource.indexOf('function refreshGoodsUploadStatus(', begin);
const elements = new Map();
const element = id => { if (!elements.has(id)) elements.set(id, {
  classList: { toggle() {} }, innerHTML: '', textContent: ''
}); return elements.get(id); };
const ui = { APP: { token: 'T' }, GOODS_UPLOAD_PANEL: { jobs: [] }, STOCK_UPLOAD_STARTS: {},
  byId: element, escapeAttr: value => String(value), escapeHtml: value => String(value) };
vm.createContext(ui); vm.runInContext(uiSource.slice(begin, end), ui);
ui.renderGoodsUploadStatus([{ ...original, engine: 'USAGE', type: 'SALES_USAGE', fileName: 'sales.xlsx', outlet: 'BIMC', location: 'Store', updatedAt: original.createdAt }]);
assert.match(element('goodsUploadStatusRows').innerHTML, /Lanjutkan Sekarang/);
assert.match(element('goodsUploadStatusRows').innerHTML, /Hentikan Sisa/);
ui.renderGoodsUploadStatus([{ ...original, engine: 'USAGE', type: 'SALES_USAGE', status: 'CANCELLED', canRetry: true, fileName: 'sales.xlsx', outlet: 'BIMC', location: 'Store', updatedAt: original.createdAt }]);
assert.match(element('goodsUploadStatusRows').innerHTML, /Lanjutkan/);
assert.match(fs.readFileSync('docs/stock-card.html', 'utf8'), /Status Upload<\/button><button class="btn btn-light" type="button" onclick="closeUsageModal\(\)">Tutup/);
console.log('Sales COGS controls: owner-only stop, batch-safe cancellation, checkpoint resume, and visible status actions passed.');
