import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import worker from '../cloudflare/inventory-api/src/index.js';

const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE stock_balances(outlet_code TEXT,location_code TEXT,item_code TEXT,item_name TEXT,current_qty REAL,unit TEXT,updated_at TEXT); CREATE TABLE stock_transfer_events(transfer_id TEXT,from_outlet TEXT,to_outlet TEXT,created_at TEXT,status TEXT,item_name TEXT,expiry_date TEXT)');
for(const code of ['A','B','C'])db.prepare('INSERT INTO stock_balances VALUES(?,?,?,?,?,?,?)').run('BICP','Store',code,code,3,'PCS','now');
db.prepare('INSERT INTO stock_balances VALUES(?,?,?,?,?,?,?)').run('OTHER','Store','A','A',99,'PCS','now');
for(const id of ['old','new','unrelated'])db.prepare('INSERT INTO stock_transfer_events VALUES(?,?,?,?,?,?,?)').run(id,'BICP','DEST','2026-01-01','PENDING','Cake','');
db.prepare('INSERT INTO stock_transfer_events VALUES(?,?,?,?,?,?,?)').run('private','OTHER','DEST','2026-01-01','PENDING','Cake','');
const env={API_KEY:'test',OPERATIONS_DB:{prepare(sql){const statement=db.prepare(sql);return{bind(...args){return{async all(){return{results:statement.all(...args)}}}}}}}};
async function get(path){return worker.fetch(new Request('https://test'+path,{headers:{'x-api-key':'test'}}),env)}
let response=await get('/v1/balances?outlet=BICP&location=Store&item_codes=A|C&limit=1');
let page=await response.json();assert.deepEqual(page.data.map(r=>r.item_code),['A']);assert.equal(page.nextCursor,'A');
page=await(await get('/v1/balances?outlet=BICP&location=Store&item_codes=A|C&limit=1&cursor=A')).json();assert.deepEqual(page.data.map(r=>r.item_code),['C']);assert.equal(page.nextCursor,null);
assert.equal((await(await get('/v1/balances?outlet=BICP&location=Store')).json()).data.length,3,'legacy full balance reads remain supported');
page=await(await get('/v1/transfer-events?outlet=BICP&transfer_ids=old|private|missing')).json();assert.deepEqual(page.data,[{transfer_id:'old'}],'exact transfer presence is restricted to outlet and has no recent-event truncation');
assert.equal((await get('/v1/transfer-events?outlet=BICP&transfer_ids='+Array.from({length:41},(_,i)=>'ID'+i).join('|'))).status,400);
assert.equal((await get('/v1/balances?outlet=BICP&location=Store&item_codes='+Array.from({length:41},(_,i)=>'ID'+i).join('|'))).status,400);

const c={console,PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},Utilities:{formatDate:d=>d.toISOString().slice(0,10)}};vm.createContext(c);vm.runInContext(fs.readFileSync('gas/Code.gs','utf8'),c);
const rows=Array.from({length:40},(_,i)=>({outletName:i<20?'BICP':'BISS',transactionDate:'2026-10-'+String(i%20+1).padStart(2,'0'),code:'A',unit:'PCS',qty:1,journalNumber:String(i)}));
Object.assign(c,{parseItemJournalReport_:()=>({rows:structuredClone(rows),unauthorizedRowsSkipped:0}),readStoreCodeDirectory_:()=>({byName:{BICP:{code:'BICP'},BISS:{code:'BISS'}}}),readStockMaster_:()=>[{code:'A',unit:'PCS'}],readStockUnitConversions_:()=>({}),digest_:v=>v});
let queries=[];c.cloudflareReadAllPages_=(path,params)=>{queries.push({path,params});return []};
assert.equal(c.prepareItemJournalImport_({outlet:'BIHQ'},{fileName:'test.xlsx',base64:'file'},true).rows.length,40);
assert.equal(queries.length,2,'40 outlet/date combinations share two scoped period reads');assert.ok(queries.every(q=>q.params.from==='2026-10-01'&&q.params.to==='2026-10-20'&&q.params.movement_type==='Item Journal'&&q.params.resolve_scope===1));
queries=[];c.prepareItemJournalImport_({outlet:'BIHQ'},{fileName:'test.xlsx',base64:'file'},true,{includeExisting:true});assert.equal(queries.length,0);assert.throws(()=>c.prepareItemJournalImport_({outlet:'BICP'},{fileName:'test.xlsx',base64:'file'},true),/bukan outlet login/);
queries=[];c.readCurrentStockCodeQtyMapForItems_('BICP','Store',Array.from({length:81},(_,i)=>'A'+i));assert.equal(queries.length,3);assert.ok(queries.every(q=>q.params.item_codes.split('|').length<=40));

