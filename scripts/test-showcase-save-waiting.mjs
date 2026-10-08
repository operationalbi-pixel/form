import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile('docs/showcaselog.html', 'utf8');
const busy = 'Sistem sedang menyimpan transaksi lain untuk outlet ini. Tunggu sebentar lalu coba lagi; data Anda belum disimpan.';
const functions = html.slice(html.indexOf('    // Only a confirmed pre-write'), html.indexOf("    byId('eventDate').value=today();"));
const extractLine = name => html.slice(html.indexOf('    function ' + name + '('), html.indexOf('\n', html.indexOf('    function ' + name + '(')));
async function run(responses) {
  const timers = [], calls = [], messages = [], controls = new Map();
  let renders = 0;
  const byId = id => { if (!controls.has(id)) controls.set(id, { value: id === 'eventDate' ? '2026-10-08' : '', disabled: false }); return controls.get(id); };
  const inputs = [{ disabled: false }, { disabled: false }];
  const state = { token: 'login', outlet: 'BIMC', saving: false, items: [{ code: 'ITEM', totalIn: 2, totalSold: 0, totalWaste: 0, balance: 2 }], drafts: { 0: { inQty: '3' } }, user: { name: 'Staff' } };
  const context = vm.createContext({ STATE: state, byId, document: { querySelectorAll: () => inputs },
    setTimeout: (fn, delay) => { const timer = { fn, delay }; timers.push(timer); return timer; }, clearTimeout: timer => { if (timer) timer.cancelled = true; },
    toast: (message, error) => messages.push({ message, error }), renderItems: () => renders++, renderProgress() {}, writeShowcaseCache() {}, addActorName: (_names, actor) => actor,
    BAKERZIN_API: { call: async (name, args) => {
      calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
      const response = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (response instanceof Error) throw response;
      return response;
    } }
  });
  vm.runInContext(extractLine('setSaving') + extractLine('collectEntries') + extractLine('call') + functions, context);
  context.save(); context.save(); // Double-click cannot create a second write.
  await new Promise(resolve => setImmediate(resolve));
  if (timers.length) {
    assert.equal(state.saving, true);
    assert.equal(byId('saveButton').textContent, 'Menunggu giliran...');
    assert.equal(byId('eventDate').disabled, true);
    assert.equal(byId('showcaseOutletFilter').disabled, true);
    assert.ok(inputs.every(input => input.disabled));
    assert.equal(state.drafts[0].inQty, '3', 'Retain draft while waiting');
    // An unrelated read failure cannot release the pending save's UI guard.
    const savedApi = context.BAKERZIN_API;
    context.BAKERZIN_API = { call: async () => ({ ok: false, error: 'Read unavailable' }) };
    context.call('showcaseLogAging', [], () => {}); await new Promise(resolve => setImmediate(resolve));
    context.BAKERZIN_API = savedApi;
    assert.equal(state.saving, true);
  }
  for (let i = 0; i < 40 && timers.length; i++) {
    const timer = timers.shift(); if (!timer.cancelled) timer.fn();
    await new Promise(resolve => setImmediate(resolve));
  }
  return { state, calls, controls, messages, renders };
}
const success = { ok: true, data: { entries: [{ itemCode: 'ITEM', inQty: 3 }], progress: { days: [] } } };
const recovered = await run([...Array(20).fill({ ok: false, error: busy }), success]);
assert.equal(recovered.calls.length, 21, 'Repeated contention never becomes a save failure');
assert.ok(recovered.calls.every(call => call.args[1].outlet === 'BIMC' && call.args[1].eventDate === '2026-10-08' && call.args[1].entries[0].inQty === 3));
assert.equal(recovered.state.items[0].totalIn, 5, 'Apply one confirmed save, without multiplying additive quantities');
assert.equal(recovered.state.items[0].balance, 5);
assert.equal(recovered.state.saving, false);
assert.equal(Object.keys(recovered.state.drafts).length, 0);
assert.equal(recovered.renders, 1);
for (const response of [new Error('Server tidak merespons'), new Error(busy), { ok: false, error: 'batas waktu penguncian' }, { ok: false, error: 'Saldo tidak cukup.' }]) {
  const failed = await run([response]);
  assert.equal(failed.calls.length, 1, 'Never replay an uncertain write or validation failure');
  assert.equal(failed.state.drafts[0].inQty, '3');
  assert.equal(failed.state.saving, false);
  assert.equal(failed.state.items[0].totalIn, 2);
  assert.equal(failed.renders, 0);
}
// Verify that the exact retryable response originates before any mutation.
const backend = await readFile('docs/Code.gs', 'utf8');
const backendCtx = vm.createContext({ console }); vm.runInContext(backend, backendCtx);
let readsAfterLock = 0, writes = 0;
Object.assign(backendCtx, {
  requireSession_: () => ({ nik: 'N1' }), findEmployee_: () => ({ nik: 'N1', outlet: 'BIMC' }), assertEmployeeActive_() {}, ensureStockCardInfrastructure_() {},
  resolveStockOutlet_: () => 'BIMC', normalizeDate_: value => value, todayIso_: () => '2026-10-08', readShowcaseItems_: () => [{ code: 'ITEM' }],
  acquireStockScopeLock_: () => { throw new Error(busy); }, readShowcaseLogSnapshot_: () => readsAfterLock++, insertStockCardRows_: () => writes++
});
const rejection = backendCtx.saveShowcaseLog('login', { eventDate: '2026-10-08', entries: [{ itemCode: 'ITEM', inQty: 3, hasInInput: true }] });
assert.equal(rejection.ok, false); assert.equal(rejection.error, busy);
assert.equal(readsAfterLock, 0); assert.equal(writes, 0);
console.log('Showcase saves wait through repeated pre-write contention, preserve drafts, and never replay uncertain writes');
