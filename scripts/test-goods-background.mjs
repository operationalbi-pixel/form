import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile('docs/Code.gs', 'utf8');
const properties = new Map(), jobRecords = new Map(), files = new Map(), stock = new Map(), transfers = new Map();
let metadataInterrupted=false, fileSequence = 0, buildCount = 0, busy = false, interrupted = false, owner = 'N1', lease = false;
const context = vm.createContext({ console });
vm.runInContext(source, context);
const jobList = () => [...jobRecords.values()].map(value=>JSON.parse(value));
const lock = { waitLock() {}, tryLock: () => true, releaseLock() {} };
const propApi = { getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value), deleteProperty: key => properties.delete(key), getProperties: () => Object.fromEntries(properties) };
const driveFile = (id, blob) => ({ getId: () => id, getBlob: () => ({ getDataAsString: () => blob.value, getBytes: () => blob.value }), setTrashed: () => files.delete(id) });
Object.assign(context, {
  safe_: fn => { try { return { ok: true, data: fn() }; } catch (error) { return { ok: false, error: error.message }; } },
  cleanText_: value => String(value || ''), digest_: value => createHash('sha256').update(String(value)).digest('hex'),
  resolveStockContext_: (_token, outlet, location) => ({ employee: { nik: owner, outlet: 'BIMC', name: 'Staff' }, outlet, location }),
  requireSession_: () => ({ nik: owner }), findEmployee_: nik => ({ nik, outlet: 'BIMC', name: 'Staff' }), assertEmployeeActive_() {},
  readStockLocations_: () => ['Store'], ensureStockMaintenanceTrigger_() {},
  cloudflareInventoryRequest_: (method,path,payload) => {
    if(method==='GET'){const id=new URL('https://test'+path).searchParams.get('record_id');return {data:jobRecords.has(id)?[JSON.parse(jobRecords.get(id))]:[]};}
    if(method==='POST'){payload.rows.forEach(row=>jobRecords.set(row.insertId,JSON.stringify(row.json)));if(metadataInterrupted){metadataInterrupted=false;throw new Error('Cloudflare HTTP 503 after metadata commit');}return {confirmed:payload.rows.length};}
    if(method==='DELETE'){jobRecords.delete(new URL('https://test'+path).searchParams.get('record_id'));return {ok:true};}
    throw new Error('Unexpected request');
  },
  cloudflareReadAllPages_: (path,params) => {assert.equal(params.table,'background_upload_jobs');return jobList().filter(job=>!params.active||['QUEUED','PREPARING','PROCESSING'].includes(job.status));},
  PropertiesService: { getScriptProperties: () => propApi }, LockService: { getUserLock: () => lock },
  Utilities: { base64Decode: () => [80, 75, 10], base64Encode: () => 'UEsK', newBlob: (value, type, name) => ({ value, type, name, getBytes:()=>Array.from(Buffer.from(String(value))) }) },
  DriveApp: { createFile: blob => { const id = 'f' + ++fileSequence; const file = driveFile(id, blob); files.set(id, file); return file; }, getFileById: id => { assert.ok(files.has(id), 'Durable file exists'); return files.get(id); } },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased() { return this; }, after() { return this; }, create() {} }), deleteTrigger() {} },
  acquireStockWriteLock_: () => { if (busy) throw new Error('Sistem sedang menyimpan transaksi lain. Silakan coba lagi; data Anda belum disimpan.'); return lock; },
  appendOrActivateStockMasterItems_() {}, notifyPendingStockTransfers_() {},
  buildGoodsDeliveryPlan_: () => {
    buildCount++;
    return { masterChanges: [], stockRows: [{ json: { record_id: 'stock-' + buildCount } }], pendingRows: [{ json: { event_id: 'transfer-' + buildCount } }], result: { uploaded: true } };
  },
  buildGoodsReceiptPlan_: () => { buildCount++; return { masterChanges: [], stockRows: [{ json: { record_id: 'receipt-' + buildCount } }], pendingRows: [], result: {} }; },
  insertStockCardRows_: rows => {
    assert.ok(jobList().some(job => job.planDriveId), 'Plan is durable before stock writes');
    rows.forEach(row => stock.set(row.json.record_id, row));
    if (interrupted) { interrupted = false; throw new Error('HTTP 503 after confirmed insertion'); }
  },
  cloudflareWriteTransferEvents_: rows => rows.forEach(row => transfers.set(row.json.event_id, row))
});
const payload = { requestId: 'request-000000000001', outlet: 'BIMC', location: 'Store', type: 'GOODS_DELIVERY', fileName: 'report.xlsx', base64: 'UEsK', conversions: {} };
let queued = context.queueGoodsUpload('login', payload);
assert.equal(queued.ok, true);
assert.equal(queued.data.status, 'QUEUED');
assert.equal(stock.size, 0, 'Acceptance never writes stock');
const acceptedFiles = fileSequence;
assert.equal(context.queueGoodsUpload('login', payload).data.jobId, queued.data.jobId);
assert.equal(fileSequence, acceptedFiles, 'Lost acceptance response can safely be retried without new files or jobs');
assert.equal(context.queueGoodsUpload('login', { ...payload, requestId: 'request-000000000002' }).data.jobId, queued.data.jobId, 'Same active file is deduplicated across new requests');
assert.equal(context.queueGoodsUpload('login', { ...payload, type: 'GOODS_RECEIPT' }).ok, false, 'Request IDs cannot be repurposed');
owner = 'N2';
assert.equal(context.listGoodsUploadStatus('other').data.jobs.length, 0);
assert.equal(context.getGoodsUploadRequest('other', queued.data.jobId).ok, false);
assert.equal(context.retryGoodsUpload('other', queued.data.jobId).ok, false);
owner = 'N1';
busy = true; context.processGoodsUploadJobs(); busy = false;
assert.equal(jobList()[0].status, 'QUEUED', 'Write-lock contention is a background wait, not a rejected upload');
assert.equal(buildCount, 0);
// Worker must not use browser sessions: the tab and login can be gone.
context.requireSession_ = () => { throw new Error('Browser session expired'); };
interrupted = true; context.processGoodsUploadJobs();
assert.equal(stock.size, 1);
assert.equal(jobList()[0].status, 'QUEUED');
const persistedPlan = jobList()[0].planDriveId;
assert.ok(persistedPlan);
context.processGoodsUploadJobs();
assert.equal(jobList()[0].status, 'COMPLETE');
assert.equal(jobList()[0].progress, 100);
assert.equal(stock.size, 1, 'Recovery must reuse stock IDs after an uncertain write result');
assert.equal(transfers.size, 1);
assert.equal(buildCount, 1, 'Recovery reads saved plan; never recalculates new UUIDs or FIFO');
assert.equal(files.size, 0, 'Completed job cleans up temporary files');
context.requireSession_ = () => ({ nik: owner });
assert.equal(context.queueGoodsUpload('login', payload).data.status, 'COMPLETE', 'Acceptance replay remains idempotent after completion');

