'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { startServer } = require('./server');

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
