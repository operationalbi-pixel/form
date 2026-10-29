import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createHash} from 'node:crypto';
const source=fs.readFileSync('docs/Code.gs','utf8');
const make=()=>{const c={console};vm.createContext(c);vm.runInContext(source,c);return c;};
const noopLock={releaseLock(){}};
// The real Usage planner must persist its exact allocations before a write.
const c=make(),files=new Map(),stored=[];let id=0,first=true,builds=0;
const prepared={fileName:'COGS.xlsx',rows:[{outlet:'BISS',rowHash:'sale',salesNumber:'S1',menu:'Menu',product:'P',sourceRow:2,item:{code:'P',name:'P',unit:'PCS'},qtyDefault:5,transactionDate:'2026-10-28'}],showcaseRows:[]};
const ledger=new Map();
Object.assign(c,{stockUploadJobEmployee_:()=>({nik:'N',outlet:'BISS'}),acquireStockUploadLock_:()=>noopLock,
 readSalesCogsJobJson_:file=>files.has(file)?JSON.parse(files.get(file)):file==='request'?{}:prepared,
 writeSalesCogsJob_:job=>{stored.push(JSON.parse(JSON.stringify(job)));return job;},salesCogsReferenceData_:()=>({wipCatalog:{},savedConversions:{},salesMappings:{},masterByCode:{}}),preloadSalesFifoLots_:()=>{builds++;return{};},salesTargetIsWip_:()=>false,salesConsumeInventoryLots_:()=>[{qty:5}],
 Utilities:{getUuid:()=>String(++id),newBlob:value=>({value})},DriveApp:{createFile:blob=>{const key='file-'+(++id);files.set(key,blob.value);return{getId:()=>key};},getFileById:key=>({setTrashed:()=>files.delete(key)})},salesUploadCreatedAt_:()=>1,cleanText_:v=>v,acquireStockWriteLock_:()=>noopLock,
 insertStockCardRows_:rows=>{assert.ok(stored.some(j=>j.pendingDriveId),'plan durable before writing');for(const r of rows)ledger.set(r.json.record_id,r);if(first){first=false;throw Error('timeout after commit');}},cleanupSalesCogsJobFiles_(){}});
