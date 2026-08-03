'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'berita-acara-digital';
const DATASET_ID = process.env.BQ_DATASET_ID || 'bakerzin_internal';
const BQ_LOCATION = process.env.BQ_LOCATION || 'asia-southeast2';
const CACHE_COLLECTION = 'stock_read_models';
const CACHE_TTL_MS = 120000;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 500;

let clients;

function googleClients() {
  if (clients) return clients;
  const { BigQuery } = require('@google-cloud/bigquery');
  const { Firestore } = require('@google-cloud/firestore');
  clients = {
    bigquery: new BigQuery({ projectId: PROJECT_ID }),
    firestore: new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true })
  };
  return clients;
}

function text(value, maxLength) {
  return String(value === null || value === undefined ? '' : value).trim().slice(0, maxLength);
}

function dateValue(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && typeof value.value === 'string') return value.value;
  return String(value);
}

function normalizeRequest(input) {
  const outlet = text(input.outlet, 30).toUpperCase();
  const location = text(input.location, 80);
  const itemCode = text(input.itemCode, 100).toUpperCase();
  const itemName = text(input.itemName, 180);
  const requestedLimit = Number(input.limit || DEFAULT_LIMIT);
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : DEFAULT_LIMIT));

  if (!outlet || !/^[A-Z0-9_-]+$/.test(outlet)) throw new Error('Outlet tidak valid.');
  if (!location) throw new Error('Penyimpanan wajib diisi.');
  if (!itemCode && !itemName) throw new Error('Kode atau nama item wajib diisi.');

  return { outlet, location, itemCode, itemName, limit };
}

function cacheDocumentId(context) {
  return crypto.createHash('sha256')
    .update([context.outlet, context.location.toLowerCase(), context.itemCode, context.itemName.toUpperCase()].join('|'))
    .digest('hex');
}

function mapMovement(row) {
  return {
    recordId: text(row.record_id, 100),
    logicalId: text(row.logical_id || row.record_id, 100),
    version: Number(row.version || 1),
    date: dateValue(row.event_date).slice(0, 10),
    direction: text(row.direction, 10),
    qty: Number(row.qty || 0),
    movementType: text(row.movement_type, 100),
    info: text(row.info, 20000),
    productionDate: dateValue(row.production_date).slice(0, 10),
    expiryDate: dateValue(row.expiry_date).slice(0, 10),
    sourceArrivalDate: dateValue(row.source_arrival_date).slice(0, 10),
    supplier: text(row.supplier, 180),
    sourceFile: text(row.source_file, 220),
    sourceRow: Number(row.source_row || 0),
    transferId: text(row.transfer_id, 100),
    systemGenerated: Boolean(row.transfer_id),
    createdBy: text(row.created_by, 100),
    createdAt: dateValue(row.created_at)
  };
}

function historyQuery() {
  const stockCard = '`' + PROJECT_ID + '.' + DATASET_ID + '.stock_card`';
  const balances = '`' + PROJECT_ID + '.' + DATASET_ID + '.stock_balances`';
  return 'WITH latest AS (' +
    ' SELECT record_id, COALESCE(NULLIF(logical_id, \'\'), record_id) AS logical_id, COALESCE(version, 1) AS version,' +
    ' event_date, direction, qty, movement_type, info, production_date, expiry_date, source_arrival_date, transfer_id, supplier,' +
    ' source_file, source_row, created_by, created_at' +
    ' FROM ' + stockCard +
    ' WHERE record_type = \'MOVEMENT\' AND outlet = @outlet AND location = @location' +
    ' AND ((@itemCode != \'\' AND item_code = @itemCode)' +
    ' OR ((item_code IS NULL OR item_code = \'\') AND item_name = @itemName)' +
    ' OR (@itemCode = \'\' AND item_name = @itemName))' +
    ' QUALIFY ROW_NUMBER() OVER (PARTITION BY COALESCE(NULLIF(logical_id, \'\'), record_id)' +
    ' ORDER BY COALESCE(version, 1) DESC, created_at DESC) = 1' +
    '), balance AS (' +
    ' SELECT current_qty, updated_at FROM ' + balances +
    ' WHERE outlet = @outlet AND location = @location' +
    ' AND ((@itemCode != \'\' AND item_code = @itemCode)' +
    ' OR ((item_code IS NULL OR item_code = \'\') AND item_name = @itemName)' +
    ' OR (@itemCode = \'\' AND item_name = @itemName))' +
    ' ORDER BY updated_at DESC LIMIT 1' +
    ')' +
    ' SELECT COALESCE((SELECT current_qty FROM balance),' +
    ' (SELECT SUM(CASE WHEN direction = \'IN\' THEN qty WHEN direction = \'OUT\' THEN -qty ELSE 0 END) FROM latest), 0) AS current_qty,' +
    ' ARRAY(SELECT AS STRUCT * FROM latest ORDER BY event_date DESC, created_at DESC LIMIT @rowLimit) AS history';
}

