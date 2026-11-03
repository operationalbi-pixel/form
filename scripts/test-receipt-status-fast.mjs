import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let localCalls = 0;
const browser = {
  URL,
  APP: { token: 'T', outlet: 'BIMC', location: 'Store' },
  BAKERZIN_API: { call: async action => {
    if (action === 'receiptDirectGrant') return { ok: true, data: {
      url: 'https://direct.test/v1/receipt-direct', token: 'signed', expiresAt: Date.now() + 300000
    } };
    if (action === 'localStockUploadStatus') {
      localCalls++;
      return new Promise(() => {});
    }
    throw new Error(`Unexpected Apps Script call: ${action}`);
  } },
  fetch: async () => ({ status: 200, json: async () => ({ ok: true, data: { jobs: [{
    jobId: 'receipt-1', engine: 'RECEIPT_CF', status: 'COMPLETE', processed: 89, total: 89
  }] } }) }),
  setTimeout: fn => { queueMicrotask(fn); return 1; }
};
browser.window = browser;
vm.createContext(browser);
vm.runInContext(fs.readFileSync('docs/stock-receipt-direct.js', 'utf8'), browser);

const first = await browser.BAKERZIN_API.call('goodsUploadStatus', ['T']);
assert.equal(first.data.jobs[0].status, 'COMPLETE', 'Cloudflare completion must show while Apps Script hangs');
const second = await browser.BAKERZIN_API.call('goodsUploadStatus', ['T']);
assert.equal(second.data.jobs[0].processed, 89);
assert.equal(localCalls, 1, 'a hanging legacy status call must not be repeated every poll');
console.log('Goods Receipt status remains responsive when Apps Script status is slow.');
