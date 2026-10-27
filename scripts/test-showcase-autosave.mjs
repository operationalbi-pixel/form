import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
const source=fs.readFileSync('docs/Code.gs','utf8');
const server=vm.createContext({console});vm.runInContext(source,server);
const checkpoints=new Map(),jobs=new Map(),files=new Map();let snapshot={totals:{cake:{balance:20,totalIn:5,totalSold:2,totalWaste:0}},progress:{days:[{date:'2026-10-27'}]}};
const employee={nik:'N1',outlet:'BISS'},context={employee,outlet:'BISS'};
const item={code:'CAKE',name:'Cake',unit:'PCS',category:'Food'};
const digest=x=>createHash('sha256').update(String(x)).digest('hex');
Object.assign(server,{safe_:fn=>fn(),normalizeDate_:x=>x,todayIso_:()=> '2026-10-27',digest_:digest,
  resolveStockContext_:()=>context,readGoodsUploadJob_:id=>jobs.get(id),writeGoodsUploadJob_:job=>jobs.set(job.jobId,structuredClone(job)),
  LockService:{getUserLock:()=>({waitLock(){},releaseLock(){}})},ensureStockMaintenanceTrigger_(){},scheduleGoodsUploadWorker_(){},
  Utilities:{getUuid:randomUUID,newBlob:x=>x},DriveApp:{createFile:content=>{const id=randomUUID();files.set(id,content);return{getId:()=>id};},getFileById:()=>({setTrashed(){}})},PropertiesService:{getScriptProperties:()=>({deleteProperty(){}})},
  readShowcaseRowEdit_:id=>checkpoints.get(id)||null,cloudflareStoreApplicationRecords_:(table,rows)=>{assert.equal(table,'showcase_row_edits');rows.forEach(row=>{if(!checkpoints.has(row.insertId))checkpoints.set(row.insertId,structuredClone(row.json));});},
  readShowcaseLogSnapshot_:()=>structuredClone(snapshot),readShowcaseItems_:()=>[item],readRemainingStockLotsBatch_:()=>({}),formatQty_:String});
