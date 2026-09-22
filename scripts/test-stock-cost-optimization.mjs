import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('docs/Code.gs', 'utf8');
const context = vm.createContext({ console, Date, JSON, Math, Number, String, Boolean, Object, Array, RegExp, isFinite });
new vm.Script(source, { filename: 'docs/Code.gs#cost-optimization' }).runInContext(context);

assert.equal(vm.runInContext('normalizeStockHistoryPageDays_(3)', context), 5);
assert.equal(vm.runInContext('normalizeStockHistoryPageDays_(12)', context), 12);
assert.equal(vm.runInContext('normalizeStockHistoryPageDays_(99)', context), 31);

const checkpoint = vm.runInContext(`stockCheckpointBalanceUntil_([
  {date:'2026-09-01',direction:'IN',qty:10,movementType:'Opening Stock',createdAt:'2026-09-01T01:00:00Z'},
  {date:'2026-09-02',direction:'OUT',qty:2,movementType:'Sold',createdAt:'2026-09-02T01:00:00Z'},
  {date:'2026-09-03',direction:'IN',qty:0,movementType:'Stock Opname',opnameBalance:5,opnameDate:'2026-09-03',createdAt:'2026-09-03T01:00:00Z'},
  {date:'2026-09-04',direction:'IN',qty:3,movementType:'Goods Receipt',createdAt:'2026-09-04T01:00:00Z'}
], '')`, context);
assert.equal(checkpoint, 8, 'Stock Opname must remain the authoritative checkpoint');

const mapped = vm.runInContext(`applyStockHistoryAuditRows_([
  {recordType:'MOVEMENT',recordId:'m1',logicalId:'m1',movementType:'Stock Opname',date:'2026-09-12',sourceHash:'h',sourceRow:7,createdAt:'2026-09-12T01:00:00Z'},
  {recordType:'OPNAME_DETAIL',recordId:'a1',movementType:'',sourceHash:'h',sourceRow:7,opnameBalance:3,opnameDate:'2026-09-08',createdAt:'2026-09-12T01:01:00Z'}
])`, context);
assert.equal(mapped.length, 1);
assert.equal(mapped[0].date, '2026-09-08', 'Effective Stock Opname date must be preserved');
assert.equal(mapped[0].opnameBalance, 3);

assert.deepEqual(
  JSON.parse(JSON.stringify(vm.runInContext(`parseStockSummaryJson_('[{"qty":2}]', [])`, context))),
  [{ qty: 2 }]
);
assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext(`parseStockSummaryJson_('broken', [])`, context))), []);

vm.runInContext(`digest_ = function(value) { return String(value).replace(/[^A-Za-z0-9]/g, '').padEnd(48, 'x'); }`, context);
assert.equal(vm.runInContext(`Object.keys(stockBalanceUnsafeScopeMap_([
  {json:{record_type:'MOVEMENT',outlet:'BICB',location:'Store',movement_type:'Goods Receipt',version:1}}
])).length`, context), 0, 'Normal movements must stay on the incremental path');
assert.equal(vm.runInContext(`Object.keys(stockBalanceUnsafeScopeMap_([
  {json:{record_type:'MOVEMENT',outlet:'BICB',location:'Store',movement_type:'Stock Opname',version:1}},
  {json:{record_type:'MOVEMENT',outlet:'BICB',location:'Store',movement_type:'Sold',version:2}}
])).length`, context), 1, 'Stock Opname and corrected versions must share one full-rebuild scope');

