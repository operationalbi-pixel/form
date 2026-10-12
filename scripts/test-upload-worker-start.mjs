import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('docs/Code.gs','utf8'),c={console};vm.createContext(c);vm.runInContext(source,c);
const job={jobId:'sale',ownerNik:'ME',engine:'USAGE',status:'QUEUED',workerLeaseUntil:0};
let started=0,scheduled=[],inactive=false;
Object.assign(c,{safe_:fn=>fn(),requireSession_:token=>{if(token!=='valid')throw Error('expired');return{nik:'ME'}},findEmployee_:()=>({nik:'ME'}),assertEmployeeActive_:()=>{if(inactive)throw Error('inactive')},otherStockUploadJobs_:()=>[job],readGoodsUploadJob_:()=>({...job,engine:'GOODS'}),
 processSalesCogsUploadJobs:()=>started++,processGoodsUploadJobs:()=>started++,processStockPositionUploadJobs:()=>started++,processMissingExpiryUploadJobs:()=>started++,
 scheduleSalesCogsWorker_:()=>scheduled.push('USAGE'),scheduleGoodsUploadWorker_:()=>scheduled.push('GOODS'),scheduleStockPositionWorker_:()=>scheduled.push('POSITION'),scheduleMissingExpiryWorker_:()=>scheduled.push('EXPIRY')});
assert.equal(c.startStockUploadWorker('valid','sale','USAGE').started,true);assert.equal(started,1);
job.workerLeaseUntil=Date.now()+10000;assert.equal(c.startStockUploadWorker('valid','sale','USAGE').started,false);assert.equal(started,1);
job.workerLeaseUntil=0;job.status='COMPLETE';assert.equal(c.startStockUploadWorker('valid','sale','USAGE').started,false);job.status='QUEUED';
job.ownerNik='OTHER';assert.throws(()=>c.startStockUploadWorker('valid','sale','USAGE'),/bukan milik/);job.ownerNik='ME';
assert.throws(()=>c.startStockUploadWorker('expired','sale','USAGE'),/expired/);inactive=true;assert.throws(()=>c.startStockUploadWorker('valid','sale','USAGE'),/inactive/);inactive=false;
assert.throws(()=>c.startStockUploadWorker('valid','sale','toString'),/worker tidak valid/);assert.throws(()=>c.startStockUploadWorker('valid','missing','USAGE'),/tidak ditemukan/);
c.processSalesCogsUploadJobs=()=>{throw Error('Sistem sedang menyimpan transaksi lain')};assert.equal(c.startStockUploadWorker('valid','sale','USAGE').started,false);assert.deepEqual(scheduled,['USAGE']);
scheduled=[];c.recoverStockUploadWorkers_([job,job,{...job,engine:'POSITION'},{...job,engine:'EXPIRY',workerLeaseUntil:Date.now()+10000},{...job,engine:'GOODS',status:'COMPLETE'}]);assert.deepEqual(scheduled,['USAGE','POSITION']);
// Periodic recovery must dispatch Sales even if the Goods metadata service fails.
scheduled=[];c.goodsUploadJobs_=()=>{throw Error('temporary D1 read failure')};c.processStockItemSummaryJobs=()=>{};c.maybeCompactStockSummaryTables_=()=>{};
c.refreshDirtyStockBalances();assert.deepEqual(scheduled,['USAGE']);assert.equal(started,1,'watchdog schedules engines rather than executing four long workers sequentially');
// Status-panel reads restore only the caller's jobs, and don't mask stale times.
c.goodsUploadJobs_=()=>[];scheduled=[];const before=JSON.stringify(job);const status=c.listGoodsUploadStatus('valid');assert.equal(status.jobs.length,1);assert.deepEqual(scheduled,['USAGE']);assert.equal(JSON.stringify(job),before);

const js=fs.readFileSync('docs/stock-upload-jobs.js','utf8'),start=js.indexOf('var STOCK_UPLOAD_STARTS'),end=js.indexOf('function goodsUploadRequestId',start);
let clock=100000,calls=[],resolve;
const u={APP:{token:'valid'},Date:{now:()=>clock},BAKERZIN_API:{call:(name,args)=>{calls.push({name,args});return new Promise(r=>resolve=r)}}};vm.createContext(u);vm.runInContext(js.slice(start,end),u);
u.startStockUploadWorkers([job]);await new Promise(r=>setImmediate(r));assert.equal(calls.length,1);assert.equal(calls[0].name,'startStockUploadWorker');assert.equal(calls[0].args[1],'sale');
for(let i=0;i<10;i++)u.startStockUploadWorkers([job]);await new Promise(r=>setImmediate(r));assert.equal(calls.length,1,'a pending worker API request does not block UI or launch duplicates');
resolve({ok:true});await new Promise(r=>setImmediate(r));u.startStockUploadWorkers([job]);await new Promise(r=>setImmediate(r));assert.equal(calls.length,1,'completed requests respect the cooldown');
clock+=61000;u.BAKERZIN_API.call=(name,args)=>{calls.push({name,args});throw Error('lost response')};u.startStockUploadWorkers([job]);await new Promise(r=>setImmediate(r));assert.equal(calls.length,2,'transport failure is isolated from accepted upload UI');
u.startStockUploadWorkers([{...job,workerRunning:true},{...job,status:'COMPLETE'}]);await new Promise(r=>setImmediate(r));assert.equal(calls.length,2);
u.APP.token='another';u.startStockUploadWorkers([job]);await new Promise(r=>setImmediate(r));assert.equal(calls.length,3,'account cooldowns are separate; server ownership checks remain mandatory');
console.log('Accepted uploads start independently of trigger delivery; status/watchdog recovery, ownership, leases, cooldowns and lost responses are safe.');

const api=fs.readFileSync('docs/api-client.js','utf8'),timeout={};vm.createContext(timeout);const a=api.indexOf('  function timeoutForAction('),z=api.indexOf('  function call(',a);vm.runInContext(api.slice(a,z),timeout);assert.equal(timeout.timeoutForAction('startStockUploadWorker'),300000);assert.equal(timeout.timeoutForAction('goodsUploadStatus'),90000);