// Validation pause and resume keep the same job and original file.
const receipt = context.queueGoodsUpload('login', { ...payload, requestId: 'request-000000000003', type: 'GOODS_RECEIPT' });
const originalBuilder = context.buildGoodsReceiptPlan_;
context.buildGoodsReceiptPlan_ = () => { throw new Error('Konversi unit diperlukan.'); };
context.processGoodsUploadJobs();
let job = context.readGoodsUploadJob_(receipt.data.jobId);
assert.equal(job.status, 'ACTION_REQUIRED'); assert.equal(stock.size, 1);
assert.equal(context.getGoodsUploadRequest('login', job.jobId).data.payload.requestId, 'request-000000000003');
assert.equal(context.retryGoodsUpload('login', job.jobId).ok, false, 'Validation needs a decision, not blind retry');
const resumed = context.queueGoodsUpload('login', { ...payload, requestId: 'request-000000000003', type: 'GOODS_RECEIPT', conversions: { unit: 2 } });
assert.equal(resumed.data.jobId, job.jobId);
context.buildGoodsReceiptPlan_ = originalBuilder;
context.processGoodsUploadJobs();
assert.equal(context.readGoodsUploadJob_(job.jobId).status, 'COMPLETE');

// A lease blocks simultaneous workers and expired leases recover safely.
const next = context.queueGoodsUpload('login', { ...payload, requestId: 'request-000000000004', type: 'GOODS_RECEIPT' });
job = context.readGoodsUploadJob_(next.data.jobId); job.workerLeaseUntil = Date.now() + 100000; context.writeGoodsUploadJob_(job);
const before = stock.size; context.processGoodsUploadJobs(); assert.equal(stock.size, before);
job.workerLeaseUntil = Date.now() - 1; job.status = 'PROCESSING'; context.writeGoodsUploadJob_(job);
context.processGoodsUploadJobs(); assert.equal(context.readGoodsUploadJob_(job.jobId).status, 'COMPLETE');

