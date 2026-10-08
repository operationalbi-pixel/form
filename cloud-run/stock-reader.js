'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'berita-acara-digital';
const CACHE_COLLECTION = 'stock_read_models_cloudflare_v1';
const CACHE_TTL_MS = 120000;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 500;

let clients;

function googleClients() {
  if (clients) return clients;
  const { Firestore } = require('@google-cloud/firestore');
  clients = {
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

async function queryCloudflare(context) {
  const startedAt=Date.now();
  const base=String(process.env.CLOUDFLARE_INVENTORY_API_URL||'').replace(/\/$/,'');
  const key=process.env.CLOUDFLARE_INVENTORY_API_KEY;
  if(!base||!key)throw new Error('Cloudflare inventory belum dikonfigurasi.');
  async function request(path,params){const url=new URL(base+path);for(const [name,value]of Object.entries(params))if(value)url.searchParams.set(name,String(value));const response=await fetch(url,{headers:{'x-api-key':key},signal:AbortSignal.timeout(20000)});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error('Cloudflare inventory tidak dapat dibaca.');return payload;}
  const params={outlet:context.outlet,location:context.location,record_type:'MOVEMENT',limit:MAX_LIMIT+1};
  if((context.location==='Showcase'&&context.itemName)||!context.itemCode)params.item_name=context.itemName;else params.item_code=context.itemCode;
  const payload=await request('/v1/movements',params);
  const movements=(payload.data||[]).map(row=>mapMovement({...row,qty:row.quantity,source_arrival_date:row.arrival_date}));
  let balances=[],cursor='',pages=0;
  do{const data=await request('/v1/balances',{outlet:context.outlet,location:context.location,limit:1000,cursor});balances.push(...data.data||[]);cursor=data.nextCursor||'';if(++pages>100)throw new Error('Batas halaman Cloudflare terlampaui.');}while(cursor);
  const balance=balances.find(row=>(context.location==='Showcase'&&context.itemName)?String(row.item_name||'').toLowerCase()===context.itemName.toLowerCase():String(row.item_code||'').toUpperCase()===context.itemCode);
  return {item:{code:context.itemCode,name:context.itemName},outlet:context.outlet,location:context.location,currentQty:Number(balance?.current_qty||0),history:movements.slice(0,MAX_LIMIT),hasMore:Boolean(payload.nextCursor||movements.length>MAX_LIMIT),meta:{source:'CLOUDFLARE',durationMs:Date.now()-startedAt}};
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
  const payload = await queryCloudflare(context);
  await writeCache(documentId, context, payload);
  return shapePayload(payload, context.limit, 'CLOUDFLARE', Date.now() - startedAt);
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