function ledger(id,date,quantity,direction,extra={}){return{record_id:id,logical_id:id,outlet_code:'BICP',location_code:'Store',item_code:'A',record_type:'MOVEMENT',event_date:date,quantity,direction,created_at:date+'T01:00:00Z',movement_type:'Goods Receipt',...extra}}
queries=[];c.cloudflareReadAllPages_=(path,params)=>{queries.push({path,params});return [ledger('receipt','2026-09-01',10,'IN'),ledger('so','2026-10-01',3,'OUT',{movement_type:'Stock Opname',source_hash:'so',source_row:1}),ledger('audit','2026-10-01',7,'',{record_type:'OPNAME_DETAIL',movement_type:'Stock Opname Audit',source_hash:'so',source_row:1,info:JSON.stringify({actualQty:7,eventDate:'2026-10-01'})}),ledger('later','2026-10-02',4,'IN')]};
assert.equal(c.readStockCodeQtyMapAtDate_('BICP','Store','2026-10-01',['A']).A,7,'SO audit sets the historical checkpoint and later flow stays out');assert.equal(queries[0].params.item_codes,'A');assert.equal(queries[0].params.to,'2026-10-01');assert.equal(queries[0].params.resolve_scope,1);
queries=[];c.cloudflareReadAllPages_=(path,params)=>{queries.push({path,params});return Array.from({length:550},(_,i)=>ledger(String(i).padStart(4,'0'),'2026-09-01',1,'IN')).concat(ledger('out','2026-10-01',520,'OUT',{movement_type:'Usage'}));};
const lots=c.readTransferAvailableLotsBatch_('BICP','Store',[{code:'A'}]);assert.equal(lots.A.reduce((sum,lot)=>sum+lot.qty,0),30,'batch FIFO retains opening receipts beyond the old 500-row cutoff');assert.equal(queries.length,1);

