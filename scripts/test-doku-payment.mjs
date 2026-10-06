import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  dokuDigest,
  dokuGenerateSignature,
  dokuGenerateSnapSignature,
  normalizeDokuStatus
} from '../cloudflare/inventory-api/src/index.js';

const rawBody = JSON.stringify({
  order: { amount: 10000, invoice_number: 'BAA-TEST' },
  transaction: { status: 'SUCCESS' }
});
const digest = await dokuDigest(rawBody);
assert.match(digest, /^[A-Za-z0-9+/]+=*$/);

const signature = await dokuGenerateSignature(
  'BRN-TEST',
  'request-id-test',
  '2026-10-06T17:00:00.000Z',
  '/v1/ba/payments/doku/webhook',
  rawBody,
  'secret-test-only'
);
assert.match(signature, /^HMACSHA256=[A-Za-z0-9+/]+=*$/);
assert.equal(
  signature,
  await dokuGenerateSignature(
    'BRN-TEST',
    'request-id-test',
    '2026-10-06T17:00:00.000Z',
    '/v1/ba/payments/doku/webhook',
    rawBody,
    'secret-test-only'
  )
);
assert.notEqual(
  signature,
  await dokuGenerateSignature(
    'BRN-TEST',
    'request-id-test',
    '2026-10-06T17:00:00.000Z',
    '/v1/ba/payments/doku/webhook',
    JSON.stringify({ order: { amount: 9000, invoice_number: 'BAA-TEST' } }),
    'secret-test-only'
  )
);


const snapPayload = {
  originalPartnerReferenceNo: 'BAA-TEST',
  latestTransactionStatus: '00',
  amount: { value: '10000.00', currency: 'IDR' },
  additionalInfo: {
    channelId: 'EMONEY_DANA',
    origin: { product: 'CHECKOUT', apiFormat: 'SNAP' }
  }
};
const snapSignature = await dokuGenerateSnapSignature(
  'POST',
  '/v1/ba/payments/doku/webhook',
  'snap-access-token-test',
  snapPayload,
  '2026-10-06T17:00:00+07:00',
  'secret-test-only'
);
assert.match(snapSignature, /^[A-Za-z0-9+/]+=*$/);
assert.equal(
  snapSignature,
  await dokuGenerateSnapSignature(
    'POST',
    '/v1/ba/payments/doku/webhook',
    'snap-access-token-test',
    snapPayload,
    '2026-10-06T17:00:00+07:00',
    'secret-test-only'
  )
);
assert.notEqual(
  snapSignature,
  await dokuGenerateSnapSignature(
    'POST',
    '/v1/ba/payments/doku/webhook',
    'snap-access-token-test',
    { ...snapPayload, amount: { value: '9000.00', currency: 'IDR' } },
    '2026-10-06T17:00:00+07:00',
    'secret-test-only'
  )
);

assert.equal(normalizeDokuStatus('SUCCESS'), 'PAID');
assert.equal(normalizeDokuStatus('00'), 'PAID');
assert.equal(normalizeDokuStatus('FAILED'), 'PENDING');
assert.equal(normalizeDokuStatus('06'), 'PENDING');
assert.equal(normalizeDokuStatus('EXPIRED'), 'EXPIRED');
assert.equal(normalizeDokuStatus('04'), 'REFUNDED');

const worker = await readFile('cloudflare/inventory-api/src/index.js', 'utf8');
assert.ok(worker.indexOf('/v1/ba/payments/doku/webhook') < worker.indexOf('const auth = await authorize'));
assert.ok(worker.includes('/v1/ba/payments/doku/create'));
assert.ok(worker.includes('/v1/ba/payments/doku/status'));
assert.ok(worker.includes('/v1/ba/payments/doku/claim'));
assert.ok(worker.includes('https://api.doku.com'));
assert.ok(worker.includes('X-Signature'));
assert.ok(worker.includes('HMAC", hash: "SHA-512"'));
assert.ok(worker.includes('/orders/v1/status/'));
assert.ok(worker.includes('customer: {'));
assert.ok(!/DOKU_SECRET_KEY\s*[:=]\s*["'][^"']+["']/.test(worker));

const appsScript = await readFile('berita-acara-gas/Code.gs', 'utf8');
new vm.Script(appsScript, { filename: 'berita-acara-gas/Code.gs' });
assert.ok(appsScript.includes('createAssetDokuPayment'));
assert.ok(appsScript.includes('getAssetDokuPaymentStatus'));
assert.ok(appsScript.includes("'/v1/ba/payments/doku/claim'"));
assert.ok(appsScript.includes('DOKU_HTTP_NOTIFICATION'));
assert.ok(!appsScript.includes('/v1/ba/payments/midtrans/'));

const form = await readFile('berita-acara-gas/BeritaAcaraPenjualanDisposeAssetForm.html', 'utf8');
assert.ok(form.includes('createAssetDokuPayment'));
assert.ok(form.includes('getAssetDokuPaymentStatus'));
assert.ok(form.includes('payment.paymentUrl'));
assert.ok(form.includes('DOKU_HTTP_NOTIFICATION'));
assert.ok(!form.includes('window.snap.pay'));
assert.ok(!form.includes('snapJsUrl'));
assert.ok(!form.includes('MIDTRANS_SERVER_WEBHOOK'));
for (const [index, match] of [...form.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
  const source = match[1].replace(/^\s*<\?!=[\s\S]*?\?>\s*$/gm, '');
  new vm.Script(source, { filename: `BeritaAcaraPenjualanDisposeAssetForm.html#${index + 1}` });
}

console.log('DOKU payment verification tests passed.');