const id=randomUUID();
const payload=(revision,qty)=>({outlet:'BISS',eventDate:'2026-10-27',rowEdit:{id,revision},requestId:'row-'+id+'-'+revision,entries:[{itemCode:'CAKE',soldQty:qty,hasSoldInput:true}]});
function queued(p){const job=server.queueShowcaseRow('token',p);const stored=jobs.get(job.jobId);return {job:stored,payload:JSON.parse(files.get(stored.requestDriveId))};}
function plan(p){return server.buildShowcaseRowSavePlan_(context,p);}
// Immutable request retries resolve to one job; different payloads cannot reuse an accepted revision.
const first=queued(payload(1,2));assert.equal(queued(payload(1,2)).job.jobId,first.job.jobId);
assert.throws(()=>queued(payload(1,3)),/tab lain/);
assert.throws(()=>server.queueShowcaseRow('token',{...payload(1,2),requestId:'different-request-id'}),/tidak sesuai/);
let p1=plan(first.payload);assert.equal(p1.stockRows.filter(row=>row.json.record_type==='MOVEMENT')[0].json.qty,2);
server.commitShowcaseRowCheckpoint_(p1.showcaseRowCheckpoint);server.commitShowcaseRowCheckpoint_(p1.showcaseRowCheckpoint);assert.equal(checkpoints.size,1);
let replay=plan(first.payload);assert.equal(replay.stockRows.length,0,'checkpoint replay does not create new movement IDs');
// Other users can add transactions between revisions: 2 -> 3 still adds only 1 to the new total.
snapshot.totals.cake.totalSold=9;snapshot.totals.cake.balance=13;
const second=queued(payload(2,3));let p2=plan(second.payload);
assert.equal(p2.stockRows.filter(row=>row.json.record_type==='MOVEMENT')[0].json.qty,1);
assert.equal(p2.showcaseRowCheckpoint.values.soldQty,3);
server.commitShowcaseRowCheckpoint_(p2.showcaseRowCheckpoint);
assert.throws(()=>plan({...second.payload,rowEdit:{id,revision:4}}),/Urutan revisi/);
const correction=queued(payload(3,1));const p3=plan(correction.payload),movement=p3.stockRows.find(row=>row.json.record_type==='MOVEMENT').json;
assert.equal(movement.qty,2);assert.equal(movement.direction,'IN','reducing the previous input restores only the difference');
// Total editing has explicit precedence and resets the contribution for subsequent input.
const total=payload(3,3);total.entries[0].hasSoldTotal=true;total.entries[0].soldTotal=7;
const totalPlan=plan({...total,location:'Showcase'});assert.equal(totalPlan.showcaseRowCheckpoint.values.soldQty,0);
assert.throws(()=>plan({...payload(3,999),location:'Showcase'}),/Balance/);
// No checkpoint is written until every movement is ACKed; retries reuse the persisted plan.
const worker=source.slice(source.indexOf('function processGoodsUploadJobs()'),source.indexOf('function stockPositionJobKey_'));
assert.ok(worker.indexOf('if (job.processed >= total)')<worker.indexOf('commitShowcaseRowCheckpoint_'));
assert.ok(worker.indexOf('commitShowcaseRowCheckpoint_')<worker.indexOf("job.status = 'COMPLETE'"));
const another={...context,employee:{nik:'N2',outlet:'BISS'}};
assert.notEqual(server.showcaseRowEditIdentity_(another.employee,'BISS','2026-10-27',{itemCode:item.code},{id,revision:1}).recordId,p1.result.rowEdit.recordId);
// A lost movement ACK never advances the checkpoint; the same saved IDs are replayed on recovery.
{
  const w=vm.createContext({console:{log(){},error(){}}});vm.runInContext(source,w);
  const active={...first.job,planDriveId:'plan',status:'QUEUED',processed:0,workerLeaseUntil:0};
  let lostAck=true,commits=0;const ids=new Set();
  Object.assign(w,{LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock(){}})},ScriptApp:{getProjectTriggers:()=>[]},
    goodsUploadJobs_:()=>['QUEUED','PREPARING','PROCESSING'].includes(active.status)?[active]:[],writeGoodsUploadJob_:job=>Object.assign(active,job),
    acquireStockWriteLock_:()=>({releaseLock(){}}),findEmployee_:()=>employee,assertEmployeeActive_(){},stockPositionJobJson_:()=>p1,
    appendOrActivateStockMasterItems_(){},insertStockCardRows_:batch=>{batch.forEach(row=>ids.add(row.json.record_id));if(lostAck){lostAck=false;throw Error('Cloudflare inventory gagal HTTP 503');}},
    commitShowcaseRowCheckpoint_:()=>commits++,removeScriptCacheKeys_(){},showcaseAgingCacheKey_:()=>'',markShowcaseLogTaskComplete_(){},notifyPendingStockTransfers_(){},cleanupGoodsUploadFiles_(){},scheduleGoodsUploadWorker_(){}});
  w.processGoodsUploadJobs();assert.equal(commits,0);assert.equal(active.status,'QUEUED');assert.equal(active.processed,0);
  w.processGoodsUploadJobs();assert.equal(commits,1);assert.equal(active.status,'COMPLETE');assert.equal(ids.size,p1.stockRows.length);
}
console.log('Autosave server revisions preserve 2 -> 3 deltas, reverse corrections, concurrent-user totals, checkpoints and immutable retries.');

