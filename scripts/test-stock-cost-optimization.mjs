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

const backfillStart = source.indexOf('function backfillStockItemSummaries()');
const backfillEnd = source.indexOf('/** Refreshes compact balances', backfillStart);
const backfillSource = source.slice(backfillStart, backfillEnd);
assert.match(backfillSource, /stock_item_summary_backfill_queue/, 'Backfill must use the compact BigQuery queue');
assert.match(backfillSource, /STOCK_ITEM_SUMMARY_BACKFILL_CURSOR_V1/, 'Backfill must advance with one cursor');
assert.match(backfillSource, /GROUP BY 1, 2, 3, 4\) AS grouped/, 'Cursor must be calculated after grouping the stock identities');
assert.doesNotMatch(backfillSource, /setProperties\(updates/, 'Backfill must not create one Script Property per stock item');

console.log('OK: pagination, checkpoints, audit dates, summary fallback, and quota-safe backfill are stable.');