const backfillStart = source.indexOf('function backfillStockItemSummaries()');
const backfillEnd = source.indexOf('/** Refreshes compact balances', backfillStart);
const backfillSource = source.slice(backfillStart, backfillEnd);
assert.match(backfillSource, /stock_item_summary_backfill_queue/, 'Backfill must use the compact BigQuery queue');
assert.match(backfillSource, /STOCK_ITEM_SUMMARY_BACKFILL_CURSOR_V1/, 'Backfill must advance with one cursor');
assert.match(backfillSource, /GROUP BY 1, 2, 3, 4\) AS grouped/, 'Cursor must be calculated after grouping the stock identities');
assert.doesNotMatch(backfillSource, /setProperties\(updates/, 'Backfill must not create one Script Property per stock item');

assert.match(source, /ensureBigQueryTable_\('stock_summary_jobs'/, 'Persistent summary queue must live in BigQuery');
const pendingJobStart = source.indexOf('function stockPendingSummaryJobs_(');
const pendingJobEnd = source.indexOf('function acknowledgeStockSummaryJob_(', pendingJobStart);
const pendingJobSource = source.slice(pendingJobStart, pendingJobEnd);
assert.match(pendingJobSource, /FORMAT_TIMESTAMP\(\\'%Y-%m-%d %H:%M:%E6S\\', pending_through, \\'UTC\\'\)/,
  'ACK timestamps must be UTC without the +00 suffix rejected by BigQuery insertAll, preserving microseconds');
assert.doesNotMatch(pendingJobSource, /CAST\(pending_through AS STRING\)/,
  'Do not pass BigQuery CAST timestamps with +00 into the ACK insert');
assert.match(source, /function applyStockBalanceDeltas_/, 'Normal stock writes must support incremental balances');
assert.match(source, /MERGE ['"]? \+ table/, 'Incremental balances must use an atomic BigQuery MERGE');
assert.match(source, /row\.record_type === 'OPNAME_DETAIL'.*movement_type.*Stock Opname.*version/s,
  'Stock Opname and corrected versions must remain on the full rebuild path');
assert.match(source, /function compactStockSummaryTables\(\)/, 'Summary version compaction must be available');
assert.match(source, /ROW_NUMBER\(\) OVER \(PARTITION BY event_date, outlet, location/, 'Daily compaction must keep only the newest item/day version');
assert.match(source, /stock_summary_jobs_compact_tmp/, 'Processed BigQuery queue versions must also be compacted');
assert.match(source, /date >= rebuildFrom/, 'Changed item rebuilds must only append affected dates');
assert.match(source, /function activateBigQuerySummaryMaintenanceV2\(\)/, 'Deployment must expose one safe V2 activation entry point');
assert.doesNotMatch(source, /function markStockItemSummariesDirty_/, 'Item jobs must no longer be stored as Script Properties');

const propertyValues = new Map();
context.PropertiesService = { getScriptProperties: () => ({
  getProperty: key => propertyValues.get(key) || null,
  setProperty: (key, value) => propertyValues.set(key, String(value)),
  deleteProperty: key => propertyValues.delete(key)
}) };
const cacheValues = new Map();
context.CacheService = { getScriptCache: () => ({
  get: key => cacheValues.get(key) || null,
  put: (key, value) => cacheValues.set(key, String(value))
}) };
let gateBusy = false;
context.LockService = { getScriptLock: () => ({
  tryLock: () => { if (gateBusy) return false; gateBusy = true; return true; },
  releaseLock: () => { gateBusy = false; }
}) };
assert.equal(vm.runInContext("stockSummaryWorkerLease_('first', false)", context), true);
assert.equal(vm.runInContext("stockSummaryWorkerLease_('second', false)", context), false,
  'Concurrent workers must not claim the same queue');
assert.equal(vm.runInContext("stockSummaryWorkerLease_('first', true)", context), true);
assert.equal(vm.runInContext("stockSummaryWorkerLease_('second', false)", context), true);
vm.runInContext("stockSummaryWorkerLease_('second', true)", context);

let rebuilds = 0;
let acknowledgements = 0;
let failAck = true;
context.testRebuild = () => { rebuilds++; };
context.acknowledgeStockSummaryJob_ = () => {
  acknowledgements++;
  if (failAck) throw new Error('transient ACK failure');
};
assert.throws(() => vm.runInContext("rebuildAndAcknowledgeStockSummaryJob_('ITEM', {scopeKey:'item-1',pendingThrough:'2026-09-17 17:19:53.675000'}, testRebuild)", context), /transient ACK failure/);
assert.equal(rebuilds, 1);
failAck = false;
vm.runInContext("rebuildAndAcknowledgeStockSummaryJob_('ITEM', {scopeKey:'item-1',pendingThrough:'2026-09-17 17:19:53.675000'}, testRebuild)", context);
assert.equal(rebuilds, 1, 'Retrying ACK must not reread the stock ledger');
assert.equal(acknowledgements, 2);
vm.runInContext("rebuildAndAcknowledgeStockSummaryJob_('ITEM', {scopeKey:'item-1',pendingThrough:'2026-09-17 17:19:53.675000'}, testRebuild)", context);
assert.equal(rebuilds, 1, 'A streamed ACK still pending visibility must not rebuild the same item');
vm.runInContext("rebuildAndAcknowledgeStockSummaryJob_('ITEM', {scopeKey:'item-1',pendingThrough:'2026-09-18 17:19:53.675000'}, testRebuild)", context);
assert.equal(rebuilds, 2, 'A newer stock change still requires a rebuild');

context.Utilities = { getUuid: () => 'worker-test' };
context.ScriptApp = { getProjectTriggers: () => [] };
context.ensureStockCardInfrastructure_ = () => {};
let scheduledRetries = 0;
context.ensureStockItemSummaryWorker_ = () => { scheduledRetries++; };
context.stockPendingSummaryJobs_ = jobType => jobType === 'ITEM' ? Array.from({ length: 8 }, (_, index) => ({
  scope_key: `scope-${index}`, pending_through: '2026-09-19 00:00:00.000000',
  outlet: 'BICB', location: 'Store', item_code: `ITEM${index}`, item_name: `Item ${index}`
})) : [];
context.rebuildStockItemSummary_ = () => { throw new Error('transient BigQuery failure'); };
assert.equal(vm.runInContext("stockSummaryWorkerLease_('another-worker', false)", context), true);
assert.equal(vm.runInContext('processStockItemSummaryJobs().busy', context), true,
  'A second worker must leave the queue untouched');
vm.runInContext("stockSummaryWorkerLease_('another-worker', true)", context);
const failedRun = vm.runInContext('processStockItemSummaryJobs()', context);
assert.equal(failedRun.hadFailure, true);
assert.equal(scheduledRetries, 0, 'Failed jobs must wait for the five-minute watchdog');

console.log('OK: stock summaries, worker lease, ACK retry, and failure backoff are stable.');
