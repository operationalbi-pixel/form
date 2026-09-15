import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const backend = await readFile('gas/Code.gs', 'utf8');
function functionSource(startName, nextName) {
  const start = backend.indexOf(`function ${startName}(`);
  const end = backend.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `${startName} is available`);
  return backend.slice(start, end);
}

const plannedSource = functionSource('stockPositionPlannedRows_', 'existingStockPositionRecordIds_');
const processSource = functionSource('processStockPositionJobItem_', 'processStockPositionUploadJobs');
const job = { jobId: 'job-1', outlet: 'BILK', location: 'Store', ownerNik: 'staff-1',
  fileName: 'Stock.xlsx', sourceHash: 'source-1', eventDate: '2026-09-15', total: 1, processed: 0, progress: 15,
  pendingDriveId: 'pending-1', movementCount: 0 };
const line = { sourceRow: 9, cardQty: 8, actualQty: 3, delta: -5,
  item: { code: 'ABC', name: 'Item A', category: 'Food', unit: 'PCS' } };
const context = {
  Date, Math, Number, String, JSON,
  digest_: value => createHash('sha256').update(String(value)).digest('hex'),
  formatQty_: value => String(value), cleanText_: value => String(value), todayIso_: () => '2026-09-15',
  writeStockPositionJob_: state => state,
  DriveApp: { getFileById: () => ({ setTrashed() {} }) },
  acquireStockWriteLock_: () => ({ releaseLock() {} }),
  stockPositionJobJson_: () => [],
  existingStockPositionRecordIds_: () => ({}),
  insertStockCardRows_: () => {},
};
vm.createContext(context);
vm.runInContext(plannedSource + processSource, context);

const lots = [
  { qty: 2, expiryDate: '2026-10-01', sourceDate: '2026-08-01' },
  { qty: 3, expiryDate: '2026-11-01', sourceDate: '2026-08-02' },
];
const first = context.stockPositionPlannedRows_(job, line, lots);
const second = context.stockPositionPlannedRows_(job, line, lots);
assert.deepEqual(Array.from(first, row => row.json.record_id), Array.from(second, row => row.json.record_id));
assert.deepEqual(Array.from(first, row => row.json.qty), [2, 3]);
assert.deepEqual(Array.from(first, row => row.json.expiry_date), ['2026-10-01', '2026-11-01']);
assert.deepEqual(Array.from(first, row => row.json.source_arrival_date), ['2026-08-01', '2026-08-02']);
assert.deepEqual(Array.from(first, row => row.json.event_date), ['2026-09-15', '2026-09-15']);

let inserted = [];
context.stockPositionJobJson_ = () => first;
context.existingStockPositionRecordIds_ = () => ({ [first[0].json.record_id]: true });
context.insertStockCardRows_ = rows => { inserted = rows; };
context.processStockPositionJobItem_(job, { items: [line] });
assert.deepEqual(Array.from(inserted, row => row.json.record_id), [first[1].json.record_id],
  'recovery writes only the lot not yet found in the ledger');
assert.equal(job.processed, 1);
assert.equal(job.movementCount, 2);
assert.equal(job.pendingDriveId, '');

const freshJob = { ...job, jobId: 'job-2', pendingDriveId: '', processed: 0, movementCount: 0 };
let savedBeforeInsert = false;
let freshRows = [];
context.DriveApp.createFile = () => ({ getId: () => 'pending-2' });
context.Utilities = { newBlob: () => ({}) };
context.allocateTransferLots_ = () => lots;
context.stockPositionJobJson_ = () => freshRows;
context.writeStockPositionJob_ = state => { if (state.pendingDriveId) savedBeforeInsert = true; return state; };
context.existingStockPositionRecordIds_ = () => { throw new Error('fresh rows must not need a recovery query'); };
context.insertStockCardRows_ = rows => { assert.ok(savedBeforeInsert, 'pending plan is durable before insertion'); inserted = rows; };
context.DriveApp.getFileById = () => ({ setTrashed() {} });
const plannedRowsFn = context.stockPositionPlannedRows_;
context.stockPositionPlannedRows_ = (...args) => {
  freshRows = plannedRowsFn(...args);
  return freshRows;
};
context.processStockPositionJobItem_(freshJob, { items: [line] });
assert.equal(freshJob.processed, 1);
assert.equal(inserted.length, 2);

console.log('OK: Stock Posisi lot IDs stay stable, fresh plans are saved, and recovery skips recorded lots.');
