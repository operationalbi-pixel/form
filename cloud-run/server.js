'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const SERVICE_NAME = 'stock-card-read-api';
const SERVICE_VERSION = '0.1.0';

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(payload);
}

function secureEqual(actual, expected) {
  const actualDigest = crypto.createHash('sha256').update(String(actual || '')).digest();
  const expectedDigest = crypto.createHash('sha256').update(String(expected || '')).digest();
  return crypto.timingSafeEqual(actualDigest, expectedDigest) && Boolean(expected);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 32768) request.destroy(new Error('Request terlalu besar.'));
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (error) { reject(new Error('JSON tidak valid.')); }
    });
    request.on('error', reject);
  });
}

function defaultStockReader() {
  return require('./stock-reader');
}

function createRequestHandler(options) {
  const settings = options || {};
  const apiKey = settings.apiKey === undefined ? process.env.INTERNAL_API_KEY : settings.apiKey;
  const stockReader = settings.stockReader || defaultStockReader();

  return async function requestHandler(request, response) {
    const url = new URL(request.url || '/', 'http://localhost');

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      sendJson(response, 200, {
        ok: true,
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        secured: Boolean(apiKey),
        region: process.env.K_SERVICE ? 'asia-southeast2' : 'local'
      });
      return;
    }

    if (url.pathname.indexOf('/v1/') === 0 && !secureEqual(request.headers['x-internal-api-key'], apiKey)) {
      sendJson(response, apiKey ? 401 : 503, { ok: false, error: apiKey ? 'Unauthorized' : 'Service belum dikonfigurasi.' });
      return;
    }

    try {
      if (request.method === 'GET' && url.pathname === '/v1/stock/history') {
        const data = await stockReader.getStockHistory(Object.fromEntries(url.searchParams));
        sendJson(response, 200, { ok: true, data });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/cache/invalidate') {
        const result = await stockReader.invalidateStockHistory(await readJson(request));
        sendJson(response, 200, { ok: true, data: result });
        return;
      }
    } catch (error) {
      const requestId = crypto.randomUUID();
      console.error(requestId, error);
      const clientError = /wajib|tidak valid/i.test(String(error.message || ''));
      sendJson(response, clientError ? 400 : 500, {
        ok: false,
        error: clientError ? error.message : 'Riwayat belum dapat dimuat.',
        requestId
      });
      return;
    }

    sendJson(response, 404, { ok: false, error: 'Not found' });
  };
}

function startServer(port, options) {
  return http.createServer(createRequestHandler(options)).listen(port);
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  startServer(port);
}

module.exports = { createRequestHandler, startServer, secureEqual };
