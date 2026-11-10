import {parseSoWorkbook,validateSoDate,SoValidationError} from './so-report.mjs';

export async function soHash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
const nowIso=()=>new Date().toISOString();
const first=async statement=>(await statement.all()).results[0];
export const readSoJob=(db,id)=>first(db.prepare('SELECT * FROM so_upload_jobs WHERE job_id=?').bind(id));

// Call only after a verified, short-lived BIHQ grant. There is deliberately no
// fallback to the old GAS job or an implicit restart of a cancelled upload.
export async function acceptSo(env,claims,payload,today) {
  if(claims.outlet!=='BIHQ'||!claims.owner)throw Error('Upload SO hanya untuk BIHQ.');
  const eventDate=validateSoDate(payload.eventDate,today);
  const location=String(payload.location||'Store');
  if(!Array.isArray(claims.locations)||!claims.locations.includes(location))throw Error('Lokasi SO tidak diizinkan.');
  if(!/\.xlsx$/i.test(payload.fileName||'')||typeof payload.base64!=='string'||!payload.base64.length||payload.base64.length>7*1024*1024)throw Error('Pilih file .xlsx maksimal 5 MB.');
  const hash=await soHash(payload.base64),id='so2-'+await soHash([claims.owner,hash,eventDate,location].join('|'));
  const existing=await readSoJob(env.OPERATIONS_DB,id);
  if(existing)return existing;
  const key='so-v2/source/'+id+'.json',created=nowIso();
  // The durable source precedes acceptance. An orphaned object is harmless;
  // a database job without a recoverable source is not.
  await env.FILES.put(key,JSON.stringify({fileName:payload.fileName,base64:payload.base64}));
  await env.OPERATIONS_DB.batch([
    env.OPERATIONS_DB.prepare(`INSERT OR IGNORE INTO so_upload_jobs(job_id,owner_nik,source_hash,file_name,source_key,event_date,location_code,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'RECEIVED',?,?)`).bind(id,claims.owner,hash,String(payload.fileName).slice(0,180),key,eventDate,location,created,created),
    env.OPERATIONS_DB.prepare('INSERT OR IGNORE INTO so_upload_outbox(job_id) VALUES(?)').bind(id)
  ]);
  // A failed send does not lose an accepted job: the outbox dispatcher retries.
  try{await env.SO_UPLOAD_QUEUE.send({kind:'SO_V2',id});}catch(error){console.error(JSON.stringify({event:'so_wakeup_deferred',id,message:String(error.message)}));}
  return readSoJob(env.OPERATIONS_DB,id);
}

export async function cancelSo(db,id,owner) {
  // Clearing the fencing token prevents a currently parsing consumer from
  // committing its staged rows after the cancellation has been acknowledged.
  await db.batch([
    db.prepare(`UPDATE so_upload_jobs SET status='CANCELLED',lease_token=NULL,lease_until=0,updated_at=? WHERE job_id=? AND owner_nik=? AND status IN ('RECEIVED','STAGING','READY','PREPARING','ACTION_REQUIRED')`).bind(nowIso(),id,owner),
    db.prepare('DELETE FROM so_upload_outbox WHERE job_id=? AND EXISTS(SELECT 1 FROM so_upload_jobs WHERE job_id=? AND owner_nik=? AND status=\'CANCELLED\')').bind(id,id,owner)
  ]);
  const result=await readSoJob(db,id);
  return result?.owner_nik===owner?result:null;
}

