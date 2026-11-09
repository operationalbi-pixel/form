import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../gas/Code.gs',import.meta.url),'utf8');

const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
function extract(n){const i=source.indexOf('function '+n+'('),end=source.indexOf('\nfunction ',i+10);return source.slice(i,end<0?undefined:end);}
const functions=['prepareStockOpnameBalancesStep_','mapStockHistoryQueryRow_','applyStockHistoryAuditRows_','stockCheckpointBalanceUntil_','stockMovementCreatedMillis_','parseReportNumber_'].map(extract).join('\n');
let revision='r1',calls=0,files={},nextId=0,saved={},writes=0;
const env={Date,normalizeLocation_:s=>s,normalizeDate_:s=>s,
stockIsoDateOffset_:s=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);},
cloudflareQueryString_:q=>Object.keys(q).map(k=>k+'='+encodeURIComponent(q[k])).join('&'),
stockPositionJobJson_:id=>JSON.parse(files[id]),Utilities:{newBlob:s=>s},
DriveApp:{createFile:s=>{const id=String(++nextId);files[id]=s;return{getId:()=>id};},getFileById:id=>({setContent:s=>files[id]=s})},
writeGoodsUploadJob_:()=>writes++,
cloudflareInventoryRequest_:(method,path,body)=>{
if(method==='POST'){if(body.action==='save'){if(body.revision!==revision)return{saved:false};Object.assign(saved,body.balances);return{saved:true};}
return{revision,balances:Object.fromEntries(body.codes.filter(c=>c in saved).map(c=>[c,saved[c]]))};}
const q=Object.fromEntries(path.split('?')[1].split('&').map(p=>p.split('='))),page=Number(q.cursor||0);calls++;
return{data:[{record_id:'row'+page,logical_id:'row'+page,item_code:'A',record_type:'MOVEMENT',direction:'IN',quantity:1,event_date:'2026-10-01'}],nextCursor:page<100?String(page+1):null};
}};
const step=new Function('env','with(env){'+functions+';return prepareStockOpnameBalancesStep_;}')(env);
let job={sourceHash:'file',opnameOutlet:'BIPS',jobId:'job'},report={rows:[{code:'A'},{code:'ZERO'}]},payload={eventDate:'2026-10-31',location:'Store'},result,attempts=0;
do{result=step(job,payload,report,Date.now()+240000);attempts++;assert(attempts<10,'must finish');}while(!result.ready);
assert(attempts===6 && calls===101,'101 pages resume without rereading');
assert(result.balances.A===101 && result.balances.ZERO===0,'exact sum and zero item');
assert(saved.A===101 && writes===6,'snapshot and checkpoints saved');
calls=0;job={sourceHash:'file',opnameOutlet:'BIPS',jobId:'cached'};
result=step(job,payload,report,Date.now()+240000);assert(result.ready && calls===0,'cache avoids history');
saved={};calls=0;job={sourceHash:'file',opnameOutlet:'BIPS',jobId:'changed'};
result=step(job,payload,report,Date.now()+240000);assert(!result.ready && calls===20,'partial checkpoint');
revision='r2';result=step(job,payload,report,Date.now()+240000);
assert(!result.ready && JSON.parse(files[job.opnameBalanceDriveId]).pages===20,'changed revision restarts read');
const f=new Function('env','with(env){'+functions+';return {map:mapStockHistoryQueryRow_,audit:applyStockHistoryAuditRows_,balance:stockCheckpointBalanceUntil_};}')(env);
const rows=[
{record_type:'MOVEMENT',record_id:'before',event_date:'2026-09-01',direction:'IN',qty:999},
{record_type:'OPNAME_DETAIL',record_id:'audit',event_date:'2026-09-30',source_hash:'so',source_row:1,info:JSON.stringify({actualQty:10,eventDate:'2026-09-30'})},
{record_type:'MOVEMENT',record_id:'so',event_date:'2026-09-30',source_hash:'so',source_row:1,movement_type:'Stock Opname',direction:'OUT',qty:989},
{record_type:'MOVEMENT',record_id:'after',event_date:'2026-10-01',direction:'OUT',qty:3}
].map(f.map);
assert(f.balance(f.audit(rows),'2026-11-01')===7,'SO checkpoint semantics');

console.log('Stock Opname resumable balance preparation passed');

let lockCalls=0,ready=false;
const workerJob={jobId:'worker',type:'STOCK_OPNAME',status:'QUEUED',outlet:'BIHQ',location:'Store',requestDriveId:'request',createdAt:'2026-11-08',opnameOutlet:'BIPS',opnameBalanceDriveId:'checkpoint',opnameTurn:135,opnameCompleted:[]};
const workerEnv={Date,console:{log(){},warn(){},error(){}},
LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock(){}})},ScriptApp:{getProjectTriggers:()=>[]},
goodsUploadJobs_:()=>[workerJob],writeGoodsUploadJob_:()=>{},stockUploadJobEmployee_:()=>({outlet:'BIHQ'}),
stockPositionJobJson_:()=>({base64:'file',fileName:'test.xlsx'}),cleanText_:s=>s,
parseStockOpnameReport_:()=>({outlets:['BICP','BIPS'],rows:[{outlet:'BICP',code:'A'},{outlet:'BIPS',code:'A'}]}),
prepareStockOpnameForEmployee_:()=>({requiresConversion:false}),
prepareStockOpnameBalancesStep_:()=>{if(!ready){workerJob.workerLeaseUntil=0;workerJob.status='QUEUED';}return {ready,balances:{A:1},revision:'r'};},
acquireStockUploadLock_:()=>{lockCalls++;throw Error('Sistem sedang menyimpan transaksi lain');},
stockUploadBusy_:e=>String(e).includes('sedang menyimpan transaksi lain'),scheduleGoodsUploadWorker_:()=>{},goodsUploadJobView_:j=>j};
const worker=new Function('env','with(env){'+extract('processGoodsUploadJobs')+';return processGoodsUploadJobs;}')(workerEnv);
worker();
assert(lockCalls===0,'read preparation must not acquire outlet write lock');
assert(workerJob.opnameOutlet==='BIPS','checkpoint pins outlet');
ready=true;worker();
assert(lockCalls===1,'ready preparation requires write lock');
assert(workerJob.opnameTurn===135 && workerJob.opnameBalanceDriveId==='checkpoint','busy write preserves prepared outlet');
assert(workerJob.stage.includes('Menunggu kunci penyimpanan BIPS'),'surface exact lock wait');
console.log('SO preparation lock ordering and checkpoint preservation passed');
