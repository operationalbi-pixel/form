import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import worker from '../cloudflare/inventory-api/src/index.js';

function database(table){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE ${table}(record_id TEXT PRIMARY KEY,logical_id TEXT,version INTEGER,outlet_code TEXT,location_code TEXT,item_code TEXT,item_name TEXT,record_type TEXT,movement_type TEXT,event_date TEXT,created_at TEXT,quantity REAL,direction TEXT,source_hash TEXT,transfer_id TEXT)`);
  if(table==='stock_movements_history')db.exec(fs.readFileSync('cloudflare/migrations/0012_history_logical_lookup.sql','utf8'));
  return {db,prepare(sql){const statement=db.prepare(sql);let args=[];return {bind(...values){args=values;return this},async all(){return {results:statement.all(...args)}}}}};
}
const ops=database('stock_movements'),history=database('stock_movements_history'),later=database('stock_movements_history');
const env={API_KEY:'test',OPERATIONS_DB:ops,HISTORY_DB_2026:history,HISTORY_DB_2026_10:history,HISTORY_DB_2026_11:later};
function insert(db,table,id,logical,version,date,code='CAKE',outlet='BICP',type='Goods Receipt'){
  db.db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,logical,version,outlet,'Store',code,'Cake','MOVEMENT',type,date,id,2,'IN','hash','');
}
insert(history,'stock_movements_history','old','changed',1,'2026-10-05');
insert(later,'stock_movements_history','new','changed',2,'2026-11-01','OTHER','OTHER','Waste');
insert(ops,'stock_movements','valid','valid',1,'2026-10-06');
async function get(extra=''){
  const url='https://test/v1/movements?resolve_scope=1&outlet=BICP&record_type=MOVEMENT&movement_type=Goods%20Receipt&item_codes=CAKE&from=2026-10-05&to=2026-10-09&'+extra;
  const response=await worker.fetch(new Request(url,{headers:{'x-api-key':'test'}}),env);
  assert.equal(response.status,200);return response.json();
}
assert.deepEqual((await get()).data.map(r=>r.record_id),['valid'],'correction outside date/item/outlet/type suppresses its old receipt');
ops.db.exec('DELETE FROM stock_movements');history.db.exec('DELETE FROM stock_movements_history');later.db.exec('DELETE FROM stock_movements_history');
for(let i=0;i<201;i++){
  const id=String(i).padStart(4,'0');insert(history,'stock_movements_history',id,id,1,'2026-10-05');
  if(i>0)insert(later,'stock_movements_history','new'+id,id,2,'2026-11-01');
}
const page=await get('limit=200');assert.equal(page.data.length,0);assert.ok(page.nextCursor,'empty resolved page must still advance its candidate cursor');
const final=await get('limit=200&cursor='+encodeURIComponent(page.nextCursor));assert.deepEqual(final.data.map(r=>r.record_id),['0000']);assert.equal(final.nextCursor,null);

const ctx={console,PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},Utilities:{formatDate:d=>d.toISOString().slice(0,10)}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('gas/Code.gs','utf8'),ctx);
let queries=[];ctx.cloudflareReadAllPages_=(path,params,limit)=>{queries.push({path,params,limit});return []};
const codes=Array.from({length:159},(_,i)=>'CODE'+String(i).padStart(5,'0'));
ctx.cloudflareLedgerRows_({outlet:'BICP',itemCodes:codes});
assert.equal(queries.length,2,'159 short codes need two URL batches, rather than fourteen');
assert.ok(queries.every(q=>q.params.item_codes.split('|').length<=80&&encodeURIComponent(q.params.item_codes).length<=1200&&q.limit===5000));
queries=[];ctx.findGoodsReceiptDuplicateRows_('BICP',[{transactionDate:'2026-10-05',itemCode:'CAKE',qty:2,supplier:'SUP',sourceRow:12}]);
assert.equal(queries[0].params.from,'2026-10-05');assert.equal(queries[0].params.to,'2026-10-05');assert.equal(queries[0].params.resolve_scope,1);assert.equal(queries[0].params.movement_type,'Goods Receipt');
// Existing generic balance reads still resolve versions before their date cutoff.
queries=[];ctx.cloudflareLedgerRows_({outlet:'BICP',to:'2026-10-05'});assert.equal(queries[0].params.to,'');

// Optional local verification uses the uploaded workbook, without adding business data to git.
if(process.argv[2]){
  const parts=JSON.parse(execFileSync('python',['-c',"import zipfile,json,sys;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:z.read(n).decode() for n in z.namelist() if n.endswith('.xml')}))",process.argv[2]],{maxBuffer:10*1024*1024}));
  ctx.Utilities={...ctx.Utilities,base64Decode:s=>Array.from(Buffer.from(s,'base64')),newBlob:bytes=>({bytes}),unzip:()=>Object.entries(parts).map(([name,text])=>({getName:()=>name,getBytes:()=>Buffer.from(text),getDataAsString:()=>text}))};
  const base64=fs.readFileSync(process.argv[2]).toString('base64');const report=ctx.parseGoodsReceiptReport_(base64,'report.xlsx');
  assert.equal(report.rows.length,248);assert.equal(new Set(report.rows.map(r=>r.code)).size,159);assert.equal(report.outletName,'Bakerzin Central Park');
  ctx.readStoreCodeDirectory_=()=>({byName:{'BAKERZIN CENTRAL PARK':{code:'BICP',name:report.outletName}}});
  ctx.readStockMaster_=()=>report.rows.map(r=>({code:r.code,name:r.name,unit:r.unit,active:true}));ctx.readStockUnitConversions_=()=>({});
  ctx.digest_=v=>createHash('sha256').update(v).digest('hex');queries=[];
  const prepared=ctx.prepareGoodsReceiptImport_({outlet:'BICP',location:'Store'},{fileName:'report.xlsx',base64},true);
  assert.equal(prepared.sourceItemCount,248);assert.equal(prepared.requiresConversion,false);assert.equal(prepared.requiresDuplicateDecision,true);
  assert.ok(prepared.unresolvedDuplicates.every(row=>row.matchType==='FILE'));
  queries=[];
  const reviewed=ctx.prepareGoodsReceiptImport_({outlet:'BICP',location:'Store'},{fileName:'report.xlsx',base64,allowDuplicateRows:prepared.unresolvedDuplicates.map(row=>row.sourceRow)},true);
  assert.equal(reviewed.requiresDuplicateDecision,false);assert.equal(reviewed.sourceItemCount,248);
  assert.ok(queries.length<=6,'real workbook validation stays within a small number of scoped batches');
  console.log('Uploaded workbook parsed and prepared: 248 rows, 159 codes, BICP, five transaction dates; file duplicates:',prepared.unresolvedDuplicates.length,'; scoped history calls:',queries.length);
}

const html=fs.readFileSync('docs/stock-card.html','utf8'),start=html.indexOf('    function requestGoodsReceiptVerification()'),end=html.indexOf('    function handleGoodsReceiptVerification',start);
let callbacks=[],timers=new Map(),ticks=0,handled=0;const state={};
const ui={APP:{goodsReceipt:state,token:'token'},Date,byId:()=>({classList:{add(){}},disabled:false}),goodsReceiptPayload:()=>({}),setGoodsReceiptProgress:()=>ticks++,setInterval:fn=>{timers.set(1,fn);return 1},clearInterval:id=>timers.delete(id),server:(name,args,success,options)=>callbacks.push({success,options}),handleGoodsReceiptVerification:()=>handled++,goodsReceiptUploadError:()=>handled++};
vm.createContext(ui);vm.runInContext(html.slice(start,end),ui);
ui.requestGoodsReceiptVerification();timers.get(1)();assert.equal(ticks,2);
ui.APP.goodsReceipt={};callbacks[0].success({});assert.equal(handled,0,'late result from a replaced file is ignored');
ui.requestGoodsReceiptVerification();callbacks[1].options.onError('timeout');assert.equal(timers.size,0);assert.equal(handled,1);
console.log('Receipt verification scopes dates/items, follows corrected versions across shards and pages, and ignores stale UI replies.');