// Retry is permitted only before the first committed stock batch. A partially
// saved SO requires reconciliation; resetting its plan would duplicate stock.
export async function retrySo(env,id,owner){
 const db=env.OPERATIONS_DB;
 const job=await readSoJob(db,id);
 if(!job||job.owner_nik!==owner)throw Error('Job SO tidak ditemukan.');
 if(job.status!=='ACTION_REQUIRED')throw Error('Hanya job yang perlu tindakan yang dapat divalidasi ulang.');
 const receipt=await first(db.prepare('SELECT COUNT(*) AS n FROM so_commit_batches WHERE job_id=?').bind(id));
 if(Number(job.committed||0)>0||Number(receipt?.n||0)>0)throw Error('Job telah menulis sebagian stok. Lakukan rekonsiliasi dahulu; tidak aman memulai ulang.');
 const next=job.staged===job.total&&job.parsed_key&&job.total>0?'READY':'RECEIVED';
 // Existing staged rows are kept if already parsed and valid; invalid source
 // must be reparsed from R2 after the directory/master has been corrected.
 await db.batch([
  db.prepare('DELETE FROM so_upload_plans WHERE job_id=? AND EXISTS(SELECT 1 FROM so_upload_jobs WHERE job_id=? AND owner_nik=? AND status=\'ACTION_REQUIRED\' AND committed=0)').bind(id,id,owner),
  db.prepare('DELETE FROM so_upload_scope_revisions WHERE job_id=?').bind(id),
  db.prepare(`UPDATE so_upload_jobs SET status=?,planned=0,committed=0,planning_cursor=0,commit_cursor=0,master_cursor=0,
    projection_id=NULL,plan_revision=NULL,error_json=NULL,lease_token=NULL,lease_until=0,updated_at=?
    WHERE job_id=? AND owner_nik=? AND status='ACTION_REQUIRED' AND committed=0`).bind(next,nowIso(),id,owner),
  db.prepare('INSERT OR IGNORE INTO so_upload_outbox(job_id) VALUES(?)').bind(id),
  db.prepare('UPDATE so_upload_outbox SET available_at=0 WHERE job_id=?').bind(id)
 ]);
 try{await env.SO_UPLOAD_QUEUE.send({kind:'SO_V2',id});}catch(error){console.error(JSON.stringify({event:'so_retry_deferred',id,message:String(error.message)}));}
 return readSoJob(db,id);
}

export async function stageSoStep(env,id,directory,{parse=parseSoWorkbook,clock=Date.now}={}) {
  const db=env.OPERATIONS_DB,token=crypto.randomUUID(),now=clock();
  const claimed=await db.prepare(`UPDATE so_upload_jobs SET lease_token=?,lease_until=?,updated_at=? WHERE job_id=? AND status IN ('RECEIVED','STAGING') AND lease_until<=? RETURNING *`).bind(token,now+120000,nowIso(),id,now).all();
  const job=claimed.results[0];if(!job)return readSoJob(db,id);
  try {
    // Deterministic object name makes parsing recoverable even if the worker
    // dies between persisting parsed data and updating the D1 job.
    const parsedKey='so-v2/parsed/'+id+'.json';let object=await env.FILES.get(parsedKey),report;
    if(object)report=await object.json();
    else {
      object=await env.FILES.get(job.source_key);if(!object)throw Error('File sumber SO tidak tersedia.');
      const source=await object.json();
      try{report=parse(source.base64,source.fileName,directory);}catch(error){
        throw error instanceof SoValidationError?error:new SoValidationError([{row:0,message:String(error.message)}]);
      }
      await env.FILES.put(parsedKey,JSON.stringify(report));
    }
    const rows=report.rows.slice(job.staged,job.staged+500),next=job.staged+rows.length,complete=next===report.rows.length;
    const encoded=JSON.stringify(rows),fenceTime=clock();
    await db.batch([
      db.prepare(`INSERT INTO so_upload_rows(job_id,source_row,outlet_code,item_code,payload_json)
        SELECT ?,json_extract(value,'$.sourceRow'),json_extract(value,'$.outlet'),json_extract(value,'$.code'),value FROM json_each(?)
        WHERE EXISTS(SELECT 1 FROM so_upload_jobs WHERE job_id=? AND lease_token=? AND lease_until>? AND status IN ('RECEIVED','STAGING'))
        ON CONFLICT(job_id,source_row) DO NOTHING`).bind(id,encoded,id,token,fenceTime),
      db.prepare(`UPDATE so_upload_jobs SET parsed_key=?,total=?,staged=?,status=?,lease_token=NULL,lease_until=0,error_json=NULL,updated_at=? WHERE job_id=? AND lease_token=? AND lease_until>? AND status IN ('RECEIVED','STAGING')`).bind(parsedKey,report.rows.length,next,complete?'READY':'STAGING',nowIso(),id,token,fenceTime),
      db.prepare(`DELETE FROM so_upload_outbox WHERE job_id=? AND EXISTS(SELECT 1 FROM so_upload_jobs WHERE job_id=? AND status IN ('CANCELLED','ACTION_REQUIRED'))`).bind(id,id)
    ]);
    return readSoJob(db,id);
  } catch(error) {
    const issues=error instanceof SoValidationError?error.issues:null;
    await db.batch([
      db.prepare(`UPDATE so_upload_jobs SET status=CASE WHEN ? THEN 'ACTION_REQUIRED' ELSE status END,lease_token=NULL,lease_until=0,error_json=?,updated_at=? WHERE job_id=? AND lease_token=?`).bind(issues?1:0,JSON.stringify({message:String(error.message),issues}),nowIso(),id,token),
      db.prepare(`DELETE FROM so_upload_outbox WHERE job_id=? AND EXISTS(SELECT 1 FROM so_upload_jobs WHERE job_id=? AND status='ACTION_REQUIRED')`).bind(id,id)
    ]);
    if(!issues)throw error;
    return readSoJob(db,id);
  }
}

