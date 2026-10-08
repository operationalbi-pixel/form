import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import worker from '../cloudflare/inventory-api/src/index.js';
const source=await readFile('docs/Code.gs','utf8');
for(const file of (await readdir('gas')).filter(name=>name.endsWith('.gs'))){
  const text=await readFile('gas/'+file,'utf8');
  assert.doesNotMatch(text,/\bBigQuery\s*\.\s*(Jobs|Tabledata|Tables|Datasets)\s*\./,file+' must never invoke BigQuery');
}
assert.doesNotMatch(await readFile('gas/appsscript.json','utf8'),/bigquery/i);
assert.doesNotMatch(await readFile('cloud-run/stock-reader.js','utf8'),/google-cloud\/bigquery|bigquery\.query|bigquery\.googleapis/i);
const ctx=vm.createContext({console:{info(){},error(){},log(){}}});vm.runInContext(source,ctx);
const props=new Map(),writes=[];
const employee={nik:'N1',status:'active',outlet:'BIMC',name:'Staff',password:'original123',sheet:{getRange:()=>({setValue:value=>writes.push(value)})},row:2};
let failures=0;
Object.assign(ctx,{
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key)})},
  digest_:value=>createHash('sha256').update(String(value)).digest('hex'),
  findEmployee_:nik=>{if(nik!==employee.nik)throw new Error('NIK tidak terdaftar.');return employee;},
  createSession_:user=>({nik:user.nik}),assertNotRateLimited_(){},clearLoginFailures_(){},recordLoginFailure_:()=>failures++,
  Utilities:{getUuid:randomUUID,newBlob:value=>({getBytes:()=>Array.from(Buffer.from(String(value)))})}
});
// Both credential paths use the same active-account check and preserve the original hash/plaintext on POV access.
const general=['547','698'].join('');
assert.equal(ctx.login('N1',general).ok,true);assert.equal(writes.length,0);
assert.equal(ctx.login('N1','wrong').ok,false);assert.equal(failures,1);
assert.equal(ctx.login('missing',general).ok,false);
employee.status='resign';assert.equal(ctx.login('N1',general).ok,false);employee.status='active';
assert.equal(ctx.login('N1','original123').ok,true);assert.equal(writes.length,1,'Only personal-password authentication migrates legacy password');
employee.password=writes[0];assert.equal(ctx.login('N1','original123').ok,true);assert.equal(writes.length,1);
assert.equal(ctx.login('N1',general).ok,true);assert.equal(writes.length,1);
employee.password='';assert.equal(ctx.activateAccount('N1',general,'').ok,true);assert.equal(writes.length,1);
props.set('GENERAL_PASSWORD_HASH','DISABLED');assert.equal(ctx.login('N1',general).ok,false);props.delete('GENERAL_PASSWORD_HASH');
props.set('GENERAL_PASSWORD_HASH',ctx.hashPassword_('replacement123'));assert.equal(ctx.login('N1',general).ok,false);assert.equal(ctx.login('N1','replacement123').ok,true);props.delete('GENERAL_PASSWORD_HASH');
// A corrected event moved outside the requested period must suppress its earlier version, even across pages.
const rows=[
 {record_id:'old',logical_id:'lot',version:1,event_date:'2026-10-01',quantity:20},
 {record_id:'new',logical_id:'lot',version:2,event_date:'2026-10-05',quantity:8},
 {record_id:'sold',logical_id:'sold',version:1,event_date:'2026-10-06',quantity:3,direction:'OUT'}
].map(row=>({outlet_code:'BIMC',location_code:'Store',record_type:'MOVEMENT',item_code:'PRODUCT',item_name:'Cake',unit:'PCS',direction:'IN',movement_type:'Goods Receipt',created_at:row.event_date+'T00:00:00Z',...row}));
ctx.cloudflareReadAllPages_=(path,params)=>{assert.equal(path,'/v1/movements');assert.equal(params.raw,1);assert.equal(params.from,'');assert.equal(params.to,'');return rows;};
assert.equal(ctx.cloudflareLedgerRows_({outlet:'BIMC',location:'Store',to:'2026-10-03'}).length,0);
assert.equal(ctx.readRemainingStockLotsBatch_('BIMC','Store',[{code:'PRODUCT'}]).PRODUCT.reduce((sum,lot)=>sum+lot.qty,0),5);
const item={code:'MENU',name:'Cake Menu',unit:'PCS',category:'Food'},product={code:'PRODUCT',name:'Cake',unit:'PCS',category:'Food'};
Object.assign(ctx,{todayIso_:()=> '2026-10-08',normalizeDate_:value=>value,readShowcaseItems_:()=>[item],resolveShowcaseProductMapping_:()=>({product,productPerMenu:1}),readShowcaseLogSnapshot_:()=>({totals:{},progress:{days:[{date:'2026-10-08'}]}}),formatQty_:String});
const entry={itemCode:'MENU',inQty:2,soldQty:1,wasteQty:0,hasInInput:true,hasSoldInput:true,hasWasteInput:true};
const plan=ctx.buildShowcaseSavePlan_({employee,outlet:'BIMC'},{eventDate:'2026-10-08',entries:[entry]});
assert.equal(plan.result.completed,true);assert.equal(plan.stockRows.filter(row=>row.json.record_type==='LOG').length,3);
assert.deepEqual(Array.from(plan.stockRows.filter(row=>row.json.record_type==='MOVEMENT'),row=>[row.json.location,row.json.direction,row.json.qty]),[['Store','OUT',2],['Showcase','IN',2],['Showcase','OUT',1]]);
assert.throws(()=>ctx.buildShowcaseSavePlan_({employee,outlet:'BIMC'},{eventDate:'2026-10-08',entries:[{...entry,inQty:2,soldQty:9}]}),/Balance/i);
// Exercise real Worker SQL using SQLite's JSON functions and atomic D1 batch behavior.
function d1(){const db=new DatabaseSync(':memory:');return {db,prepare(sql){const statement=db.prepare(sql);let values=[];const api={bind(...bindings){values=bindings;return api;},async run(){const r=statement.run(...values);return {meta:{changes:Number(r.changes)}};},async all(){return {results:statement.all(...values)};}};return api;},async batch(statements){db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};}
const ops=d1(),history=d1(),master=d1();
const env={API_KEY:'test-key',OPERATIONS_DB:ops,HISTORY_DB_2026:history,MASTER_DB:master};
async function api(method,path,payload){const response=await worker.fetch(new Request('https://test'+path,{method,headers:{'x-api-key':'test-key','content-type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)}),env);const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.ok,true);return data;}
const record=(id,json)=>({insertId:id,json});
await api('POST','/v1/application-records?table=stock_movement_corrections',{rows:[record('audit',{outlet:'BIMC',item_code:'PRODUCT',old_qty:2,new_qty:3})]});
await api('POST','/v1/application-records?table=stock_movement_corrections',{rows:[record('audit',{outlet:'BIMC',item_code:'PRODUCT',old_qty:2,new_qty:3})]});
assert.equal((await api('GET','/v1/application-records?table=stock_movement_corrections')).data.length,1);
for(let i=0;i<4;i++)await api('POST','/v1/application-records?table=background_upload_jobs',{rows:[record('job-'+i,{jobId:'job-'+i,status:i===0?'COMPLETE':'QUEUED',ownerNik:i===3?'N2':'N1',outlet:'BIMC'})]});
await api('POST','/v1/application-records?table=background_upload_jobs',{rows:[record('job-1',{jobId:'job-1',status:'PROCESSING',ownerNik:'N1',outlet:'BIMC'})]});
assert.equal((await api('GET','/v1/application-records?table=background_upload_jobs&record_id=job-1')).data[0].status,'PROCESSING');
assert.equal((await api('GET','/v1/application-records?table=background_upload_jobs&active=1&owner_nik=N1')).data.length,2);
const first=await api('GET','/v1/application-records?table=background_upload_jobs&limit=2');assert.ok(first.nextCursor);
assert.equal((await api('GET','/v1/application-records?table=background_upload_jobs&limit=2&cursor='+first.nextCursor)).data.length,2);
for(const [database,table]of [[ops,'stock_movements'],[history,'stock_movements_history']])database.db.exec(`CREATE TABLE ${table}(record_id TEXT,record_type TEXT,item_code TEXT,unit TEXT,quantity REAL,info TEXT);INSERT INTO ${table} VALUES('m','OPNAME_DETAIL','PRODUCT','PCS',3,'{"cardQty":2,"actualQty":3,"reportQty":3}');`);
history.db.exec('CREATE TABLE stock_lot_allocations_history(quantity REAL,unit TEXT,movement_id TEXT)');
ops.db.exec(`CREATE TABLE stock_balances(item_code TEXT,unit TEXT,current_qty REAL,updated_at TEXT);INSERT INTO stock_balances VALUES('PRODUCT','PCS',5,'');
CREATE TABLE stock_lots(item_code TEXT,original_qty REAL,current_qty REAL,unit TEXT,updated_at TEXT);
CREATE TABLE stock_transfer_lines(item_code TEXT,requested_qty REAL,received_qty REAL,unit TEXT);
CREATE TABLE stock_transfer_events(item_code TEXT,qty REAL,received_qty REAL,unit TEXT);`);
master.db.exec("CREATE TABLE stock_items(item_code TEXT,default_unit TEXT,updated_at TEXT);INSERT INTO stock_items VALUES('PRODUCT','PCS','')");
const conversion={itemCode:'PRODUCT',oldUnit:'PCS',newUnit:'BOX',factor:0.1};
await api('POST','/v1/items/convert-unit',conversion);await api('POST','/v1/items/convert-unit',conversion);
assert.equal(ops.db.prepare('SELECT current_qty FROM stock_balances').get().current_qty,0.5);
for(const [database,table]of [[ops,'stock_movements'],[history,'stock_movements_history']]){const audit=JSON.parse(database.db.prepare(`SELECT info FROM ${table}`).get().info);assert.equal(audit.cardQty,0.2);assert.ok(Math.abs(audit.actualQty-0.3)<1e-9);assert.equal(audit.reportQty,3);}
const audit=(await api('GET','/v1/application-records?table=stock_movement_corrections')).data[0];assert.equal(audit.old_qty,0.2);assert.ok(Math.abs(audit.new_qty-0.3)<1e-9);
await api('POST','/v1/items/convert-unit',{...conversion,oldUnit:'BOX',newUnit:'PCS',factor:10});
assert.equal(ops.db.prepare('SELECT current_qty FROM stock_balances').get().current_qty,5);
await api('POST','/v1/application-records?table=stock_summary_jobs',{rows:[record('e',{job_type:'ITEM',action:'ENQUEUE',scope_key:'s',created_at:'2026-10-01T00:00:00Z'}),record('a',{job_type:'ITEM',action:'ACK',scope_key:'s',ack_through:'2026-10-01T00:00:00Z'}),record('pending',{job_type:'ITEM',action:'ENQUEUE',scope_key:'s',created_at:'2026-10-02T00:00:00Z'})]});
await api('POST','/v1/application-records/compact',{});
const queue=await api('GET','/v1/application-records?table=stock_summary_jobs');assert.equal(queue.data.length,2);assert.ok(queue.data.some(row=>row.action==='ACK'));assert.ok(queue.data.some(row=>row.created_at==='2026-10-02T00:00:00Z'));
// Frontend acceptance is recoverable, server confirmation is required, and drafts entered later survive status refresh.
const html=await readFile('docs/showcaselog.html','utf8');
const frontend=html.slice(html.indexOf('    var SHOWCASE_SAVES='),html.indexOf("    byId('eventDate').value=today()"));
const storage=new Map(),nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'2026-10-08',textContent:'',innerHTML:''});return nodes.get(id);};
let response={ok:true,data:{status:'QUEUED'}},requests=[],toasts=[];
const browser=vm.createContext({localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},window:{crypto:{randomUUID}},STATE:{token:'token',user:{nik:'N1'},outlet:'BIMC',items:[item],drafts:{0:{inQty:2}},saving:false},byId:node,collectEntries:()=>[entry],setSaving:value=>browser.STATE.saving=value,renderItems(){},toast:(message,error)=>toasts.push({message,error}),BAKERZIN_API:{call:async(name,args)=>{requests.push({name,args});return response;}},escapeHtml:String,escapeAttr:String,clearTimeout(){},setTimeout(){},showcaseCacheIdentity:()=> 'fallback'});
vm.runInContext(frontend,browser);browser.refreshShowcaseSaves=()=>{};
response={ok:false,error:'Cloudflare HTTP timeout'};browser.save();await new Promise(resolve=>setImmediate(resolve));assert.equal(storage.size,1);assert.ok(browser.STATE.drafts[0]);const requestId=requests[0].args[1].requestId;
response={ok:true,data:{status:'QUEUED'}};browser.save();await new Promise(resolve=>setImmediate(resolve));assert.equal(requests[1].args[1].requestId,requestId);assert.equal(browser.SHOWCASE_SAVES.pending,null);assert.equal(Object.keys(browser.STATE.drafts).length,0);assert.equal(browser.SHOWCASE_SAVES.visible[item.code].inQty.value,2);assert.ok(!toasts.at(-1).message.includes('tersimpan'),'Acceptance must not imply stock was committed');
assert.doesNotMatch(await readFile('docs/stock-upload-jobs.js','utf8'),/mengantri|menunggu|antrean/i);
assert.doesNotMatch(await readFile('docs/stock-card.html','utf8'),/mengantri|menunggu|antrean/i);
console.log('Cloudflare-only access, native FIFO, dual credentials, durable D1 jobs/audits, conversion replay and Showcase acceptance passed.');

const cloudSource=await readFile('cloud-run/stock-reader.js','utf8');
const {createRequire}=await import('node:module');const realRequire=createRequire(import.meta.url);const fetchCalls=[];
const cloud=vm.createContext({module:{exports:{}},require:name=>name==='@google-cloud/firestore'?{Firestore:class{collection(){return{doc(){return{async get(){return{exists:false}},async set(){}}}}}}}:realRequire(name),process:{env:{CLOUDFLARE_INVENTORY_API_URL:'https://inventory.test',CLOUDFLARE_INVENTORY_API_KEY:'cloud-key'}},URL,AbortSignal,console,Buffer,fetch:async(url,options)=>{assert.equal(options.headers['x-api-key'],'cloud-key');fetchCalls.push(url);let data=url.pathname==='/v1/movements'?{data:[{record_id:'m1',event_date:'2026-10-08',quantity:2,direction:'IN'}]}:url.searchParams.get('cursor')?{data:[{item_code:'PRODUCT',item_name:'Cake',current_qty:5}]}:{data:[],nextCursor:'NEXT'};return{ok:true,json:async()=>({ok:true,...data})};}});
vm.runInContext(cloudSource,cloud);const historyResult=await cloud.module.exports.getStockHistory({outlet:'BIMC',location:'Store',itemCode:'PRODUCT',itemName:'Cake'});
assert.equal(historyResult.currentQty,5);assert.equal(historyResult.history[0].qty,2);assert.equal(historyResult.meta.source,'CLOUDFLARE');assert.equal(fetchCalls.length,3);
cloud.process.env.CLOUDFLARE_INVENTORY_API_KEY='';await assert.rejects(cloud.module.exports.getStockHistory({outlet:'BIMC',location:'Store',itemCode:'PRODUCT'}),/Cloudflare/);
console.log('Cloud Run history uses authenticated Cloudflare reads, paginated balances and explicit configuration failure.');
