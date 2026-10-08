import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto,createHash,randomUUID} from 'node:crypto';
import worker from '../cloudflare/inventory-api/src/index.js';

// Run the deployed route against real SQLite: retries cannot reset a completed job.
const db=new DatabaseSync(':memory:');
const d1={prepare(sql){const statement=db.prepare(sql);let args=[];const query={bind(...v){args=v;return query;},async run(){return {meta:{changes:Number(statement.run(...args).changes)}};},async all(){return {results:statement.all(...args)};}};return query;}};
const env={OPERATIONS_DB:d1,API_KEY:'test-key'};
const job={jobId:'a'.repeat(64),engine:'SALES',type:'DAILY',ownerNik:'N1',sourceHash:'hash',spreadsheetId:'sheet',outlet:'BISS',payload:{date:'2026-10-08',sales:100}};
async function post(value){return worker.fetch(new Request('https://test/v1/sales-save-jobs',{method:'POST',headers:{'x-api-key':'test-key','content-type':'application/json'},body:JSON.stringify({job:value})}),env);}
assert.equal((await (await post(job)).json()).job.status,'QUEUED');
const done={...job,status:'COMPLETE',createdAt:'2026-10-08',result:{ok:true,sales:100}};
db.prepare("UPDATE application_records SET payload_json=? WHERE record_id=?").run(JSON.stringify(done),job.jobId);
assert.equal((await (await post(job)).json()).job.status,'COMPLETE');
assert.equal((await post({...job,sourceHash:'other'})).status,409);
const unauthorized=await worker.fetch(new Request('https://test/v1/sales-save-jobs',{method:'POST',body:'{}'}),env);
assert.equal(unauthorized.status,401);

// Worker ordering, busy-lock recovery, permission failures and account ownership.
const data=new Map();let writes=[],fail='',sheet='';
const account={nik:'N1',outlet:'BISS',status:'active'};
const context={Date,JSON,Number,String,Object,Array,Error,console,
  safe_:fn=>{try{return {ok:true,data:fn()};}catch(e){return {ok:false,error:e.message};}},
  requireSession_:()=>({nik:account.nik}),salesAnalysisEmployee_:nik=>({...account,nik}),assertEmployeeActive_:e=>{if(e.status!=='active')throw Error('Tidak aktif');},
  salesAnalysisCanonicalOutletCode_:v=>v,salesAnalysisOutletDirectory_:()=>[{code:'BISS',role:'store'}],normalizeDate_:v=>v,
  digest_:v=>createHash('sha256').update(v).digest('hex'),
  CacheService:{getScriptCache:()=>({get:()=> 'ready'})},
  LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock(){}})},
  cloudflareInventoryRequest_:(method,path,body)=>{assert.equal(path,'/v1/sales-save-jobs');const j=body.job; if(!data.has(j.jobId))data.set(j.jobId,{...j,createdAt:'2026-10-08',status:'QUEUED'});return {job:data.get(j.jobId)};},
  cloudflareReadAllPages_:(_path,q)=>[...data.values()].filter(j=>j.engine===q.engine&&(!q.owner_nik||j.ownerNik===q.owner_nik)&&(!q.unresolved||j.status!=='COMPLETE')),
  readGoodsUploadJob_:id=>data.get(id),writeGoodsUploadJob_:j=>{data.set(j.jobId,structuredClone(j));},
  SALES_ANALYSIS:{spreadsheetId:()=> 'new-sheet',useDatabase:id=>sheet=id,syncOutlets(){},issueSession:()=>({token:'fresh-worker-token'}),saveDaily:(_token,p)=>{assert.equal(sheet,'new-sheet');if(fail)throw Error(fail);writes.push(p.sales);return {ok:true,sales:p.sales};}}
};
vm.createContext(context);vm.runInContext(fs.readFileSync('gas/SalesSaveJobs.gs','utf8'),context);
assert.equal(context.queueSalesSave('token',{requestId:randomUUID(),type:'DAILY',payload:{date:'2026-10-08',sales:100}}).ok,true);
assert.equal(writes.length,0,'acceptance must not open/write the Sheet');
data.clear();
for(const [id,created,sales] of [['first','1',100],['second','2',200]])data.set(id,{...job,jobId:id,role:'store',spreadsheetId:'new-sheet',createdAt:created,status:'QUEUED',payload:{sales}});
fail='Batas waktu penguncian habis';context.processSalesSaveJobs();assert.equal(data.get('first').status,'QUEUED');assert.equal(writes.length,0);
data.get('first').nextAttemptAt=0;fail='Anda tidak memiliki izin untuk mengakses dokumen';context.processSalesSaveJobs();assert.equal(data.get('first').status,'ACTION_REQUIRED');
fail='';context.processSalesSaveJobs();assert.equal(writes.length,0,'later edits cannot pass an unresolved earlier write');
context.retrySalesSave('token','first');context.processSalesSaveJobs();assert.deepEqual(writes,[100,200]);
context.processSalesSaveJobs();assert.deepEqual(writes,[100,200]);assert.equal(data.get('second').status,'COMPLETE');
assert.equal(sheet,'','per-job Sheet pin is cleared');
account.nik='OTHER';assert.equal(context.retrySalesSave('token','first').ok,false);account.nik='N1';

// UI response is immediate while the network acknowledgement is unresolved.
let apiResolve,remote=[];const storage=new Map();let apiCalls=[];
function node(){return {style:{},append(){},replaceChildren(){}};}
const panel=node();
const ui={window:{},crypto:webcrypto,Set,JSON,Error,Date,Promise,console,
  document:{getElementById:()=>panel,createElement:()=>node(),body:{append(){}}},
  localStorage:{getItem:k=>k==='bakerzin_session'?'account':storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  setInterval:()=>1,clearInterval(){},
  BAKERZIN_API:{call:(action,args)=>{apiCalls.push([action,args]);if(action==='queueSalesSave')return new Promise(resolve=>apiResolve=resolve);return Promise.resolve({ok:true,data:{jobs:remote}});}}
};
vm.createContext(ui);const script=fs.readFileSync('docs/sales-save-jobs.js','utf8');vm.runInContext(script,ui);
let committed=0;const outbox=ui.window.SalesSaveOutbox;outbox.start(()=>committed++);await new Promise(r=>setImmediate(r));
const accepted=outbox.enqueue('saveDaily',{date:'2026-10-08',sales:100},{});
assert.equal(accepted.local,true);assert.equal(committed,0);
const persisted=JSON.parse(storage.get('sales-save-outbox-v1:account'));assert.equal(persisted.length,1);
assert.ok(apiResolve,'network still unresolved when the button response returns');
remote=[{jobId:'server',requestId:accepted.requestId,status:'PROCESSING'}];
apiResolve({ok:true,data:{accepted:true,job:remote[0]}});await new Promise(r=>setImmediate(r));assert.equal(committed,0);
remote[0]={...remote[0],status:'COMPLETE',result:{ok:true,sales:100}};await outbox.poll();assert.equal(committed,1);
assert.equal(JSON.parse(storage.get('sales-save-outbox-v1:account')).length,0);
console.log('Sales background acceptance is durable/idempotent; busy writes retry in order; only confirmed Sheet completion clears drafts.');
