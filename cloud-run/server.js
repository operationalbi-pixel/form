'use strict';

const http = require('node:http');

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

function requestHandler(request, response) {
  const url = new URL(request.url || '/', 'http://localhost');

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    sendJson(response, 200, {
      ok: true,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      region: process.env.K_SERVICE ? 'asia-southeast2' : 'local'
    });
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: 'Not found'
  });
}

function startServer(port) {
  return http.createServer(requestHandler).listen(port);
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  startServer(port);
}

module.exports = { requestHandler, startServer };
