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

// The legacy entry point cannot create or revive jobs, even during UrlFetch exhaustion.
let networkCalls=0;
const employee={nik:'N1',outlet:'BIHQ',status:'active'};
const triggers=[{getHandlerFunction:()=> 'processSalesSaveJobs'},{getHandlerFunction:()=> 'processGoodsUploadJobs'}],deleted=[];
const context={Date,JSON,Number,String,Object,Array,Error,console,
 safe_:fn=>{try{return {ok:true,data:fn()};}catch(error){return {ok:false,error:error.message};}},
 requireSession_:()=>({nik:'N1'}),salesAnalysisEmployee_:()=>employee,assertEmployeeActive_(){},
 cloudflareInventoryRequest_:()=>{networkCalls++;throw Error('Service invoked too many times for one day: urlfetch.');},
 ScriptApp:{getProjectTriggers:()=>triggers,deleteTrigger:trigger=>deleted.push(trigger.getHandlerFunction())},
 digest_:value=>createHash('sha256').update(value).digest('hex'),cloudflareQueryString_:query=>JSON.stringify(query)
};
vm.createContext(context);vm.runInContext(fs.readFileSync('gas/SalesSaveJobs.gs','utf8'),context);
assert.equal(context.queueSalesSave('token',{requestId:randomUUID(),type:'DAILY',payload:{date:'2026-10-26',sales:100}}).ok,false);
assert.equal(context.retrySalesSave('token','old-job').ok,false);
assert.equal(context.processSalesSaveJobs().retired,true);
assert.deepEqual(deleted,['processSalesSaveJobs'],'retirement never deletes another operational trigger');
assert.equal(networkCalls,0,'retired queue paths make no UrlFetch calls');
context.cloudflareInventoryRequest_=()=>({data:[{jobId:'legacy',requestId:'request',type:'DAILY',outlet:'BISS',status:'COMPLETE',result:{ok:true,sales:100}}]});
assert.equal(context.getSalesSaveJobs('token').data.jobs[0].status,'COMPLETE','accepted historical receipts stay available for explicit inspection');
const source=fs.readFileSync('gas/Code.gs','utf8');
for(const scope of ['Daily','Weekly','Monthly']){
 const start=source.indexOf('function saveSalesAnalysis'+scope+'('),end=source.indexOf('\nfunction ',start+10),wrapper=source.slice(start,end);
 assert.ok(!wrapper.includes('salesSaveDirectGuard_')&&!wrapper.includes('cloudflare'),'normal Sheet saves do not query retired D1 queues');
}
console.log('Sales queue fully retired: no new jobs, no retries/background writes, only its own trigger removed, history retained; direct writes avoid legacy UrlFetch.');
