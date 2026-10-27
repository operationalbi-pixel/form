import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac,randomUUID,createHash} from 'node:crypto';
import worker from '../src/index.js';
import {remainingLots,conversionFactor} from '../src/showcase-inventory.js';
const date=new Date(Date.now()+7*3600000).toISOString().slice(0,10),origin='https://operationalbi-pixel.github.io',secret='test-key';
const item={code:'SC-TEST',name:'Cake',category:'SLICE CAKE',unit:'SLICE',productName:'Whole cake',productUnit:'PCS',productQty:0.125};
function database(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=OFF');const api={db,failAt:0,loseAck:false,beforeBatch:null,withSession(){return api;},prepare(sql){let args=[];const statement=db.prepare(sql);const p={bind(...values){args=values;return p;},run(){const r=statement.run(...args);return Promise.resolve({meta:{changes:Number(r.changes)}});},all(){return Promise.resolve({results:statement.all(...args)});},exec(){return /^(SELECT|WITH)/i.test(sql.trim())?{results:statement.all(...args)}:{meta:{changes:Number(statement.run(...args).changes)}}}};return p;},async batch(statements){if(api.beforeBatch){const fn=api.beforeBatch;api.beforeBatch=null;await fn();}db.exec('BEGIN');try{const result=statements.map((stmt,i)=>{if(api.failAt===i+1){api.failAt=0;throw Error('injected SQL failure');}return stmt.exec();});db.exec('COMMIT');if(api.loseAck){api.loseAck=false;throw Error('lost acknowledgement after commit');}return result;}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}}};return api;}
function schema(db){const sql=readFileSync(new URL('../../migrations/0001_operations.sql',import.meta.url),'utf8');db.exec(sql.match(/CREATE TABLE IF NOT EXISTS stock_movements \([\s\S]*?\n\);/)[0]);db.exec('CREATE TABLE stock_balances(outlet_code TEXT,location_code TEXT,item_code TEXT,item_name TEXT,current_qty REAL,unit TEXT,updated_at TEXT,PRIMARY KEY(outlet_code,location_code,item_code));CREATE TABLE application_records(table_name TEXT NOT NULL,record_id TEXT NOT NULL,outlet_code TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(table_name,record_id))');}
function fixture(){const ops=database(),master=database(),history=database();schema(ops.db);schema(history.db);history.db.exec('ALTER TABLE stock_movements RENAME TO stock_movements_history');master.db.exec("CREATE TABLE stock_items(item_code TEXT,item_name TEXT,category TEXT,default_unit TEXT,active INTEGER);INSERT INTO stock_items VALUES('PRODUCT','Whole cake','CAKE','PCS',1);CREATE TABLE stock_unit_conversions(item_code TEXT,from_unit TEXT,to_unit TEXT,factor REAL,active INTEGER)");return {ops,env:{API_KEY:secret,OPERATIONS_DB:ops,MASTER_DB:master,HISTORY_DB_2026:history}};}
function token(overrides={}){const now=Math.floor(Date.now()/1000),data={aud:'showcase-direct-v1',iat:now,exp:now+300,owner:'N1',outlet:'OUTLET',item,...overrides},encoded=Buffer.from(JSON.stringify(data)).toString('base64url');return encoded+'.'+createHmac('sha256',secret).update('showcase-direct-v1.'+encoded).digest('base64url');}
function payload(id,revision,entry){return {outlet:'OUTLET',eventDate:date,requestId:'row-'+id+'-'+revision,rowEdit:{id,revision},entries:[{itemCode:item.code,...entry}]};}
async function api(env,body,options={}){const response=await worker.fetch(new Request('https://inventory.test/v1/showcase-direct',{method:options.method||'POST',headers:{Origin:options.origin||origin,Authorization:'Bearer '+(options.token||token()),'Content-Type':'application/json'},body:options.method==='OPTIONS'?undefined:JSON.stringify(body)}),env);return {status:response.status,headers:response.headers,body:response.status===204?null:await response.json()};}
function seed(ops,{code=item.code,location='Showcase',qty=10,type='Transfer In',id=randomUUID(),event=date,...rest}={}){ops.db.prepare('INSERT INTO stock_movements(record_id,logical_id,version,record_type,outlet_code,location_code,item_code,item_name,unit,direction,quantity,movement_type,info,event_date,created_by,created_at,arrival_date,expiry_date,production_date) VALUES(?,?,1,\'MOVEMENT\',\'OUTLET\',?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,id,location,code,code===item.code?'Cake':'Whole cake',code===item.code?'SLICE':'PCS',qty>=0?'IN':'OUT',Math.abs(qty),type,rest.info||'',event,'seed',new Date().toISOString(),rest.arrival||event,rest.expiry||null,rest.production||null);ops.db.prepare('INSERT INTO stock_balances VALUES(?,?,?,?,?,?,?) ON CONFLICT(outlet_code,location_code,item_code) DO UPDATE SET current_qty=current_qty+excluded.current_qty').run('OUTLET',location,code,code,qty,code===item.code?'SLICE':'PCS',new Date().toISOString());}
// Authentication is scoped to a single employee/outlet/item; a browser never receives the API key.
{
 const {env,ops}=fixture(),p=payload(randomUUID(),1,{soldQty:1,hasSoldInput:true});seed(ops);
 assert.equal((await api(env,p,{origin:'https://evil.test'})).status,403);
 assert.equal((await api(env,p,{token:token({exp:1})})).status,401);
 assert.equal((await api(env,p,{token:token().slice(0,-2)+'xx'})).status,401);
 assert.equal((await api(env,{...p,outlet:'OTHER'})).status,403);
 assert.equal((await api(env,p,{token:token({item:{...item,code:'OTHER'}})})).status,403);
 assert.equal((await api(env,p,{method:'OPTIONS'})).status,204);
 assert.equal((await api(env,p,{method:'OPTIONS'})).headers.get('access-control-allow-origin'),origin);
 assert.equal(ops.db.prepare("SELECT COUNT(*) n FROM application_records").get().n,0);
}
// Entire row commits in one batch: product transfer, Showcase movements, progress, revision and receipt.
{
 const {env,ops}=fixture(),id=randomUUID();seed(ops,{code:'PRODUCT',location:'Store',qty:2,expiry:'2026-12-31',production:'2026-10-01'});
 const first=payload(id,1,{inQty:8,hasInInput:true,soldQty:2,hasSoldInput:true,wasteQty:1,hasWasteInput:true});
 let result=await api(env,first);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.data.status,'COMPLETE');
 assert.equal(result.body.data.item.balance,5);assert.equal(ops.db.prepare("SELECT current_qty FROM stock_balances WHERE location_code='Store'").get().current_qty,1);
 const added=ops.db.prepare("SELECT * FROM stock_movements WHERE source_file='SHOWCASE_LOG'").all();assert.equal(added.length,7);
 assert.ok(added.some(r=>r.location_code==='Showcase'&&r.expiry_date==='2026-12-31'&&r.production_date==='2026-10-01'));
 assert.equal(ops.db.prepare("SELECT COUNT(*) n FROM application_records").get().n,2);
 const n=ops.db.prepare('SELECT COUNT(*) n FROM stock_movements').get().n;
 result=await api(env,first);assert.equal(result.status,200);assert.equal(ops.db.prepare('SELECT COUNT(*) n FROM stock_movements').get().n,n);
 const p2=payload(id,2,{inQty:8,hasInInput:true,soldQty:3,hasSoldInput:true,wasteQty:1,hasWasteInput:true});
 result=await api(env,p2);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.data.item.balance,4);assert.equal(result.body.data.item.total_sold,3);
 const reverse=await api(env,payload(id,3,{inQty:8,hasInInput:true,soldQty:1,hasSoldInput:true,wasteQty:1,hasWasteInput:true}));assert.equal(reverse.body.data.item.balance,6);
 assert.equal((await api(env,payload(id,3,{soldQty:9,hasSoldInput:true}))).status,409);
}
// A statement failure rolls back ALL stock and audit writes. A lost acknowledgement replays the committed receipt.
{
 const {env,ops}=fixture(),p=payload(randomUUID(),1,{soldQty:2,hasSoldInput:true});seed(ops);
 ops.failAt=3;let r=await api(env,p);assert.equal(r.status,503);assert.equal(ops.db.prepare("SELECT current_qty FROM stock_balances").get().current_qty,10);assert.equal(ops.db.prepare('SELECT COUNT(*) n FROM application_records').get().n,0);
 ops.loseAck=true;r=await api(env,p);assert.equal(r.status,200);assert.equal(r.body.data.status,'COMPLETE');assert.equal(ops.db.prepare('SELECT current_qty FROM stock_balances').get().current_qty,8);
 const n=ops.db.prepare('SELECT COUNT(*) n FROM stock_movements').get().n;await api(env,p);assert.equal(ops.db.prepare('SELECT COUNT(*) n FROM stock_movements').get().n,n);
}
// Concurrent sales cannot oversell: the second atomic guard must refresh and validate the new balance.
{
 const {env,ops}=fixture();seed(ops,{qty:3});const p=payload(randomUUID(),1,{soldQty:2,hasSoldInput:true});
 let entered;const barrier=new Promise(resolve=>entered=resolve);let release;const hold=new Promise(resolve=>release=resolve);
 ops.beforeBatch=async()=>{entered();await hold;};const first=api(env,p);await barrier;
 const second=await api(env,payload(randomUUID(),1,{soldQty:2,hasSoldInput:true}));assert.equal(second.status,200);release();
 const result=await first;assert.equal(result.status,422,JSON.stringify(result.body));assert.equal(ops.db.prepare('SELECT current_qty FROM stock_balances').get().current_qty,1);
 assert.equal(ops.db.prepare("SELECT COUNT(*) n FROM application_records WHERE table_name='showcase_direct_receipts'").get().n,1);
}
// Existing accepted GAS work is fenced off; new writes are not added to its queue.
{
 const {env,ops}=fixture();seed(ops);ops.db.prepare("INSERT INTO application_records VALUES('background_upload_jobs','old','OUTLET',?,'now')").run(JSON.stringify({type:'SHOWCASE_LOG',status:'PROCESSING'}));
 const r=await api(env,payload(randomUUID(),1,{soldQty:2,hasSoldInput:true}));assert.equal(r.status,409);assert.equal(r.body.error.code,'LEGACY_WRITE_ACTIVE');assert.equal(ops.db.prepare('SELECT COUNT(*) n FROM application_records').get().n,1);
}
// Absolute total corrections, invalid dates, zero inputs and explicit clearing remain deterministic.
{
 const {env,ops}=fixture(),id=randomUUID();seed(ops,{qty:10});await api(env,payload(id,1,{soldQty:2,hasSoldInput:true}));
 let r=await api(env,payload(id,2,{soldQty:0,hasSoldInput:true,soldTotal:1,hasSoldTotal:true}));assert.equal(r.status,200);assert.equal(r.body.data.item.balance,9);assert.equal(r.body.data.result.rowEdit.values.soldQty,0);
 assert.equal((await api(env,{...payload(randomUUID(),1,{soldQty:0,hasSoldInput:true}),eventDate:'2026-99-01'})).status,422);
 assert.equal((await api(env,payload(randomUUID(),1,{soldQty:-1,hasSoldInput:true}))).status,422);
}
// FIFO metadata and conversion rules remain compatible with the established ledger implementation.
assert.equal(conversionFactor('X','PCK@1LT','ML',[]),1000);
assert.equal(conversionFactor('X','PCS','BOX',[{from_unit:'PCS',to_unit:'PACK',factor:0.5},{from_unit:'PACK',to_unit:'BOX',factor:0.25}]),0.125);
const lots=remainingLots([{record_id:'in',record_type:'MOVEMENT',item_code:'X',quantity:4,direction:'IN',event_date:'2026-10-01',arrival_date:'2026-09-30',production_date:'2026-09-28',expiry_date:'2026-12-31',created_at:'2026-10-01T00:00:00Z'},{record_id:'out',record_type:'MOVEMENT',item_code:'X',quantity:1,direction:'OUT',event_date:'2026-10-02',created_at:'2026-10-02T00:00:00Z'}]);
assert.equal(lots[0].qty,3);assert.equal(lots[0].sourceDate,'2026-09-30');assert.equal(lots[0].productionDate,'2026-09-28');
console.log('Direct Showcase saves: scoped auth/CORS, atomic SQL, concurrent balances, transfer metadata, revisions, rollback and lost acknowledgements passed.');
