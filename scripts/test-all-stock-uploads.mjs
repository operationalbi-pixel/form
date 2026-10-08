import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile('docs/Code.gs', 'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(source, ctx);
let uuid = 0;
const item = { code: 'ITEM', category: 'Food', name: 'Cake', unit: 'PCS' };
Object.assign(ctx, {
  Utilities: { getUuid: () => 'id-' + ++uuid }, cleanText_: value => String(value || ''), formatQty_: String,
  prepareItemJournalImport_: () => ({ fileName: 'journal.xlsx', rows: [2, -3].map(qty => ({ item, qtyDefault: qty, outlet: 'BIMC', journalNumber: 'J1', transactionDate: '2026-10-07', sourceRow: 4, rowHash: 'hash' })) })
});
const context = { employee: { nik: 'N1', outlet: 'BIHQ' }, outlet: 'BIHQ', location: 'Store' };
const journal = ctx.buildBackgroundUploadPlan_('ITEM_JOURNAL', context, {});
assert.deepEqual(Array.from(journal.stockRows, row => [row.json.direction, row.json.qty, row.json.created_by]), [['IN', 2, 'N1'], ['OUT', 3, 'N1']]);
assert.equal(new Set(journal.stockRows.map(row => row.json.record_id)).size, 2);
const line = { item, actualQty: 3, cardQty: 5, reportQty: 3, conversionFactor: 1, delta: -2, sourceRow: 4 };
const entry = { outlet: 'BIMC', auditItems: [line], items: [line], sourceItemCount: 1 };
ctx.prepareStockOpnameForEmployee_ = () => ({ employee: context.employee, newItems: [item], outlets: [entry], location: 'Kitchen', eventDate: '2026-10-07', effectiveDate: '2026-10-07', fileName: 'opname.xlsx', sourceHash: 'hash', outletCount: 1, items: [line], auditItems: [line] });
const opname = ctx.buildBackgroundUploadPlan_('STOCK_OPNAME', context, {});
assert.deepEqual(Array.from(opname.stockRows, row => row.json.record_type), ['OPNAME_DETAIL', 'MOVEMENT', 'IMPORT']);
assert.equal(opname.stockRows[1].json.direction, 'OUT'); assert.equal(opname.stockRows[1].json.qty, 2);
assert.equal(opname.stockRows[1].json.location, 'Kitchen'); assert.equal(opname.opnameMasterItems[0].code, 'ITEM');
let groupsSeen = [];
ctx.prepareBihqBatch_ = () => ({ type: 'GOODS_RECEIPT', conversions: [], groups: ['BIMC', 'BILK'].map(outlet => ({ context: { outlet }, prepared: { items: [item], outlet } })) });
ctx.buildGoodsReceiptPlan_ = (groupContext, payload, unused, prepared) => { groupsSeen.push(prepared.outlet); return { stockRows: [{ json: { outlet: groupContext.outlet } }], pendingRows: [], masterChanges: [] }; };
const batch = ctx.buildBackgroundUploadPlan_('BIHQ_GOODS_RECEIPT', context, {});
assert.deepEqual(groupsSeen, ['BIMC', 'BILK']); assert.equal(batch.stockRows.length, 2);
assert.throws(() => ctx.buildBackgroundUploadPlan_('BIHQ_GOODS_RECEIPT', { employee: { outlet: 'BIMC' } }, {}), /BIHQ/);

// Exercise each existing worker beyond its former three-retry failure limit.
for (const [prefix, worker, chunk] of [
  ['sales-cogs-upload-job-', 'processSalesCogsUploadJobs', 'processSalesCogsJobChunk_'],
  ['stock-position-upload-job-', 'processStockPositionUploadJobs', 'prepareStockPositionJob_'],
  ['expiry-upload-job-', 'processMissingExpiryUploadJobs', 'processMissingExpiryJobChunk_']
]) {
  const data = new Map();
  const properties = { getProperties: () => Object.fromEntries(data), getProperty: key => data.get(key), setProperty: (key, value) => data.set(key, value), deleteProperty: key => data.delete(key) };
  const workerCtx = vm.createContext({ console }); vm.runInContext(source, workerCtx);
  let cleaned = 0;
  Object.assign(workerCtx, {
    cloudflareReadAllPages_: () => [],
    PropertiesService: { getScriptProperties: () => properties },
    ScriptApp: { getProjectTriggers: () => [] },
    acquireStockScopeLock_: () => ({ releaseLock() {} }),
    scheduleSalesCogsWorker_() {}, scheduleStockPositionWorker_() {}, scheduleMissingExpiryWorker_() {},
    cleanupSalesCogsJobFiles_: () => cleaned++, cleanupStockPositionJobFiles_: () => cleaned++, cleanupMissingExpiryJobFiles_: () => cleaned++,
    [chunk]: () => { throw new Error('Sistem sedang menyimpan transaksi lain. Silakan coba lagi; data Anda belum disimpan.'); }
  });
  data.set(prefix + 'test', JSON.stringify({ jobId: 'test', ownerNik: 'N1', outlet: 'BIMC', location: 'Store', status: 'QUEUED', retryCount: 0, createdAt: new Date().toISOString() }));
  for (let attempt = 0; attempt < 10; attempt++) {
    workerCtx[worker]();
    const job = JSON.parse(data.get(prefix + 'test'));
    assert.equal(job.status, 'QUEUED', `${worker}: contention must keep waiting`);
    assert.equal(job.retryCount, 0, `${worker}: contention must not use retry budget`);
  }
  assert.equal(cleaned, 0, 'Queued files must be retained');
  workerCtx.requireSession_ = () => ({ nik: 'N1' }); workerCtx.findEmployee_ = () => ({ nik: 'N1' }); workerCtx.assertEmployeeActive_ = () => {};
  assert.equal(workerCtx.listGoodsUploadStatus('login').data.jobs.length, 1, 'Every worker appears in unified owner status');
  workerCtx.requireSession_ = () => ({ nik: 'N2' }); workerCtx.findEmployee_ = () => ({ nik: 'N2' });
  assert.equal(workerCtx.listGoodsUploadStatus('login').data.jobs.length, 0, 'Other owners cannot see jobs');
  if (prefix === 'stock-position-upload-job-') {
    const first = JSON.parse(data.get(prefix + 'test')); first.createdAt = '2026-10-06T01:00:00Z'; first.workerLeaseUntil = Date.now() + 60000;
    data.set(prefix + 'test', JSON.stringify(first));
    data.set(prefix + 'second', JSON.stringify({ ...first, jobId: 'second', createdAt: '2026-10-07T01:00:00Z', workerLeaseUntil: 0 }));
    assert.equal(workerCtx[worker]().processed, false, 'Later snapshots cannot overtake a leased earlier snapshot in the same scope');
  }
}
const html = await readFile('docs/stock-card.html', 'utf8');
for (const route of ["queueOtherStockUpload('STOCK_OPNAME')", "queueOtherStockUpload('ITEM_JOURNAL')", "queueOtherStockUpload('BIHQ_'", "server('queueUsageUpload'", "server('queueStockPosition'", "server('expiryUpload'"]) assert.ok(html.includes(route), route);
for (const action of ['uploadStockOpname', 'uploadItemJournal', 'uploadBihqBatch', 'uploadUsage']) assert.ok(!html.includes("server('" + action + "'"), action + ' must not block the upload UI');
console.log('All upload plans, unified private status, repeated contention, and ordered snapshot queues passed');
// Template WIP plans preserve material/output linkage without inserting rows.
Object.assign(ctx, {
  isShowcaseLocation_: () => false, wipProductionHashAlreadyImported_: () => false, normalizeDate_: value => value,
  prepareWipProductionLines_: () => ({ plans: [{ variant: { name: 'Cake', key: 'recipe', unit: 'PCS', code: 'ITEM' }, formulaQty: 1, outputItem: item, outputQty: 2, sourceRow: 4, productionDate: '2026-10-07', expiryDate: '2026-10-08', materials: [{ item: { ...item, code: 'RAW' }, qty: 3 }] }] })
});
const wip = ctx.buildBackgroundUploadPlan_('WIP_PRODUCTION', context, { sourceFile: 'wip.xlsx', sourceHash: 'hash', eventDate: '2026-10-07' });
assert.deepEqual(Array.from(wip.stockRows, row => [row.json.direction, row.json.qty]), [['IN', 2], ['OUT', 3]]);
assert.equal(wip.stockRows[0].json.transfer_id, wip.stockRows[1].json.transfer_id);
assert.equal(wip.stockRows[0].json.source_file, 'WIP_PRODUCTION|wip.xlsx');
assert.equal(wip.stockRows[0].json.expiry_date, '2026-10-08');
ctx.prepareWipProductionLines_ = () => ({ requiresConversion: true });
assert.throws(() => ctx.buildWipUploadPlan_(context, {}), /konversi/);
// Repair plans require the approved preview and keep each source row correction together.
const repairPlan = { repairToken: 'preview', changedHashes: ['h1', 'h2'], oldRows: ['h1', 'h2'].map(sourceHash => ({ sourceHash })), expectedRows: ['h1', 'h2'].map(source_hash => ({ json: { source_hash, record_id: 'corrected-' + source_hash } })) };
ctx.prepareSalesCogsRepairPlan_ = () => repairPlan; ctx.prepareItemJournalRepairPlan_ = () => repairPlan;
ctx.salesRepairVoidRow_ = row => ({ json: { record_id: 'void-' + row.sourceHash, source_hash: row.sourceHash } });
for (const repairType of ['SALES_COGS', 'ITEM_JOURNAL']) {
  const repair = ctx.buildBackgroundUploadPlan_('TRANSACTION_REPAIR', context, { repairType, repairToken: 'preview' });
  assert.deepEqual(Array.from(repair.stockRows, row => row.json.record_id), ['void-h1', 'corrected-h1', 'void-h2', 'corrected-h2']);
  assert.deepEqual(Array.from(repair.batchEnds), [2, 4]);
  assert.throws(() => ctx.buildRepairUploadPlan_(context, { repairType, repairToken: 'stale' }), /preview/);
}
assert.ok(html.includes("queueOtherStockUpload('TRANSACTION_REPAIR')"));
assert.ok(html.includes('queueWipFileUpload();return'));
assert.ok(!html.includes("server('repairTransactionConversions'"));
console.log('Template WIP linkage and approved grouped repair plans passed');
