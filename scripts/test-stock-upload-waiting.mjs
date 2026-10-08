import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile('docs/stock-card.html', 'utf8');
const browserFunctions = html.slice(html.indexOf('    function stockUploadWaiting('), html.indexOf('    function init(){'));
const busy = 'Sistem sedang menyimpan transaksi lain. Silakan coba lagi; data Anda belum disimpan.';
async function runUpload(name, responses) {
  let clock = 0, calls = 0, result, failure;
  const timers = [], progress = [];
  const context = vm.createContext({
    Date: { now: () => clock }, Math,
    APP: { goodsDelivery: {}, goodsReceipt: {} },
    clearInterval() {}, setTimeout(fn, delay) { timers.push({ fn, delay }); },
    setGoodsDeliveryProgress: (...args) => progress.push(args),
    setGoodsReceiptProgress: (...args) => progress.push(args),
    stockRetryableRead: () => false, stockTransientError: () => false,
    stockMutationAction: () => true, clearStockHistoryBrowserCache() {},
    showLoading() {}, toast() {},
    BAKERZIN_API: { call: async () => {
      calls++;
      const response = responses[Math.min(calls - 1, responses.length - 1)];
      if (response instanceof Error) throw response;
      return response;
    } }
  });
  vm.runInContext(browserFunctions, context);
  context.server(name, ['token', { base64: 'same-file' }], data => { result = data; }, { onError: message => { failure = message; } });
  for (let i = 0; i < 200; i++) {
    await new Promise(resolve => setImmediate(resolve));
    const timer = timers.shift();
    if (!timer) break;
    clock += timer.delay; timer.fn();
  }
  return { calls, result, failure, progress, clock };
}
for (const name of ['uploadGoodsDelivery', 'uploadGoodsReceipt']) {
  const success = await runUpload(name, [...Array(5).fill({ ok: false, error: busy }), { ok: true, data: { uploaded: true } }]);
  assert.equal(success.calls, 6, 'Busy uploads must survive more than two retries');
  assert.equal(success.result.uploaded, true);
  assert.equal(success.failure, undefined);
  assert.equal(success.progress.length, 5);
  assert.equal(success.progress[0][2], 'DIPROSES');
  const timeout = await runUpload(name, [new Error('Server tidak merespons')]);
  assert.equal(timeout.calls, 1, 'Never replay an upload with unknown write outcome');
  const thrownBusy = await runUpload(name, [new Error(busy)]);
  assert.equal(thrownBusy.calls, 1, 'Transport errors are not proof of a pre-write rejection');
  const invalid = await runUpload(name, [{ ok: false, error: 'Outlet tidak valid.' }]);
  assert.equal(invalid.calls, 1, 'Validation errors must remain visible');
  const uncertain = await runUpload(name, [{ ok: false, error: 'batas waktu penguncian' }]);
  assert.equal(uncertain.calls, 1, 'Require explicit confirmation that no data was saved');
  const exhausted = await runUpload(name, [{ ok: false, error: busy }]);
  assert.match(exhausted.failure, /5 menit/);
  assert.ok(exhausted.clock >= 300000);
  assert.ok(exhausted.calls < 50, 'Waiting must be bounded');
}

const source = await readFile('docs/Code.gs', 'utf8');
const context = vm.createContext({ console });
vm.runInContext(source, context);
for (const kind of ['GoodsDelivery', 'GoodsReceipt']) {
  const events = [];
  Object.assign(context, {
    safe_: fn => { try { return { ok: true, data: fn() }; } catch (error) { return { ok: false, error: error.message }; } },
    resolveStockContext_: () => ({ outlet: 'BIMC' }),
    cleanText_: value => value,
    acquireStockWriteLock_: () => { events.push('lock'); return { releaseLock: () => events.push('release') }; },
    appendOrActivateStockMasterItems_: () => events.push('write')
  });
  context['parse' + kind + 'Report_'] = () => { events.push('parse'); return { rows: [] }; };
  context['prepare' + kind + 'Import_'] = (_context, _payload, _allow, report) => {
    assert.equal(report.rows.length, 0);
    events.push('duplicate-check');
    return { requiresDuplicateDecision: true };
  };
  const result = context['upload' + kind]('token', { base64: 'file', fileName: 'report.xlsx' });
  assert.equal(result.ok, false);
  assert.deepEqual(events, ['parse', 'lock', 'duplicate-check', 'release'], 'Concurrent uploads must recheck duplicates inside the lock and release on rejection');
  events.length = 0;
  context.acquireStockWriteLock_ = () => { events.push('busy'); throw new Error(busy); };
  const rejected = context['upload' + kind]('token', { base64: 'file', fileName: 'report.xlsx' });
  assert.equal(rejected.error, busy);
  assert.deepEqual(events, ['parse', 'busy'], 'Busy rejection must occur before writes');
}
console.log('Stock upload waiting and serialized duplicate checks passed');