async function queryBigQuery(context) {
  const startedAt = Date.now();
  const rowLimit = MAX_LIMIT + 1;
  const [rows] = await googleClients().bigquery.query({
    query: historyQuery(),
    location: BQ_LOCATION,
    params: {
      outlet: context.outlet,
      location: context.location,
      itemCode: context.itemCode,
      itemName: context.itemName,
      rowLimit
    },
    types: { outlet: 'STRING', location: 'STRING', itemCode: 'STRING', itemName: 'STRING', rowLimit: 'INT64' },
    useQueryCache: true,
    maximumBytesBilled: '1000000000'
  });
  const result = rows[0] || {};
  const movements = Array.isArray(result.history) ? result.history.map(mapMovement) : [];
  const hasMore = movements.length > MAX_LIMIT;

  return {
    item: { code: context.itemCode, name: context.itemName },
    outlet: context.outlet,
    location: context.location,
    currentQty: Number(result.current_qty || 0),
    history: movements.slice(0, MAX_LIMIT),
    hasMore,
    meta: { source: 'BIGQUERY', durationMs: Date.now() - startedAt }
  };
}

async function readCache(documentId) {
  try {
    const snapshot = await googleClients().firestore.collection(CACHE_COLLECTION).doc(documentId).get();
    if (!snapshot.exists) return null;
    const cached = snapshot.data() || {};
    if (!cached.compressedPayload || Number(cached.expiresAt || 0) <= Date.now()) return null;
    return JSON.parse(zlib.gunzipSync(Buffer.from(cached.compressedPayload, 'base64')).toString('utf8'));
  } catch (error) {
    console.warn('Firestore cache read failed:', error.message);
    return null;
  }
}

async function writeCache(documentId, context, payload) {
  try {
    await googleClients().firestore.collection(CACHE_COLLECTION).doc(documentId).set({
      outlet: context.outlet,
      location: context.location,
      itemCode: context.itemCode,
      itemName: context.itemName,
      expiresAt: Date.now() + CACHE_TTL_MS,
      updatedAt: Date.now(),
      compressedPayload: zlib.gzipSync(JSON.stringify(payload)).toString('base64')
    });
  } catch (error) {
    console.warn('Firestore cache write failed:', error.message);
  }
}

async function getStockHistory(input) {
  const startedAt = Date.now();
  const context = normalizeRequest(input || {});
  const documentId = cacheDocumentId(context);
  const cached = await readCache(documentId);
  if (cached) {
    return shapePayload(cached, context.limit, 'FIRESTORE', Date.now() - startedAt);
  }
  const payload = await queryBigQuery(context);
  await writeCache(documentId, context, payload);
  return shapePayload(payload, context.limit, 'BIGQUERY', Date.now() - startedAt);
}

function shapePayload(payload, limit, source, durationMs) {
  const history = Array.isArray(payload.history) ? payload.history : [];
  return Object.assign({}, payload, {
    history: history.slice(0, limit),
    hasMore: Boolean(payload.hasMore || history.length > limit),
    meta: { source, durationMs }
  });
}

async function invalidateStockHistory(input) {
  const context = normalizeRequest(Object.assign({}, input, { limit: DEFAULT_LIMIT }));
  await googleClients().firestore.collection(CACHE_COLLECTION).doc(cacheDocumentId(context)).delete();
  return { invalidated: true };
}

async function invalidateStockHistoryBatch(input) {
  const entries = Array.isArray(input && input.entries) ? input.entries.slice(0, 500) : [];
  if (!entries.length) throw new Error('Daftar item wajib diisi.');
  const contexts = entries.map(function (entry) {
    return normalizeRequest(Object.assign({}, entry, { limit: DEFAULT_LIMIT }));
  });
  const batch = googleClients().firestore.batch();
  contexts.forEach(function (context) {
    batch.delete(googleClients().firestore.collection(CACHE_COLLECTION).doc(cacheDocumentId(context)));
  });
  await batch.commit();
  return { invalidated: contexts.length };
}

module.exports = { getStockHistory, invalidateStockHistory, invalidateStockHistoryBatch, normalizeRequest, mapMovement };
