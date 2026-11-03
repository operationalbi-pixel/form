import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('docs/Code.gs', 'utf8');
const app = { console };
vm.createContext(app);
vm.runInContext(source, app);

const item = { code: 'P', name: 'Product', unit: 'PCS' };
const referenceData = { wipCatalog: { byCode: {} }, masterByCode: {}, salesMappings: {} };
const sale = date => ({ outlet: 'BIMC', item, transactionDate: date, target: item });
const clone = value => JSON.parse(JSON.stringify(value));
const receipt = (id, date, qty, productionDate) => ({
  recordId: id, logicalId: id, recordType: 'MOVEMENT', movementType: 'Goods Receipt',
  date, createdAt: `${date}T08:00:00Z`, direction: 'IN', qty,
  productionDate, sourceArrivalDate: date
});
const sold = (id, date, qty, lot) => ({
  recordId: id, logicalId: id, recordType: 'MOVEMENT', movementType: 'Sold',
  date, createdAt: `${date}T10:00:00Z`, direction: 'OUT', qty,
  productionDate: lot.productionDate, expiryDate: lot.expiryDate, sourceArrivalDate: lot.sourceDate
});

for (const history of [
  [receipt('R1', '2026-10-01', 20, '2026-09-28')],
  [receipt('R1', '2026-10-01', 20, '2026-09-28'), receipt('R2', '2026-10-03', 12, '2026-10-02')],
  [{ recordId: 'RECALC', logicalId: 'RECALC', recordType: 'MOVEMENT', movementType: 'Lot Balance Override',
    date: '2026-10-01', createdAt: '2026-10-01T20:00:00Z', direction: 'LOT', qty: 0,
    info: JSON.stringify({ recalculation: { startDate: '2026-10-02', endDate: '2026-10-31' }, lots: [
      { qty: 10, productionDate: '2026-09-28', expiryDate: '2026-10-05', arrivalDate: '2026-10-01' },
      { qty: 10, productionDate: '2026-09-29', expiryDate: '2026-10-10', arrivalDate: '2026-10-01' }
    ] }) }, { ...receipt('R3', '2026-10-03', 10, '2026-10-03'), expiryDate: '2026-10-04' }]
]) {
  const firstDate = '2026-10-02', nextDate = '2026-10-04';
  const cache = { histories: { 'BIMC|P': clone(history) }, targets: { 'BIMC|P': nextDate },
    dates: { 'BIMC|P': [firstDate, nextDate] }, snapshots: {} };
  const runtime = { salesCogsFifoHistoryCache: cache };
  const first = app.salesCogsFifoStateFromCache_([sale(firstDate)], referenceData, runtime);
  const allocated = app.salesConsumeInventoryLots_(first, 'BIMC', 'P', firstDate, 5);
  if (history[0].recordId === 'RECALC') assert.equal(allocated[0].expiryDate, '2026-10-05');
  const updates = app.salesCogsFifoSnapshotUpdates_(first, runtime.salesCogsActiveKeys);
  Object.assign(cache.snapshots, clone(updates));
  delete cache.histories['BIMC|P'];
  const next = app.salesCogsFifoStateFromCache_([sale(nextDate)], referenceData, runtime);
  const legacyHistory = clone(history).concat(allocated.map((lot, i) => sold(`S${i}`, firstDate, lot.qty, lot)));
  const legacy = app.salesFifoStateFromHistories_([sale(nextDate)], { 'BIMC|P': legacyHistory });
  assert.deepEqual(clone(next.BIMC.P[nextDate]), clone(legacy.BIMC.P[nextDate]));
  assert.equal(next.__balances.BIMC.P[nextDate], legacy.__balances.BIMC.P[nextDate]);
}

const checkpointHistory = [receipt('R1', '2026-10-01', 20, '2026-10-01'),
  { recordId: 'SO', logicalId: 'SO', recordType: 'MOVEMENT', movementType: 'Stock Opname',
    date: '2026-10-03', createdAt: '2026-10-03T20:00:00Z', direction: 'IN', qty: 0, opnameBalance: 4 }];
const legacyCache = { histories: { 'BIMC|P': clone(checkpointHistory) },
  targets: { 'BIMC|P': '2026-10-04' }, snapshots: {} };