export async function dispatchSoOutbox(env) {
  const pending=await env.OPERATIONS_DB.prepare(`SELECT o.job_id FROM so_upload_outbox o JOIN so_upload_jobs j ON j.job_id=o.job_id WHERE o.available_at<=? AND j.lease_until<=? AND j.status IN ('RECEIVED','STAGING','READY','PREPARING','PROCESSING') LIMIT 50`).bind(Date.now(),Date.now()).all();
  let sent=0;
  for(const row of pending.results) {
    // A temporarily unavailable Queue must not prevent other accepted jobs
    // from being dispatched. Keep failed wake-ups in the durable outbox.
    try {
      await env.SO_UPLOAD_QUEUE.send({kind:'SO_V2',id:row.job_id});
      sent++;
      await env.OPERATIONS_DB.prepare('UPDATE so_upload_outbox SET available_at=? WHERE job_id=?').bind(Date.now()+60000,row.job_id).run();
    } catch(error) {
      console.error(JSON.stringify({event:'so_dispatch_deferred',id:row.job_id,message:String(error.message)}));
      // Delay retries to avoid hammering a failing Queue; the job stays durable.
      await env.OPERATIONS_DB.prepare('UPDATE so_upload_outbox SET available_at=? WHERE job_id=?').bind(Date.now()+30000,row.job_id).run();
    }
  }
  return sent;
}

export function soJobProgress(job) {
  // READY means staging complete; it must NEVER be presented as stock saved.
  const total=Number(job.total||0),staged=Number(job.staged||0),planned=Number(job.planned||0),committed=Number(job.committed||0);
  const stage=job.status==='COMPLETE'?'Stok dan audit sudah disimpan.':job.status==='PROCESSING'?`Menyimpan transaksi ${committed}/${total}.`:job.status==='PREPARING'?`Memvalidasi saldo ${planned}/${total}.`:job.status==='READY'?'File selesai dibaca; menunggu pemeriksaan saldo dan duplikat.':job.status==='STAGING'?`Menyiapkan baris ${staged}/${total}.`:job.status==='CANCELLED'?'Upload dihentikan.':job.status==='ACTION_REQUIRED'?'Upload perlu diperiksa.':'File diterima.';
  return {jobId:job.job_id,status:job.status,stage,staged,planned,committed,total,
    progress:job.status==='COMPLETE'?100:job.status==='PROCESSING'?60+Math.floor(39*committed/Math.max(1,total)):job.status==='PREPARING'?25+Math.floor(35*planned/Math.max(1,total)):job.status==='READY'?25:Math.floor(25*staged/Math.max(1,total)),
    stockCommitted:job.status==='COMPLETE',error:job.error_json?JSON.parse(job.error_json):null};
}