// Browser status failure never cancels the server job, and a submit closes only after acceptance.
const js = await readFile('docs/stock-upload-jobs.js', 'utf8');
new vm.Script(js);
assert.match(js, /queueGoodsUpload/);
assert.match(js, /goodsUploadStatus/);
assert.match(js, /state\.requestId/);
assert.match(js, /response\.ok/);
const worker = await readFile('cloudflare/inventory-api/src/index.js', 'utf8');
assert.match(worker, /ON CONFLICT\(record_id\) DO NOTHING/);
assert.match(worker, /ON CONFLICT\(event_id\) DO NOTHING/);
console.log('Goods background acceptance, ownership, durable replay, busy waiting, intervention and lease recovery passed');

// Execute the actual write-plan builders, preserving FIFO, row IDs, and attribution.
const builders = vm.createContext({ console });
vm.runInContext(source, builders);
let uuid = 0;
const item = { code: 'ITEM', category: 'Food', name: 'Cake', unit: 'PCS' };
const prepared = { items: [{ item, qty: 3, sourceRow: 8, gdNumber: 'GD1', destinationCode: 'DEST', destinationName: 'Destination', transactionDate: '2026-10-07', originName: 'Origin' }], masterChanges: [], skippedDuplicates: [], allowedDuplicates: [], sourceItemCount: 1, fileName: 'report.xlsx' };
Object.assign(builders, { Utilities: { getUuid: () => 'uuid-' + ++uuid }, cleanText_: value => String(value), formatQty_: String,
  prepareGoodsDeliveryImport_: () => prepared, prepareGoodsReceiptImport_: () => prepared,
  allocateTransferLots_: () => [{ qty: 1, expiryDate: '2026-10-08' }, { qty: 2, expiryDate: '2026-10-09' }],
  appendGoodsDeliveryRecoveryEvents_() {} });
const ctx = { outlet: 'BIMC', location: 'Store', employee: { nik: 'N1', name: 'Staff' } };
const deliveryPlan = builders.buildGoodsDeliveryPlan_(ctx, {});
assert.equal(deliveryPlan.stockRows.length, 2);
assert.equal(deliveryPlan.pendingRows.length, 2);
assert.deepEqual(Array.from(deliveryPlan.stockRows, row => row.json.qty), [1, 2]);
assert.deepEqual(Array.from(deliveryPlan.stockRows, row => row.json.expiry_date), ['2026-10-08', '2026-10-09']);
assert.equal(deliveryPlan.stockRows[0].json.created_by, 'N1');
assert.equal(deliveryPlan.stockRows[0].json.transfer_id, deliveryPlan.pendingRows[0].json.transfer_id);
assert.equal(deliveryPlan.result.uploaded, true);
const receiptPlan = builders.buildGoodsReceiptPlan_(ctx, {});
assert.equal(receiptPlan.stockRows.length, 1);
assert.equal(receiptPlan.stockRows[0].json.direction, 'IN');
assert.equal(receiptPlan.stockRows[0].json.qty, 3);
assert.equal(receiptPlan.result.movementCount, 1);

// Execute the browser acceptance flow with a lost response and the same request ID.
const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    const classes = new Set(id === 'goodsUploadStatusModal' ? ['hidden'] : []);
    elements.set(id, { textContent: '', innerHTML: '', disabled: false, focus() {}, addEventListener() {},
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) } });
  }
  return elements.get(id);
}
let rejectAcceptance = true, closed = 0;
const submissions = [];
const browserContext = vm.createContext({
  window: { crypto: { randomUUID: () => 'browser-request-000000000001' }, addEventListener() {} }, document: { addEventListener() {} },
  APP: { token: 'login', outlet: '', goodsDelivery: { verified: true, base64: 'UEsK' }, goodsReceipt: {} },
  byId: element, clearTimeout() {}, setTimeout() {},
  escapeHtml: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'), escapeAttr: String,
  toast() {}, setGoodsDeliveryProgress() {}, setGoodsReceiptProgress() {},
  goodsDeliveryPayload: () => ({ outlet: 'BIMC', location: 'Store', fileName: 'report.xlsx', base64: 'UEsK' }),
  closeGoodsDeliveryModal: () => closed++, closeGoodsReceiptModal() {},
  BAKERZIN_API: { call: async (action, args) => {
    if (action === 'goodsUploadStatus') return { ok: true, data: { jobs: [] } };
    submissions.push(args[1]);
    if (rejectAcceptance) throw new Error('Lost acceptance response');
    return { ok: true, data: { jobId: 'job-existing', status: 'QUEUED' } };
  } }
});
vm.runInContext(js, browserContext);
await new Promise(resolve => setImmediate(resolve));
browserContext.queueGoodsUploadFromForm('GOODS_DELIVERY');
await new Promise(resolve => setImmediate(resolve));
assert.equal(closed, 0, 'Do not let the modal claim success before durable acceptance');
assert.equal(browserContext.APP.goodsDelivery.verified, true);
assert.equal(element('confirmGoodsDeliveryUpload').disabled, false);
rejectAcceptance = false;
browserContext.queueGoodsUploadFromForm('GOODS_DELIVERY');
await new Promise(resolve => setImmediate(resolve));
assert.equal(closed, 1, 'Accepted uploads release the UI so the user can continue working');
assert.equal(submissions[0].requestId, submissions[1].requestId);
browserContext.renderGoodsUploadStatus([{ jobId: 'job-1', type: 'GOODS_RECEIPT', fileName: '<script>bad</script>', outlet: 'BIMC', location: 'Store', status: 'ACTION_REQUIRED', progress: 3, error: '<img>', stage: 'Check', createdAt: new Date().toISOString() }]);
assert.ok(element('goodsUploadStatusRows').innerHTML.includes('&lt;script&gt;'));
assert.ok(!element('goodsUploadStatusRows').innerHTML.includes('<script>'));
assert.ok(element('goodsUploadStatusRows').innerHTML.includes('data-goods-review'));
assert.equal(element('goodsUploadStatusBadge').textContent, 1);
console.log('Browser acceptance confirmation, safe request replay, and status rendering passed');

