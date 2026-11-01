import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('docs/Code.gs','utf8');
const c={console};vm.createContext(c);vm.runInContext(source,c);
// Real background loop with an explicit simulated service clock. This checks
// scheduling, not production network throughput or an end-to-end SLA.
let clock=Date.parse('2026-10-12T00:00:00Z');
class ClockDate extends Date {constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
let store={},calls=0,schedules=0;
function setup(total,stepMillis,extra=[]){
 clock=Date.parse('2026-10-12T00:00:00Z');calls=0;schedules=0;
 store={job:JSON.stringify({jobId:'large',status:'PROCESSING',processed:0,total,createdAt:new Date(clock).toISOString()})};
 store=Object.fromEntries([['sales-cogs-upload-job-large',store.job],...extra.map(j=>['sales-cogs-upload-job-'+j.jobId,JSON.stringify(j)])]);
 Object.assign(c,{Date:ClockDate,PropertiesService:{getScriptProperties:()=>({getProperties:()=>({...store}),deleteProperty:k=>delete store[k]})},
 ScriptApp:{getProjectTriggers:()=>[]},acquireStockScopeLock_:()=>({releaseLock(){}}),
 writeSalesCogsJob_:j=>{store['sales-cogs-upload-job-'+j.jobId]=JSON.stringify(j);return j},
 processSalesCogsJobChunk_:j=>{calls++;clock+=stepMillis;j.processed=Math.min(j.total,j.processed+500);if(j.processed===j.total)j.status='COMPLETE';return j},
 scheduleSalesCogsWorker_:()=>schedules++});
}
setup(14172,5000);const started=clock;
assert.equal(c.processSalesCogsUploadJobs().status,'COMPLETE');assert.equal(calls,29);assert.equal(clock-started,145000);assert.equal(schedules,0,'no trigger-delivery waits between 29 batches');
setup(50000,30000);assert.equal(c.processSalesCogsUploadJobs().status,'PROCESSING');assert.ok(clock-Date.parse('2026-10-12T00:00:00Z')<240000);assert.equal(schedules,1,'unfinished jobs checkpoint and reschedule before the execution limit');
const saved=JSON.parse(store['sales-cogs-upload-job-large']);assert.equal(saved.workerLeaseUntil,0);assert.ok(saved.processed>0);
store['sales-cogs-upload-job-new']=JSON.stringify({jobId:'new',status:'PROCESSING',processed:0,total:1,createdAt:'2026-10-11T23:59:00Z'});
assert.equal(c.processSalesCogsUploadJobs().jobId,'new','a remaining large job still gives the next outlet a turn');


// Recurring scheduling replaces a one-shot trigger once, then keeps one
// lightweight minute tick until the queue is empty.
const scheduler={console};vm.createContext(scheduler);vm.runInContext(source,scheduler);
const triggerProperties={},triggers=[];let created=0,deleted=0;
Object.assign(scheduler,{
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>({
    getProperty:key=>triggerProperties[key]||'',
    setProperty:(key,value)=>{triggerProperties[key]=value},
    deleteProperty:key=>{delete triggerProperties[key]},
    getProperties:()=>({})
  })},
  ScriptApp:{
    getProjectTriggers:()=>triggers.slice(),
    deleteTrigger:trigger=>{deleted++;triggers.splice(triggers.indexOf(trigger),1)},
    newTrigger:handler=>({timeBased:()=>({everyMinutes:n=>{assert.equal(n,1);return{create:()=>{created++;triggers.push({getHandlerFunction:()=>handler})}}}})})
  },
  acquireStockScopeLock_:()=>({releaseLock(){}})
});
assert.equal(scheduler.scheduleSalesCogsWorker_(),true);
assert.equal(scheduler.scheduleSalesCogsWorker_(),true);
assert.equal(created,1,'repeated status polls must not create duplicate triggers');
assert.equal(triggers.length,1);
assert.equal(scheduler.processSalesCogsUploadJobs().processed,false);
assert.equal(triggers.length,0,'idle queue removes the minute trigger');
assert.equal(deleted,1);
assert.equal(triggerProperties['sales-cogs-worker-recurring-v1'],undefined);

