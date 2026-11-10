import {acceptSo,cancelSo,retrySo,readSoJob,soJobProgress} from './so-intake.mjs';
import {parseSoWorkbook,validateSoDate} from './so-report.mjs';

const todayJakarta=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const clean=v=>String(v??'').trim();
function safePayload(payload){
 if(!payload||typeof payload!=='object'||!/\.xlsx$/i.test(payload.fileName||'')||typeof payload.base64!=='string'||payload.base64.length>7*1024*1024)throw Error('File SO harus .xlsx dan maksimal 5 MB.');
 return {eventDate:validateSoDate(payload.eventDate,todayJakarta()),location:clean(payload.location||'Store'),fileName:clean(payload.fileName),base64:payload.base64};
}
async function directory(env){
 const data=await env.MASTER_DB.prepare('SELECT outlet_code code,outlet_name name,active FROM outlets').all();
 return data.results.map(r=>({...r,active:Boolean(r.active)}));
}
function ensureScope(scope,env){
 if(env.SO_V2_ENABLED!=='1')throw Error('Jalur SO baru belum diaktifkan.');
 if(scope.outlet!=='BIHQ'||!scope.owner)throw Error('Upload Stock Opname hanya dapat dilakukan oleh BIHQ.');
}
function asJob(job){
 const p=soJobProgress(job);
 return {jobId:job.job_id,type:'STOCK_OPNAME',engine:'SO_V2',outlet:'BIHQ',
  location:job.location_code,fileName:job.file_name,eventDate:job.event_date,
  status:job.status==='RECEIVED'||job.status==='STAGING'||job.status==='READY'?'QUEUED':job.status,
  rawStatus:job.status,progress:p.progress,stage:p.stage,
  sourceRows:p.total,staged:p.staged,planned:p.planned,committed:p.committed,
  createdAt:job.created_at,updatedAt:job.updated_at,error:p.error?.message||'',workerRunning:true};
}
export async function handleSoDirectAction(action,payload,scope,env){
 ensureScope(scope,env);
 if(action==='so-verify'){
  const input=safePayload(payload);
  if(input.location!==scope.location)throw Error('Lokasi tidak sesuai izin akses.');
  const report=parseSoWorkbook(input.base64,input.fileName,await directory(env));
  const items=await env.MASTER_DB.prepare('SELECT item_code,item_name,default_unit,active FROM stock_items').all();
  const master=Object.fromEntries(items.results.map(x=>[String(x.item_code).toUpperCase(),x]));
  const missing=[],conversions=[],seen=new Set();
  for(const row of report.rows){
   const m=master[row.code];
   if(!m){if(!seen.has(row.code)){missing.push(row.code);seen.add(row.code);}continue;}
   if(!m.active)throw Error('Item master tidak aktif: '+row.code);
   if(String(m.default_unit).replace(/\s+/g,'').toUpperCase()!==String(row.unit).replace(/\s+/g,'').toUpperCase()
      &&!conversions.some(x=>x.itemCode===row.code))conversions.push({itemCode:row.code,itemName:m.item_name,oldUnit:m.default_unit,newUnit:row.unit});
  }
  // Unknown items are queued for master creation only after every SO row is validated.
  return {eventDate:input.eventDate,fileName:input.fileName,sourceItemCount:report.rows.length,
   outletCount:report.outlets.length,newItemCount:missing.length,balancePending:true,
   requiresConversion:Boolean(conversions.length),conversions:conversions.slice(0,100),
   message:'File valid secara struktur; saldo dan duplikat divalidasi sebelum transaksi disimpan.'};
 }
 if(action==='so-accept'){
  const input=safePayload(payload);
  if(input.location!==scope.location)throw Error('Lokasi tidak sesuai izin akses.');
  const job=await acceptSo(env,{owner:scope.owner,outlet:'BIHQ',locations:[scope.location]},input,todayJakarta());
  return asJob(job);
 }
 if(action==='so-status'){
  const jobs=await env.OPERATIONS_DB.prepare('SELECT * FROM so_upload_jobs WHERE owner_nik=? ORDER BY created_at DESC LIMIT 25').bind(scope.owner).all();
  return {jobs:jobs.results.map(asJob)};
 }
 if(action==='so-retry'){
  const id=clean(payload?.jobId);
  if(!/^so2-[0-9a-f]{64}$/.test(id))throw Error('Job SO tidak valid.');
  return asJob(await retrySo(env,id,scope.owner));
 }
 if(action==='so-cancel'){
  const id=clean(payload?.jobId);
  if(!/^so2-[0-9a-f]{64}$/.test(id))throw Error('Job SO tidak valid.');
  const job=await cancelSo(env.OPERATIONS_DB,id,scope.owner);
  if(!job)throw Error('Job SO tidak ditemukan.');
  return asJob(job);
 }
 throw Error('Aksi SO tidak dikenal.');
}