// Slow preloading must not consume the worker's entire write window and repeat forever.
let clock=Date.parse('2026-10-12T00:00:00Z');const RealDate=Date;
class ClockDate extends RealDate{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
const job={jobId:'job',outlet:'BICP',location:'Store',status:'PROCESSING',preparedDriveId:'prepared',processed:0,total:2,createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z'};
const properties={['stock-position-upload-job-job']:JSON.stringify(job)};
const saved={Date:c.Date,PropertiesService:c.PropertiesService};
Object.assign(c,{stockUploadJobEmployee_:()=>({nik:'N',outlet:'BICP'}),Date:ClockDate,PropertiesService:{getScriptProperties:()=>({getProperties:()=>({...properties}),deleteProperty:key=>delete properties[key]})},ScriptApp:{getProjectTriggers:()=>[]},acquireStockUploadLock_:()=>({releaseLock(){}}),acquireStockScopeLock_:()=>({releaseLock(){}}),writeStockPositionJob_:j=>{properties['stock-position-upload-job-job']=JSON.stringify(j);return j},stockPositionJobJson_:()=>({items:[{delta:-1,item:{code:'A'}},{delta:1,item:{code:'B'}}]}),readTransferAvailableLotsBatch_:()=>{clock+=60000;return{A:[]}},processStockPositionJobItem_:j=>{j.processed++;return j},cleanupStockPositionJobFiles_(){},scheduleStockPositionWorker_(){}});
assert.equal(c.processStockPositionUploadJobs().status,'COMPLETE','a 60-second lot preload still leaves time to persist the slice');
c.Date=saved.Date;c.PropertiesService=saved.PropertiesService;

queries=[];let transfers=[];c.cloudflareReadAllPages_=(path,params)=>{queries.push({path,params});return [ledger('gd','2026-10-01',2,'OUT',{movement_type:'Transfer Out Antar Outlet',source_hash:'saved',transfer_id:'old'})]};c.cloudflareReadTransferEvents_=params=>{transfers.push(params);return [{transfer_id:'old'}]};
let duplicates=c.findGoodsDeliveryDuplicateRows_('BICP',[{sourceRow:1,transactionDate:'2026-10-01',itemCode:'A',rowHash:'saved'}]);assert.equal(duplicates[0].recoveryMovements.length,0);assert.equal(transfers[0].transfer_ids,'old');assert.equal(queries[0].params.resolve_scope,1);
transfers=[];c.findGoodsDeliveryDuplicateRows_('BICP',[{sourceRow:1,transactionDate:'2026-10-01',itemCode:'A',rowHash:'fresh'}]);assert.equal(transfers.length,0,'new files never load outlet transfer history');
c.cloudflareReadTransferEvents_=()=>[];duplicates=c.findGoodsDeliveryDuplicateRows_('BICP',[{sourceRow:1,transactionDate:'2026-10-01',itemCode:'A',rowHash:'saved'}]);assert.equal(duplicates[0].recoveryMovements[0].transferId,'old','missing transfer events still enter recovery');

const html=fs.readFileSync('docs/stock-card.html','utf8'),start=html.indexOf('    function beginFileVerification('),end=html.indexOf('    function requestGoodsDeliveryVerification',start);
const timers=new Map(),ui={APP:{},Date,byId:()=>({disabled:false,value:'2026-10-01'}),setInterval:fn=>{const id=timers.size+1;timers.set(id,fn);return id},clearInterval:id=>timers.delete(id)};vm.createContext(ui);vm.runInContext(html.slice(start,end),ui);
for(const key of ['itemJournal','goodsDelivery','stockPosition','stockOpname']){
 ui.APP[key]={fileName:'file.xlsx',base64:'old',verified:true};let ticks=0;
 const old=ui.beginFileVerification(key,['upload'],()=>ticks++,40,'Memeriksa.');assert.equal(ui.APP[key].verified,false);timers.get(ui.APP[key].progressTimer)();assert.equal(ticks,2);
 const newer=ui.beginFileVerification(key,['upload'],()=>ticks++,40,'Memeriksa.');assert.equal(old.finish(),false);assert.equal(newer.finish(),true);assert.equal(timers.size,0);
 const replaced=ui.beginFileVerification(key,['upload'],()=>{},40,'Memeriksa.');ui.APP[key].base64='new';assert.equal(replaced.finish(),false);assert.equal(timers.size,0);
}
console.log('All four uploads scope duplicate/balance reads, batch complete FIFO history, preserve transfer/SO recovery, and ignore stale verification replies.');

queries=[];c.cloudflareReadAllPages_=(path,params)=>{queries.push({path,params});return []};c.cloudflareLedgerRows_({outlet:'BICP',sourceHashes:Array.from({length:25},(_,i)=>'hash'+i)});assert.equal(queries.length,3);assert.ok(queries.every(q=>q.params.source_hashes&&q.params.source_hashes.split('|').length<=12));
queries=[];c.cloudflareLedgerRows_({outlet:'BICP',location:'Store',resolveScope:true,itemCodes:Array.from({length:25},(_,i)=>'P'+i)});assert.equal(queries.length,3);assert.ok(queries.every(q=>q.params.item_codes.split('|').length<=10));
