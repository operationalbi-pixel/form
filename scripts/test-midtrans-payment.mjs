import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { normalizeMidtransStatus, verifyMidtransSignature } from '../cloudflare/inventory-api/src/index.js';

assert.equal(normalizeMidtransStatus('settlement', ''), 'PAID');
assert.equal(normalizeMidtransStatus('capture', 'accept'), 'PAID');
assert.equal(normalizeMidtransStatus('capture', 'challenge'), 'PENDING');
assert.equal(normalizeMidtransStatus('pending', ''), 'PENDING');
assert.equal(normalizeMidtransStatus('expire', ''), 'EXPIRED');
assert.equal(normalizeMidtransStatus('deny', ''), 'FAILED');

const serverKey = 'SB-Mid-server-test-only';
const signed = {
  order_id: 'BA-ASSET-TEST',
  status_code: '200',
  gross_amount: '10000.00'
};
signed.signature_key = await crypto.subtle.digest(
  'SHA-512',
  new TextEncoder().encode(`${signed.order_id}${signed.status_code}${signed.gross_amount}${serverKey}`)
).then(buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join(''));
assert.equal(await verifyMidtransSignature(signed, serverKey), true);
assert.equal(await verifyMidtransSignature({ ...signed, gross_amount: '9000.00' }, serverKey), false);

const worker = await readFile('cloudflare/inventory-api/src/index.js', 'utf8');
assert.ok(worker.indexOf('/v1/ba/payments/midtrans/webhook') < worker.indexOf('const auth = await authorize'));
assert.ok(!/MIDTRANS_SERVER_KEY\s*[:=]\s*["'][^"']+["']/.test(worker));

const appsScript = await readFile('berita-acara-gas/Code.gs', 'utf8');
new vm.Script(appsScript, { filename: 'berita-acara-gas/Code.gs' });
assert.ok(appsScript.includes("'/v1/ba/payments/midtrans/claim'"));

const form = await readFile('berita-acara-gas/BeritaAcaraPenjualanDisposeAssetForm.html', 'utf8');
assert.ok(form.includes("createAssetMidtransPayment"));
assert.ok(form.includes("getAssetMidtransPaymentStatus"));
assert.ok(!form.includes('lynk.id'));
assert.ok(!form.includes('paymentReceipt'));
for (const [index, match] of [...form.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
  const source = match[1].replace(/^\s*<\?!=[\s\S]*?\?>\s*$/gm, '');
  new vm.Script(source, { filename: `BeritaAcaraPenjualanDisposeAssetForm.html#${index + 1}` });
}

console.log('Midtrans payment verification tests passed.');