const g={console};vm.createContext(g);vm.runInContext(source,g);
const input=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')).rows:Array.from({length:14172},(_,i)=>({product:'P'+i%452,unit:'PCS',qty:1,transactionDate:'2026-10-'+String(6+i%6).padStart(2,'0')}));
const master=Object.fromEntries([...new Set(input.map(r=>r.product))].map((name,i)=>[name,{code:'P'+i,name,unit:'PCS'}]));
const rows=input.map(r=>({...r,outlet:'BICP',item:master[r.product]}));
let preloads=0;
g.cloudflarePreloadSalesFifoRows_=p=>{preloads++;assert.ok(p.itemCodes.length<=30);return p.itemCodes.map(itemCode=>({itemCode,recordType:'MOVEMENT',movementType:'Goods Receipt',date:'2026-01-01',direction:'IN',qty:100000,createdAt:'2026-01-01T00:00:00Z',productionDate:'2026-01-01'}))};
g.cloudflarePreloadSalesFifoRowsBatch_=requests=>requests.map(g.cloudflarePreloadSalesFifoRows_);
const state=g.preloadSalesFifoLots_(rows,{byCode:{},byName:{}},{},{});
assert.equal(preloads,Math.ceil(Object.keys(master).length/30));
const before=preloads;for(const row of rows){const lots=g.salesConsumeInventoryLots_(state,row.outlet,row.item.code,row.transactionDate,row.qty);assert.ok(Math.abs(lots.reduce((s,l)=>s+l.qty,0)-row.qty)<1e-7)}
assert.equal(preloads,before,'FIFO allocation itself never calls the network');
let formats=0,invalidated=[];
g.Utilities={formatDate:date=>{formats++;return new Date(date).toISOString().slice(0,7)}};
g.digest_=v=>v;g.removeScriptCacheKeys_=keys=>invalidated=keys;
const repeated=Array.from({length:500},()=>({json:{outlet:'BICP',location:'Store',item_code:'P',item_name:'Cake',event_date:'2026-10-01',version:1}}));
g.invalidateStockItemCachesForRows_(repeated);
assert.ok(formats<=4,'500 repeated sales rows format month boundaries only once per item');
assert.ok(invalidated.some(k=>k.includes('2026-10')));
// Earlier correction months must not be dropped by deduplication.
formats=0;g.invalidateStockItemCachesForRows_([...repeated,{json:{...repeated[0].json,version:2}}]);assert.ok(invalidated.some(k=>k.includes('2019-01')));

// Exercise the actual fetchAll helper: ordered results, bounded parallelism,
// and selective retry when one of the independent read responses fails.
const h={console};vm.createContext(h);vm.runInContext(source,h);
let waves=[],retries=[];
h.cloudflareInventoryConfig_=()=>({url:'https://inventory.test',apiKey:'private-test'});
h.cloudflareMovementToApp_=row=>row;
h.cloudflarePreloadSalesFifoRows_=payload=>{retries.push(payload.id);return [{id:payload.id,retried:true}]};
h.UrlFetchApp={fetchAll:requests=>{waves.push(requests.length);return requests.map(request=>{
 assert.equal(request.headers['x-api-key'],'private-test');assert.equal(request.method,'post');
 const payload=JSON.parse(request.payload);
 assert.equal(payload.outlet,'BICP');assert.equal(payload.to,'2026-10-11');assert.equal(payload.excludedSourceHashes[0],'exclude');
 return {getResponseCode:()=>payload.id===4?503:200,getContentText:()=>JSON.stringify({ok:payload.id!==4,data:[{id:payload.id}]})};
})}};
const requests=Array.from({length:7},(_,id)=>({id,outlet:'BICP',to:'2026-10-11',excludedSourceHashes:['exclude'],itemCodes:['P'+id]}));
let loaded=h.cloudflarePreloadSalesFifoRowsBatch_(requests);
assert.deepEqual(waves,[3,3,1]);assert.deepEqual(retries,[4]);assert.deepEqual(Array.from(loaded,rows=>rows[0].id),[0,1,2,3,4,5,6]);
h.UrlFetchApp.fetchAll=()=>{throw Error('network')};retries=[];
loaded=h.cloudflarePreloadSalesFifoRowsBatch_(requests.slice(0,3));assert.deepEqual(retries,[0,1,2]);assert.equal(loaded.length,3);
h.cloudflarePreloadSalesFifoRows_=()=>{throw Error('permanent failure')};assert.throws(()=>h.cloudflarePreloadSalesFifoRowsBatch_(requests.slice(0,1)),/permanent failure/);

