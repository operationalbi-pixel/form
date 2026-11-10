import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const source=fs.readFileSync('docs/Code.gs','utf8');
const start=source.indexOf('function readCloudflareStockOpnameMasterItems_(');
const end=source.indexOf('function prepareStockOpnameImport_(',start);
assert(start>=0 && end>start,'SO master functions must be present');
assert.match(source,/readStockMaster_\(true, true\)/,'SO must bypass stale master cache');
assert.match(source,/payload\.fromStockOpname === true/,'SO-only missing-master recovery must exist');
const html=fs.readFileSync('docs/stock-card.html','utf8');
assert.match(html,/fromStockOpname:true/,'SO conversion must identify its own recovery flow');

const d1=[
 {item_code:'FGR01170',item_name:'NORI TABUR / KOREAN NORI',category:'GROCERIES',default_unit:'PCK@50GR',active:1},
 {item_code:'OLDER00001',item_name:'Old item',category:'Food',default_unit:'PCS',active:0}
];
const sheetRows=[],calls=[];
let failSync=false;
const sheet={
 getLastRow(){return sheetRows.length+1},
 getRange(start,col,size,width){
  assert.equal(col,1);
  return {
   getDisplayValues(){return sheetRows.slice(start-2,start-2+size).map(row=>row.slice(0,width).map(String))},
   setValues(values){assert.equal(start,sheetRows.length+2);assert.equal(size,values.length);sheetRows.push(...values.map(row=>row.slice()));}
  };
 }
};
const ctx={
 console,Date,Math,JSON,String,Array,Object,Set,Error,encodeURIComponent,
 cleanText_:(v,max)=>String(v||'').trim().slice(0,max),
 normalizeUnit_:(v)=>String(v||'').trim().toUpperCase().replace(/\s+/g,''),
 normalizeStoreName_:(v)=>String(v||'').trim().toLowerCase(),
 digest_:(v)=>createHash('sha256').update(v).digest('hex'),
 cloudflareInventoryRequest_(method,path,payload){
   calls.push({method,path,payload});
   if(method==='GET'){
    assert.match(path,/^\/v1\/stock-items\?/);
    const url=new URL('https://test.invalid'+path),cursor=url.searchParams.get('cursor')||'';
    const data=d1.filter(item=>item.item_code>cursor).slice(0,200);
    return {ok:true,data,nextCursor:null};
   }
   assert.equal(path,'/v1/sync/master');
   assert.equal(method,'POST');
   if(failSync)throw Error('temporary Cloudflare sync failure');
   for(const key of ['outlets','locations','items','conversions','formulas','materials','showcaseItems'])
     assert(Array.isArray(payload.data[key]),'Master sync field '+key+' must be an array');
   payload.data.items.forEach(item=>d1.push({item_code:item.itemCode,item_name:item.itemName,
     default_unit:item.defaultUnit,category:item.category,active:item.active?1:0}));
   d1.sort((a,b)=>a.item_code.localeCompare(b.item_code));
   return {ok:true};
 },
 ensureStockMasterSheet_:()=>sheet,
 SpreadsheetApp:{flush(){}},
 removeScriptCacheKeys_(){}
};
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);

const row={code:'FGR01170',name:'NORI TABUR / KOREAN NORI',unit:'PCK@100GR',category:'GROCERIES'};
const cloudflare=ctx.readCloudflareStockOpnameMasterItems_([row.code]);
assert.equal(cloudflare.length,1);
assert.equal(cloudflare[0].unit,'PCK@50GR','D1 default unit must be authoritative when Sheet item is missing');
const restored=ctx.prepareStockOpnameMasterItems_([row],[],cloudflare);
assert.equal(restored.master[row.code].unit,'PCK@50GR');
assert.equal(restored.newItems[0].alreadyInCloudflare,true);
assert.equal(ctx.addStockOpnameMasterItems_(restored.newItems),1);
assert.deepEqual([...sheetRows[0]],['FGR01170','GROCERIES','NORI TABUR / KOREAN NORI','PCK@50GR',true]);
assert.equal(calls.filter(c=>c.method==='POST').length,0,'D1-existing item must NOT be overwritten');
assert.equal(ctx.addStockOpnameMasterItems_(restored.newItems),0,'Repeated job cannot duplicate Sheet rows');

const newRow={code:'NEW001',name:'New Material',category:'BAKERY',unit:'PCS'};
const unknown=ctx.readCloudflareStockOpnameMasterItems_([newRow.code]);
assert.equal(unknown.length,0);
const plan=ctx.prepareStockOpnameMasterItems_([newRow],[],unknown);
assert.equal(plan.newItems[0].alreadyInCloudflare,undefined);
assert.equal(ctx.addStockOpnameMasterItems_(plan.newItems),1);
assert.deepEqual([...sheetRows[1]],['NEW001','BAKERY','New Material','PCS',true]);
const posts=calls.filter(c=>c.method==='POST');
assert.equal(posts.length,1);
assert.equal(posts[0].payload.data.items[0].itemCode,'NEW001');
assert.equal(d1.find(item=>item.item_code==='NEW001').default_unit,'PCS');

assert.throws(()=>ctx.addStockOpnameMasterItems_([{code:'FGR01170',name:row.name,category:'GROCERIES',unit:'KG'}]),/nama\/unit berbeda/i);
assert.equal(sheetRows.length,2,'Conflicting master code must never change Sheet');
assert.equal(ctx.addStockOpnameMasterItems_(plan.newItems),0,'Retry must remain idempotent');

failSync=true;
assert.throws(()=>ctx.addStockOpnameMasterItems_([{code:'NEW002',name:'Unsynced',category:'FOOD',unit:'PCS'}]),/Cloudflare sync failure/);
assert.equal(sheetRows.length,2,'Failed D1 sync must not write a Sheet-only master item');

assert.throws(()=>ctx.prepareStockOpnameMasterItems_(
 [{code:'OLDER00001',name:'Old item',unit:'PCS'}],[],
 ctx.readCloudflareStockOpnameMasterItems_(['OLDER00001'])),/tidak aktif/i);

console.log('OK: Stock Opname reconciles D1/Sheet, restores existing codes, registers new items to both stores, rejects mismatches, and handles retries.');