const legacyRuntime = { salesCogsFifoHistoryCache: legacyCache,
  prepared: { rows: [sale('2026-10-02'), sale('2026-10-04')] } };
const beforeCheckpoint = app.salesCogsFifoStateFromCache_([sale('2026-10-02')], referenceData, legacyRuntime);
assert.equal(legacyCache.legacyKeys['BIMC|P'], true, 'a reset between report dates keeps full-history replay');
assert.equal(legacyCache.snapshots['BIMC|P'], undefined);
assert.deepEqual(Object.keys(app.salesCogsFifoSnapshotUpdates_(beforeCheckpoint, legacyRuntime.salesCogsActiveKeys)), []);
const checkpointLots = app.salesConsumeInventoryLots_(beforeCheckpoint, 'BIMC', 'P', '2026-10-02', 5);
legacyCache.histories['BIMC|P'].push(...checkpointLots.map((lot, i) => sold(`SO-S${i}`, '2026-10-02', lot.qty, lot)));
const afterCheckpoint = app.salesCogsFifoStateFromCache_([sale('2026-10-04')], referenceData, legacyRuntime);
assert.equal(afterCheckpoint.__balances.BIMC.P['2026-10-04'], 4);
assert.equal(afterCheckpoint.BIMC.P['2026-10-04'][0].qty, 4);

let calculations = 0;
const actualCalculate = app.calculateFifoSnapshots_;
app.calculateFifoSnapshots_ = (...args) => { calculations++; return actualCalculate(...args); };
const rows = Array.from({ length: 100 }, () => sale('2026-10-02'));
const cache = { histories: { 'BIMC|P': [receipt('R', '2026-10-01', 1000, '2026-10-01')] },
  targets: { 'BIMC|P': '2026-10-02' }, dates: { 'BIMC|P': ['2026-10-02'] }, snapshots: {} };
const runtime = { salesCogsFifoHistoryCache: cache };
for (const row of rows) {
  const state = app.salesCogsFifoStateFromCache_([row], referenceData, runtime);
  app.salesConsumeInventoryLots_(state, 'BIMC', 'P', row.transactionDate, 1);
  Object.assign(cache.snapshots, clone(app.salesCogsFifoSnapshotUpdates_(state, runtime.salesCogsActiveKeys)));
  delete cache.histories['BIMC|P'];
}
assert.equal(calculations, 1, 'repeated sale batches reuse the exact checkpointed lot state');
assert.equal(cache.snapshots['BIMC|P'].balances['2026-10-02'], 900);

const wip = { code: 'WIP', name: 'Prepared product', unit: 'PCS' };
const material = { code: 'MAT', name: 'Ingredient', unit: 'PCS' };
const wipReference = { wipCatalog: { byCode: { WIP: [{ name: wip.name, unit: 'PCS',
  materials: [{ code: 'MAT', name: material.name, unit: 'PCS', qty: 1 }] }] } },
  masterByCode: { MAT: material }, salesMappings: {} };
const wipCache = { histories: { 'BIMC|WIP': [], 'BIMC|MAT': [receipt('M1', '2026-10-01', 10, '2026-10-01')] },
  targets: { 'BIMC|WIP': '2026-10-02', 'BIMC|MAT': '2026-10-02' },
  dates: { 'BIMC|WIP': ['2026-10-02'], 'BIMC|MAT': ['2026-10-02'] }, snapshots: {} };
const wipRuntime = { salesCogsFifoHistoryCache: wipCache };
const wipState = app.salesCogsFifoStateFromCache_([{ outlet: 'BIMC', item: wip, target: wip,
  transactionDate: '2026-10-02' }], wipReference, wipRuntime);
assert.deepEqual(Object.keys(wipRuntime.salesCogsActiveKeys), ['BIMC|MAT']);
assert.equal(wipCache.legacyKeys['BIMC|WIP'], true);
assert.equal(wipState.__balances.BIMC.MAT['2026-10-02'], 10);
assert.deepEqual(Object.keys(app.salesCogsFifoSnapshotUpdates_(wipState, wipRuntime.salesCogsActiveKeys)), ['BIMC|MAT']);
console.log('Sales COGS FIFO snapshot reuse and cross-date equivalence passed.');