// Execute the shared browser acceptance path for every newly queued upload form.
for (const [kind, key, payloadFn, closeFn] of [
  ['ITEM_JOURNAL', 'itemJournal', 'itemJournalPayload', 'closeItemJournalModal'],
  ['STOCK_OPNAME', 'stockOpname', 'stockOpnamePayload', 'closeStockOpnameModal'],
  ['BIHQ_GOODS_DELIVERY', 'bihqBatch', 'bihqBatchPayload', 'closeBihqBatchModal'],
  ['WIP_PRODUCTION', 'wip', 'wipProductionPayload', 'closeWipProductionModal'],
  ['TRANSACTION_REPAIR', 'salesRepair', 'salesRepairPayload', 'closeSalesRepairModal']
]) {
  let formClosed = 0;
  browserContext.APP[key] = { verified: true, upload: { fileName: 'source.xlsx', base64: 'UEsK' } };
  browserContext[payloadFn] = () => ({ fileName: 'source.xlsx', base64: 'UEsK' });
  browserContext[closeFn] = () => formClosed++;
  rejectAcceptance = true;
  browserContext.queueOtherStockUpload(kind); await new Promise(resolve => setImmediate(resolve));
  assert.equal(formClosed, 0, kind + ': retain form on unconfirmed acceptance');
  const request = submissions.at(-1).requestId;
  rejectAcceptance = false;
  browserContext.queueOtherStockUpload(kind); await new Promise(resolve => setImmediate(resolve));
  assert.equal(formClosed, 1, kind + ': release form after durable acceptance');
  assert.equal(submissions.at(-1).requestId, request, 'Retry keeps the same acceptance identity');
  assert.equal(submissions.at(-1).type, kind);
}
console.log('All additional upload forms confirm acceptance before releasing the UI');

