import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';
import vm from 'node:vm';

const values=new Map(), properties=new Map([
  ['CLOUDFLARE_BA_URL','https://worker.test'],['CLOUDFLARE_BA_API_KEY','server-secret']
]);
let requests=0, rowVersion=1;
function blob(value){
  const bytes=Buffer.from(value);
  return {getBytes:()=>bytes,getDataAsString:()=>bytes.toString('utf8')};
}
const context={console,PropertiesService:{getScriptProperties:()=>({
  getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value)
})},CacheService:{getScriptCache:()=>({
  get:key=>values.get(key)||null,put:(key,value)=>values.set(key,value)
})},Utilities:{
  DigestAlgorithm:{SHA_256:'sha256'},getUuid:randomUUID,
  computeDigest:(algorithm,value)=>[...createHash(algorithm).update(value).digest()],
  newBlob:blob,gzip:value=>blob(gzipSync(value.getBytes())),ungzip:value=>blob(gunzipSync(value.getBytes())),
  base64Encode:value=>Buffer.from(value).toString('base64'),base64Decode:value=>Buffer.from(value,'base64')
},UrlFetchApp:{fetch:()=>{
  requests++;
  return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,data:[{version:rowVersion}]})};
}}};
vm.createContext(context);vm.runInContext(await readFile('berita-acara-gas/Code.gs','utf8'),context);
const list=outlet=>context.baCloudflareRequest_('get','/v1/ba/submissions?outlet='+outlet);
assert.equal(list('A').data[0].version,1);list('A');assert.equal(requests,1);
list('B');assert.equal(requests,2,'outlets cannot share list cache');
rowVersion=2;
context.baCloudflareRequest_('post','/v1/ba/submission',{rows:[]});
assert.equal(list('A').data[0].version,2,'successful writes invalidate all list scopes');
assert.equal(requests,4);
context.baCloudflareRequest_('get','/v1/ba/submission?submission_id=one');
context.baCloudflareRequest_('get','/v1/ba/submission?submission_id=one');
assert.equal(requests,6,'decisions always fetch current document metadata');
context.baCloudflareRequest_('get','/v1/ba/payments/doku/status?order_id=one');
context.baCloudflareRequest_('get','/v1/ba/payments/doku/status?order_id=one');
assert.equal(requests,8,'payment status is never cached');
for(const key of values.keys())values.set(key,'corrupt');
list('A');assert.equal(requests,9,'corrupt cache falls through safely');
properties.set('CLOUDFLARE_BA_API_KEY','rotated-secret');
list('A');assert.equal(requests,10,'credential rotation changes cache scope');
context.requireBaSession_=()=>{throw new Error('Expired session')};
assert.throws(()=>context.getAllSubmissions({BA_SESSION:'expired'}),/Expired session/);
assert.equal(requests,10,'authentication remains mandatory on cached reads');
// A failed write must not claim success or replace the committed cache generation.
const generation=properties.get('BA_LIST_CACHE_VERSION');
context.UrlFetchApp.fetch=()=>({getResponseCode:()=>500,getContentText:()=>'{"ok":false,"error":"unavailable"}'});
assert.throws(()=>context.baCloudflareRequest_('post','/v1/ba/submission',{}),/unavailable/);
assert.equal(properties.get('BA_LIST_CACHE_VERSION'),generation);

const main=await readFile('gas/Code.gs','utf8');
const from=main.indexOf('function cloudflareInventoryRequest_('),to=main.indexOf('function cloudflareQueryString_',from);
for(const message of ['Service invoked too many times for one day: urlfetch.','Layanan terlalu sering diminta di hari yang sama: urlfetch.']){
  let fetches=0,sleeps=0;
  const c={cloudflareInventoryConfig_:()=>({url:'https://worker.test',apiKey:'secret'}),
    UrlFetchApp:{fetch:()=>{fetches++;throw new Error(message)}},Utilities:{sleep:()=>sleeps++}};
  vm.createContext(c);vm.runInContext(main.slice(from,to),c);
  assert.throws(()=>c.cloudflareInventoryRequest_('GET','/health'),/urlfetch/);
  assert.equal(fetches,1);assert.equal(sleeps,0,'daily quota exhaustion is not retried');
}
console.log('OK: BA list cache is scoped, session protected, invalidated on writes, and never caches approval/payment verification; daily quotas fail without retry.');
