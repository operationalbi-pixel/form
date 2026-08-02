'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { startServer } = require('./server');
const { mapMovement } = require('./stock-reader');

function getJson(port, path, headers) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, headers: headers || {} }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
}

function postJson(port, path, headers, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const request = http.request({
      host: '127.0.0.1', port, path, method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }, headers || {})
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(responseBody) }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

test('health endpoint is ready for Cloud Run', async (context) => {
  const server = startServer(0, { apiKey: 'test-key', stockReader: {} });
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));

  const result = await getJson(server.address().port, '/health');
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.service, 'stock-card-read-api');
  assert.equal(result.body.secured, true);
});

test('unknown endpoint does not expose data', async (context) => {
  const server = startServer(0, { apiKey: 'test-key', stockReader: {} });
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));

  const result = await getJson(server.address().port, '/v1/stock/history');
  assert.equal(result.status, 401);
  assert.equal(result.body.ok, false);
});

test('authorized history request uses the read service', async (context) => {
  const stockReader = {
    getStockHistory: async (input) => ({ outlet: input.outlet, history: [] })
  };
  const server = startServer(0, { apiKey: 'test-key', stockReader });
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));

  const result = await getJson(
    server.address().port,
    '/v1/stock/history?outlet=BISS&location=Store&itemCode=ITEM-1',
    { 'x-internal-api-key': 'test-key' }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.data.outlet, 'BISS');
});

test('authorized batch invalidation forwards all changed stock items', async (context) => {
  const stockReader = {
    invalidateStockHistoryBatch: async (input) => ({ invalidated: input.entries.length })
  };
  const server = startServer(0, { apiKey: 'test-key', stockReader });
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));

  const result = await postJson(
    server.address().port,
    '/v1/cache/invalidate-batch',
    { 'x-internal-api-key': 'test-key' },
    { entries: [{ outlet: 'BISS', location: 'Store', itemCode: 'ITEM-1' }] }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.data.invalidated, 1);
});

test('stock history maps optional production date', () => {
  const movement = mapMovement({
    record_id: 'ROW-1',
    event_date: { value: '2026-08-02' },
    production_date: { value: '2026-08-01' },
    expiry_date: { value: '2026-08-10' }
  });
  assert.equal(movement.productionDate, '2026-08-01');
  assert.equal(mapMovement({ record_id: 'ROW-2' }).productionDate, '');
});
