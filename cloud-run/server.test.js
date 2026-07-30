'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { startServer } = require('./server');

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
}

test('health endpoint is ready for Cloud Run', async (context) => {
  const server = startServer(0);
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));

  const result = await getJson(server.address().port, '/health');
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.service, 'stock-card-read-api');
});

test('unknown endpoint does not expose data', async (context) => {
  const server = startServer(0);
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));

  const result = await getJson(server.address().port, '/v1/stock/history');
  assert.equal(result.status, 404);
  assert.equal(result.body.ok, false);
});