// Showcase uses durable JSON requests, not an Excel source, and finishes without a browser session.
jobRecords.clear();let showcaseBuilds=0,taskCompletions=0;
Object.assign(context,{todayIso_:()=> '2026-10-08',normalizeDate_:value=>value,removeScriptCacheKeys_(){},markShowcaseLogTaskComplete_:()=>taskCompletions++,buildShowcaseSavePlan_:()=>{showcaseBuilds++;return {stockRows:[{json:{record_id:'showcase-'+showcaseBuilds}}],pendingRows:[],masterChanges:[],result:{completed:true}};}});
for(let i=0;i<301;i++)jobRecords.set('completed-'+i,JSON.stringify({jobId:'completed-'+i,ownerNik:'N1',status:'COMPLETE',createdAt:'2026-10-01T00:00:00Z'}));
const showcasePayload={requestId:'showcase-request-000001',outlet:'BIMC',eventDate:'2026-10-08',entries:[{itemCode:'MENU',inQty:2,hasInInput:true}]};
const showcase=context.queueShowcaseLog('login',showcasePayload);assert.equal(showcase.ok,true,'Existing jobs must not reject acceptance due to a queue capacity');
const showcaseFiles=fileSequence;assert.equal(context.queueShowcaseLog('login',showcasePayload).data.jobId,showcase.data.jobId);assert.equal(fileSequence,showcaseFiles);
assert.equal(context.queueShowcaseLog('login',{...showcasePayload,entries:[{itemCode:'MENU',inQty:3,hasInInput:true}]}).ok,false,'A pending request cannot be reused for different stock input');
assert.equal(context.readGoodsUploadJob_(showcase.data.jobId).sourceDriveId,undefined);
context.requireSession_=()=>{throw new Error('Browser session expired');};
busy=true;context.processGoodsUploadJobs();busy=false;assert.equal(context.readGoodsUploadJob_(showcase.data.jobId).status,'QUEUED');assert.equal(context.readGoodsUploadJob_(showcase.data.jobId).error,'');
interrupted=true;context.processGoodsUploadJobs();assert.equal(context.readGoodsUploadJob_(showcase.data.jobId).status,'QUEUED');assert.equal(taskCompletions,0);
context.processGoodsUploadJobs();assert.equal(context.readGoodsUploadJob_(showcase.data.jobId).status,'COMPLETE');assert.equal(showcaseBuilds,1);assert.equal(taskCompletions,1);
context.requireSession_=()=>({nik:owner});assert.equal(context.queueShowcaseLog('login',showcasePayload).data.status,'COMPLETE');
const needsReview=context.queueShowcaseLog('login',{...showcasePayload,requestId:'showcase-request-000002'});
const builder=context.buildShowcaseSavePlan_;context.buildShowcaseSavePlan_=()=>{throw new Error('Balance tidak cukup.');};context.processGoodsUploadJobs();
assert.equal(context.getGoodsUploadRequest('login',needsReview.data.jobId).data.payload.entries[0].inQty,2);
context.buildShowcaseSavePlan_=builder;assert.equal(context.queueShowcaseLog('login',{...showcasePayload,requestId:'showcase-request-000002',entries:[{itemCode:'MENU',inQty:1,hasInInput:true}]}).data.jobId,needsReview.data.jobId);
context.processGoodsUploadJobs();assert.equal(context.readGoodsUploadJob_(needsReview.data.jobId).status,'COMPLETE');
console.log('Showcase durable acceptance, busy recovery, complete-only task updates, expired-session execution and editable review passed');
const earlierSave=context.queueShowcaseLog('login',{...showcasePayload,requestId:'showcase-request-000003'});
const laterSave=context.queueShowcaseLog('login',{...showcasePayload,requestId:'showcase-request-000004'});
let earlierJob=context.readGoodsUploadJob_(earlierSave.data.jobId);earlierJob.createdAt='2026-10-08T01:00:00Z';earlierJob.lastWorkedAt='9999-01-01T00:00:00Z';context.writeGoodsUploadJob_(earlierJob);
let laterJob=context.readGoodsUploadJob_(laterSave.data.jobId);laterJob.createdAt='2026-10-08T02:00:00Z';context.writeGoodsUploadJob_(laterJob);
context.processGoodsUploadJobs();assert.equal(context.readGoodsUploadJob_(earlierSave.data.jobId).status,'COMPLETE');assert.equal(context.readGoodsUploadJob_(laterSave.data.jobId).status,'QUEUED','New Showcase totals cannot overtake an earlier active save');
console.log('Showcase saves preserve acceptance order within the same outlet.');

context.processGoodsUploadJobs();
metadataInterrupted=true;const uncertainRequest={...showcasePayload,requestId:'showcase-request-000005'};
assert.equal(context.queueShowcaseLog('login',uncertainRequest).ok,false);
const recovered=context.queueShowcaseLog('login',uncertainRequest);assert.equal(recovered.ok,true);
assert.ok(files.has(context.readGoodsUploadJob_(recovered.data.jobId).requestDriveId),'Lost metadata acknowledgement must not delete an accepted request');
context.processGoodsUploadJobs();assert.equal(context.readGoodsUploadJob_(recovered.data.jobId).status,'COMPLETE');
metadataInterrupted=true;const uncertainFile={...payload,requestId:'request-000000000009',type:'GOODS_RECEIPT'};
assert.equal(context.queueGoodsUpload('login',uncertainFile).ok,false);const recoveredFile=context.queueGoodsUpload('login',uncertainFile);assert.equal(recoveredFile.ok,true);
const recoveredJob=context.readGoodsUploadJob_(recoveredFile.data.jobId);assert.ok(files.has(recoveredJob.requestDriveId));assert.ok(files.has(recoveredJob.sourceDriveId));
context.processGoodsUploadJobs();assert.equal(context.readGoodsUploadJob_(recoveredFile.data.jobId).status,'COMPLETE');
console.log('Uncertain D1 metadata acknowledgement retains accepted JSON and Excel files for idempotent recovery.');