const job={writePlanVersion:2,jobId:'J',preparedDriveId:'prepared',requestDriveId:'request',processed:0,total:1,ownerNik:'N',ownerOutlet:'BISS',outlets:[],transactionDates:[]};
assert.throws(()=>c.processSalesCogsJobChunk_(job,{}),/timeout/);const pending=job.pendingDriveId;assert.ok(pending);assert.equal(job.processed,0);
c.processSalesCogsJobChunk_(job,{});assert.equal(ledger.size,1);assert.equal(builds,1);assert.equal(job.processed,1);assert.ok(!files.has(pending));
// Permanent HTTP errors and daily quotas never sleep/replay; transient failures may.
for(const [status,message,expected] of [[400,'INVALID_BATCH',1],[401,'Unauthorized',1],[503,'temporarily unavailable',3]]){
 const client=make();let calls=0;
 Object.assign(client,{cloudflareInventoryConfig_:()=>({url:'https://test',apiKey:'test'}),UrlFetchApp:{fetch:()=>{calls++;return{getResponseCode:()=>status,getContentText:()=>JSON.stringify({ok:false,error:{message}})}}},Utilities:{sleep(){}}});
 assert.throws(()=>client.cloudflareInventoryRequest_('POST','/v1/stock-movements',{}));assert.equal(calls,expected);
}
const quota=make();let quotaCalls=0;Object.assign(quota,{cloudflareInventoryConfig_:()=>({url:'test',apiKey:'test'}),UrlFetchApp:{fetch:()=>{quotaCalls++;throw Error('Service invoked too many times for one day: urlfetch');}},Utilities:{sleep:()=>assert.fail('daily quota must not retry')}});assert.throws(()=>quota.cloudflareInventoryRequest_('GET','/test'),e=>e.retryable===false);assert.equal(quotaCalls,1);
// An active lease in one outlet must not block a disjoint queued Goods job.
const goods=make();const jobs=[{jobId:'A',outlet:'BISS',location:'Store',status:'PROCESSING',workerLeaseUntil:Date.now()+480000},{jobId:'B',requestDriveId:'request',outlet:'BICP',location:'Store',status:'QUEUED',workerLeaseUntil:0,ownerNik:'N',createdAt:'2026-10-28',processed:0}];let completed;
Object.assign(goods,{LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock(){}})},ScriptApp:{getProjectTriggers:()=>[]},goodsUploadJobs_:()=>jobs.filter(j=>j.status!=='COMPLETE'),writeGoodsUploadJob_:j=>{completed=j;return j;},scheduleGoodsUploadWorker_(){},acquireStockUploadLock_:()=>noopLock,stockUploadJobEmployee_:()=>({nik:'N',outlet:'BICP'}),readStockLocations_:()=>['Store'],stockPositionJobJson_:()=>({}),buildBackgroundUploadPlan_:()=>({stockRows:[],pendingRows:[],masterChanges:[]}),DriveApp:{createFile:()=>({getId:()=> 'plan'})},Utilities:{newBlob:()=>({})},appendOrActivateStockMasterItems_(){},cleanupGoodsUploadFiles_(){},notifyPendingStockTransfers_(){}});
goods.processGoodsUploadJobs();assert.equal(completed.jobId,'B');assert.equal(completed.status,'COMPLETE');assert.ok(jobs[0].workerLeaseUntil>Date.now());
// Fast Stock Posisi items keep using the time budget; they do not yield after eight.
const position=make();let saved={jobId:'P',status:'QUEUED',outlet:'BISS',location:'Store',processed:0,total:80,createdAt:'2026-10-28T00:00:00Z'};
Object.assign(position,{acquireStockUploadLock_:()=>noopLock,acquireStockScopeLock_:()=>noopLock,stockUploadJobEmployee_:()=>({nik:'N',outlet:'BISS'}),PropertiesService:{getScriptProperties:()=>({getProperties:()=>({'stock-position-upload-job-P':JSON.stringify(saved)}),deleteProperty(){}})},ScriptApp:{getProjectTriggers:()=>[]},writeStockPositionJob_:j=>{saved=JSON.parse(JSON.stringify(j));return j;},prepareStockPositionJob_:j=>{j.preparedDriveId='plan';return j;},stockPositionJobJson_:()=>({items:Array.from({length:80},()=>({delta:1,item:{code:'P'}}))}),readTransferAvailableLotsBatch_:()=>({}),processStockPositionJobItem_:j=>{j.processed++;return j;},scheduleStockPositionWorker_(){},cleanupStockPositionJobFiles_(){}});
position.processStockPositionUploadJobs();assert.equal(saved.processed,80);assert.equal(saved.status,'COMPLETE');
// Live employee status/outlet is rechecked, independently of a browser session.
const auth=make();Object.assign(auth,{findEmployee_:()=>({nik:'N',outlet:'OTHER',status:'active'}),assertEmployeeActive_:e=>{if(e.status!=='active')throw Error('inactive');}});assert.throws(()=>auth.stockUploadJobEmployee_({ownerNik:'N',ownerOutlet:'BISS',outlet:'BISS'}),/berubah/);auth.findEmployee_=()=>({nik:'N',outlet:'BISS',status:'resign'});assert.throws(()=>auth.stockUploadJobEmployee_({ownerNik:'N',outlet:'BISS'}),/inactive/);
// Scope locks use deterministic ordering and clean up already-acquired locks on failure.
const scopes=make(),claimed=[],released=[];Object.assign(scopes,{normalizeLocation_:s=>s,acquireStockScopeLock_:scope=>{claimed.push(scope);return{releaseLock:()=>released.push(scope)};}});const lock=scopes.acquireStockUploadLock_({outlets:['B','A'],location:'Store'});lock.releaseLock();assert.deepEqual(claimed,['inventory|A|Store','inventory|B|Store']);assert.deepEqual(released,[...claimed].reverse());
// The UI observes completed work even if it missed the PROCESSING state; polls active jobs while closed.
const uiSource=fs.readFileSync('docs/stock-upload-jobs.js','utf8');const a=uiSource.indexOf('function refreshGoodsUploadStatus()'),b=uiSource.indexOf('function retryGoodsUploadJob(',a);
let loads=0,timers=[],responseJobs=[{jobId:'new',status:'COMPLETE'}];
const ui={APP:{token:'T',outlet:'BISS',location:'Store'},GOODS_UPLOAD_PANEL:{loading:false,jobs:[]},byId:()=>({classList:{contains:()=>true},textContent:''}),clearTimeout(){},setTimeout:fn=>{timers.push(fn);return timers.length;},BAKERZIN_API:{call:async()=>({ok:true,data:{jobs:responseJobs}})},renderGoodsUploadStatus:jobs=>ui.GOODS_UPLOAD_PANEL.jobs=jobs,startStockUploadWorkers(){},clearStockDataCaches(){},loadData:()=>loads++,toast(){}};
vm.createContext(ui);vm.runInContext(uiSource.slice(a,b),ui);ui.refreshGoodsUploadStatus();await new Promise(r=>setImmediate(r));assert.equal(loads,1);ui.refreshGoodsUploadStatus();await new Promise(r=>setImmediate(r));assert.equal(loads,1,'completion only refreshes once');
responseJobs=[{jobId:'next',status:'QUEUED'}];ui.refreshGoodsUploadStatus();await new Promise(r=>setImmediate(r));assert.ok(timers.length>0,'closed status panel still monitors active work');
console.log('Upload reliability: durable Usage replay, permanent/transient failures, disjoint Goods jobs, adaptive Position execution, live access, scoped locks and background UI refresh passed.');