const html=fs.readFileSync('docs/showcaselog.html','utf8');
const main=html.slice(html.indexOf('    var STATE='),html.indexOf("    byId('eventDate').value=today()"));
const client=fs.readFileSync('docs/showcase-autosave.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function browser(sharedStorage=new Map()){
  const requests=[],events={},globalEvents={},timers=[],nodes=new Map();
  const classList={toggle(){},add(){},remove(){},contains:()=>false};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='eventDate'?'2026-10-27':'',classList,textContent:'',innerHTML:'',addEventListener:(name,fn)=>{events[id+':'+name]=fn;}});return nodes.get(id);};
  const c={console,crypto:{randomUUID},navigator:{onLine:true},document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[]},localStorage:{getItem:k=>sharedStorage.get(k)||null,setItem:(k,v)=>sharedStorage.set(k,v),removeItem:k=>sharedStorage.delete(k)},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},addEventListener:(name,fn)=>globalEvents[name]=fn,BAKERZIN_API:{call:(name,args)=>new Promise((resolve,reject)=>requests.push({name,args,resolve,reject}))}};
  c.window=c;vm.createContext(c);vm.runInContext(main,c);
  Object.assign(c.STATE,{token:'token',user:{nik:'N1'},outlet:'BISS',items:[{...item,balance:20,totalIn:5,totalSold:2,totalWaste:0}],drafts:{},autosaveReady:true,autosaveVersion:1});
  for(const name of ['renderItems','renderHeader','renderShowcaseAdminFilters','setShowcaseOutletSelectionState','renderProgress','loadShowcaseAging','loadShowcaseMonitoring','restoreShowcasePending','updateDraftBalance','toast','refreshShowcaseSaves','startShowcaseWorkers'])c[name]=()=>{};
  vm.runInContext(client,c);
  function change(field,value){if(!c.STATE.drafts[0])c.STATE.drafts[0]={};c.STATE.drafts[0][field]=value;c.SHOWCASE_AUTOSAVE.observe(0,field,value);}
  function row(){const key=[...sharedStorage.keys()].find(k=>k.startsWith('bakerzin_showcase_autosave_v1_'));return JSON.parse(sharedStorage.get(key));}
  return {c,requests,node,timers,events,globalEvents,storage:sharedStorage,change,row};
}
// Keystrokes only back up drafts. Leaving a row or Enter commits it; moving within the row does not.
{
  const {c,requests,change,row,events}=browser();change('soldQty','2');assert.equal(requests.length,0);
  const tr={contains:target=>target==='same-row'},input={dataset:{index:'0'},matches:()=>true,closest:()=>tr};
  events['itemRows:focusout']({target:input,relatedTarget:'same-row'});assert.equal(requests.length,0);
  events['itemRows:focusout']({target:input,relatedTarget:null});assert.equal(requests.length,1);
  assert.equal(requests[0].name,'queueShowcaseRow');const sentId=requests[0].args[1].requestId;
  change('soldQty','3');c.SHOWCASE_AUTOSAVE.flush();assert.equal(requests.length,1,'new edit waits for confirmed predecessor');
  requests[0].resolve({ok:true,data:{jobId:'J1',requestId:sentId,status:'QUEUED'}});await tick();assert.equal(row().outbox.status,'QUEUED');
  c.SHOWCASE_AUTOSAVE.status([{jobId:'J1',requestId:sentId,status:'COMPLETE'}]);assert.equal(row().revision,1);assert.equal(row().confirmed.values.soldQty,2);
  c.STATE.items[0].balance=18;c.STATE.items[0].totalSold=4;c.SHOWCASE_AUTOSAVE.hydrate('2026-10-27',false);
  assert.equal(requests.length,2);assert.equal(requests[1].args[1].entries[0].soldQty,3);assert.equal(requests[1].args[1].rowEdit.revision,2);
  assert.equal(c.projectedBalance(0,c.STATE.items[0]),17);
}
// Offline reconnect retries the same immutable request, even after reload and further editing.
{
  const f=browser();f.change('soldQty','2');f.c.SHOWCASE_AUTOSAVE.flush();const first=f.requests[0].args[1];
  f.requests[0].reject(new Error('offline'));await tick();assert.equal(f.row().outbox.status,'UNCERTAIN');
  f.change('soldQty','3');f.globalEvents.online();assert.equal(f.requests.length,2);assert.equal(f.requests[1].args[1].requestId,first.requestId);assert.equal(f.requests[1].args[1].entries[0].soldQty,2);
  const restored=browser(f.storage);assert.equal(restored.requests.length,1);assert.equal(restored.requests[0].args[1].requestId,first.requestId);
  assert.equal(restored.row().desired.values.soldQty,'3');
}
// Two tabs share the row identity, allowing the server to reject conflicting same-revision edits.
{
  const f=browser(),g=browser(f.storage);f.change('soldQty','2');g.change('soldQty','3');f.c.SHOWCASE_AUTOSAVE.flush();g.c.SHOWCASE_AUTOSAVE.flush();
  assert.equal(f.requests[0].args[1].requestId,g.requests[0].args[1].requestId);
}
// A bad baris is kept for correction; Total and Input cannot submit competing edits.
{
  const f=browser();f.change('soldQty','30');f.c.SHOWCASE_AUTOSAVE.flush();assert.equal(f.requests.length,0);assert.match(f.row().error,/Balance/);
  f.change('soldQty','2');f.change('soldTotal','5');assert.equal(f.c.STATE.drafts[0].soldQty,undefined);
  f.c.SHOWCASE_AUTOSAVE.flush();assert.equal(f.requests[0].args[1].entries[0].soldQty,0);assert.equal(f.requests[0].args[1].entries[0].soldTotal,5);
  f.requests[0].resolve({ok:true,data:{jobId:'BAD',requestId:f.requests[0].args[1].requestId,status:'ACTION_REQUIRED',error:'Saldo berubah'}});await tick();
  f.change('soldTotal','4');f.c.SHOWCASE_AUTOSAVE.flush();assert.equal(f.requests.length,2);assert.equal(f.requests[1].args[1].requestId,f.requests[0].args[1].requestId);
}
// Frontend remains gated until a fresh backend advertises the autosave contract.
{
  const f=browser();f.c.STATE.autosaveVersion=0;f.c.SHOWCASE_AUTOSAVE.hydrate('2026-10-27',false);f.change('soldQty','2');f.c.SHOWCASE_AUTOSAVE.flush();assert.equal(f.requests.length,0);
}
console.log('Autosave client row boundaries, manual Save, offline replay, refresh recovery, multi-tab identity and validation passed.');