const worker=fs.readFileSync('cloudflare/inventory-api/src/index.js','utf8');
function extract(name){const start=worker.indexOf('async function '+name+'(');return worker.slice(start,worker.indexOf('__name('+name,start))}
let batches=0,reads=0;
const old={record_id:'old',logical_id:'same',version:1,created_at:'2026-10-01'};
const corrected={record_id:'corrected',logical_id:'same',version:2,created_at:'2026-10-02'};
function database(data){return{prepare(sql){return{bind(...ids){return{sql,ids}}}},async batch(statements){batches++;return statements.map(s=>{reads++;return{results:data.filter(r=>s.ids.includes(r.logical_id||r.record_id))}})}}}
const history=database([old]),operations=database([corrected]);
const w={console,historyDatabasesForRange:()=>[{database:history}],cleanText:v=>String(v||''),newerMovement:(a,b)=>!b||a.version>b.version};vm.createContext(w);vm.runInContext(extract('existingMovementState'),w);
const movements=Array.from({length:400},(_,i)=>({logical_id:i?'id'+i:'same',record_id:i?'id'+i:'corrected',event_date:'2026-10-02'}));
const existing=await w.existingMovementState({OPERATIONS_DB:operations},movements);
assert.equal(batches,2,'400 IDs use two D1 read round trips instead of sixteen');assert.equal(reads,16,'all original ID checks remain');assert.equal(existing.active.get('same').version,2);assert.equal(existing.duplicateIds.has('corrected'),true);
await assert.rejects(()=>w.existingMovementState({OPERATIONS_DB:{...operations,batch:async()=>{throw Error('unavailable')}}},movements),/unavailable/,'a failed shard read cannot be mistaken for no duplicates');
const fifoHistory=[
 {recordId:'in-1',date:'2026-10-01',createdAt:'2026-10-01T08:00:00Z',direction:'IN',qty:12,movementType:'Goods Receipt',productionDate:'2026-09-30',sourceArrivalDate:'2026-10-01'},
 {recordId:'out-1',date:'2026-10-02',createdAt:'2026-10-02T08:00:00Z',direction:'OUT',qty:5,movementType:'Sold'},
 {recordId:'in-2',date:'2026-10-03',createdAt:'2026-10-03T08:00:00Z',direction:'IN',qty:4,movementType:'Goods Receipt',productionDate:'2026-10-02',sourceArrivalDate:'2026-10-03'}
];
const fullFifo=g.calculateFifoSnapshots_(JSON.parse(JSON.stringify(fifoHistory)));
const finalFifo=g.calculateFifoSnapshots_(JSON.parse(JSON.stringify(fifoHistory)),true);
assert.deepEqual(JSON.parse(JSON.stringify(finalFifo.__final)),JSON.parse(JSON.stringify(fullFifo['2026-10-03'])),'final-only FIFO keeps the exact closing lots');
assert.deepEqual(Object.keys(finalFifo),['__final'],'large imports avoid cloning a snapshot for every historical movement');
console.log(`COGS speed checks passed: ${input.length} rows / ${Object.keys(master).length} products; ${preloads} scoped preload requests (mock history); 29 batches in one simulated 145-second execution; duplicate/correction checks preserved.`);
