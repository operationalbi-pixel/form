import {readSoJob,stageSoStep,soHash,soJobProgress} from './so-intake.mjs';
import {startProjection,copyProjectionPage,sealProjection,projectedSoBalances,projectedSoLaterCheckpoints} from './so-projection.mjs';
import {captureProjectionWatermarks,synchronizeProjectionPage,projectionFeedCaughtUp} from './so-projection-feed.mjs';
import {buildSoPlanRows,commitSoPlanBatch} from './so-plan.mjs';

const PROJECTION='so-v2-shared-2026';
const now=()=>Date.now();
const iso=()=>new Date().toISOString();
const dbRow=async(db,sql,...params)=>(await db.prepare(sql).bind(...params).all()).results[0];
const dbRows=async(db,sql,...params)=>(await db.prepare(sql).bind(...params).all()).results;
export function soSources(env){
 const result=[{key:'operations',table:'stock_movements',database:env.OPERATIONS_DB}];
 const names=['HISTORY_DB_2026','HISTORY_DB_2026_06','HISTORY_DB_2026_07','HISTORY_DB_2026_08','HISTORY_DB_2026_09','HISTORY_DB_2026_10','HISTORY_DB_2026_11','HISTORY_DB_2026_12'];
 for(const key of names)if(env[key])result.push({key,table:'stock_movements_history',database:env[key]});
 return result;
}
export async function soRevisions(sources){
 const pairs=[];
 for(const s of sources){
  const value=await dbRow(s.database,'SELECT COALESCE(SUM(revision),0) AS n FROM stock_snapshot_revisions');
  pairs.push([s.key,Number(value?.n||0)]);
 }
 return JSON.stringify(pairs);
}
function committedRevision(expected,committed){
 const arr=JSON.parse(expected);
 return JSON.stringify(arr.map(([name,count])=>[name,name==='operations'?count+2*committed:count]));
}
async function outboxLater(env,id,ms=1000){
 await env.OPERATIONS_DB.prepare('UPDATE so_upload_outbox SET available_at=? WHERE job_id=?').bind(now()+ms,id).run();
}
async function actionRequired(env,id,message,issues=[]){
 const db=env.OPERATIONS_DB;
 await db.batch([
  db.prepare("UPDATE so_upload_jobs SET status='ACTION_REQUIRED',lease_token=NULL,lease_until=0,error_json=?,updated_at=? WHERE job_id=? AND status NOT IN ('COMPLETE','CANCELLED')").bind(JSON.stringify({message,issues}),iso(),id),
  db.prepare('DELETE FROM so_upload_outbox WHERE job_id=?').bind(id)
 ]);
 return readSoJob(db,id);
}
async function directory(env){
 return (await env.MASTER_DB.prepare('SELECT outlet_code code,outlet_name name,active FROM outlets').all()).results.map(r=>({...r,active:Boolean(r.active)}));
}
async function sharedProjectionStep(env,sources){
 const db=env.OPERATIONS_DB;
 let run=await dbRow(db,'SELECT * FROM so_projection_runs WHERE projection_id=?',PROJECTION);
 if(!run){
  run=await startProjection(db,PROJECTION,'journal-feed-v1',sources.length);
  await captureProjectionWatermarks(db,PROJECTION,sources);
 }
 if(run.state==='BUILDING'){
  // If the first Worker dies after creating the run, finish recording every
  // source watermark before allowing any keyset copy to advance.
  await captureProjectionWatermarks(db,PROJECTION,sources);
  if(run.source_index<run.source_count){
   run=await copyProjectionPage(db,PROJECTION,sources,{limit:500});
   return {ready:false,stage:'Membangun snapshot historis satu kali',scanned:run.scanned};
  }
  await sealProjection(db,PROJECTION,'journal-feed-v1');
 }
 if(!(await projectionFeedCaughtUp(db,PROJECTION,sources))){
  await synchronizeProjectionPage(db,PROJECTION,sources,{limit:40});
  return {ready:false,stage:'Menyinkronkan perubahan saldo'};
 }
 return {ready:true,id:PROJECTION};
}
async function claim(db,job,states,clock=now){
 const token=crypto.randomUUID(),t=clock();
 const marks=states.map(()=>'?').join(',');
 const r=await db.prepare(`UPDATE so_upload_jobs SET lease_token=?,lease_until=?,updated_at=? WHERE job_id=? AND status IN (${marks}) AND lease_until<=? RETURNING *`).bind(token,t+120000,iso(),job.job_id,...states,t).all();
 return r.results[0]||null;
}
async function finishLease(db,id,token){
 await db.prepare('UPDATE so_upload_jobs SET lease_token=NULL,lease_until=0,updated_at=? WHERE job_id=? AND lease_token=?').bind(iso(),id,token).run();
}
async function duplicateSoCodes(db,id,job,outlet,codes){
 // Read the canonical, globally resolved history, not an event-date-specific
 // shard. A corrected prior SO can have an effective date in another partition.
 const rows=await dbRows(db,`WITH wanted AS(SELECT value AS item_code FROM json_each(?)),
  scoped AS (SELECT r.* FROM so_projection_rows r JOIN wanted w USING(item_code)
    WHERE r.projection_id=? AND r.outlet_code=? AND r.location_code=?),
  audits AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY item_code,source_hash,source_row
    ORDER BY created_ms DESC,record_id DESC) n FROM scoped WHERE record_type='OPNAME_DETAIL')
  SELECT DISTINCT m.item_code FROM scoped m LEFT JOIN audits a ON a.item_code=m.item_code
    AND a.source_hash=m.source_hash AND a.source_row=m.source_row AND a.n=1
  WHERE m.record_type='MOVEMENT' AND m.movement_type='Stock Opname'
    AND COALESCE(NULLIF(a.opname_date,''),NULLIF(m.opname_date,''),m.event_date)=?`,
  JSON.stringify(codes),id,outlet,job.location_code,job.event_date);
 return new Set(rows.map(x=>x.item_code));
}
export async function prepareSoStep(env,job,sources){
 const db=env.OPERATIONS_DB;
 const active=await claim(db,job,['READY','PREPARING']);
 if(!active)return readSoJob(db,job.job_id);
 try{
  const revision=await soRevisions(sources);
  if(active.status==='READY'){
   await db.prepare("UPDATE so_upload_jobs SET status='PREPARING',projection_id=?,plan_revision=? WHERE job_id=? AND lease_token=? AND status='READY'").bind(PROJECTION,revision,job.job_id,active.lease_token).run();
   active.plan_revision=revision;
  }
  if(active.plan_revision!==revision)throw Error('Saldo berubah selama persiapan SO. File belum disimpan, jalankan validasi ulang.');
  const source=await dbRows(db,'SELECT source_row,outlet_code,item_code,payload_json FROM so_upload_rows WHERE job_id=? AND source_row>? ORDER BY source_row LIMIT 25',job.job_id,active.planning_cursor||0);
  if(!source.length){
   if(active.planned!==active.total)throw Error('Jumlah baris perencanaan SO tidak cocok.');
   const after=await soRevisions(sources);
   if(after!==active.plan_revision)throw Error('Data stok berubah sebelum penyimpanan. Harap validasi ulang.');
   await db.prepare("UPDATE so_upload_jobs SET status='PROCESSING',lease_token=NULL,lease_until=0,updated_at=? WHERE job_id=? AND lease_token=?").bind(iso(),job.job_id,active.lease_token).run();
   return readSoJob(db,job.job_id);
  }
  const master=await env.MASTER_DB.prepare(`SELECT item_code,item_name,category,default_unit,active FROM stock_items
    WHERE item_code IN (${source.map(()=>'?').join(',')})`).bind(...source.map(x=>x.item_code)).all();
  const found=Object.fromEntries(master.results.map(x=>[x.item_code,x]));
  const missing=source.filter(x=>!found[x.item_code]);
  if(missing.length)throw Error('Item belum ada dalam master: '+missing.slice(0,5).map(x=>x.item_code).join(', ')+'. Tambahkan item master terlebih dahulu.');
  const disabled=source.filter(x=>!found[x.item_code].active);
  if(disabled.length)throw Error('Item master tidak aktif: '+disabled.slice(0,5).map(x=>x.item_code).join(', '));
  const outlets=[...new Set(source.map(x=>x.outlet_code))];
  const outletMaster=await env.MASTER_DB.prepare(`SELECT outlet_code,active FROM outlets WHERE outlet_code IN (${outlets.map(()=>'?').join(',')})`).bind(...outlets).all();
  if(outletMaster.results.length!==outlets.length||outletMaster.results.some(x=>!x.active))throw Error('Outlet pada file SO tidak aktif atau tidak ditemukan di master.');
  const planned=[];
  for(const outlet of outlets){
   const subset=source.filter(x=>x.outlet_code===outlet),codes=[...new Set(subset.map(x=>x.item_code))];
   const duplicates=await duplicateSoCodes(db,PROJECTION,active,outlet,codes);
   if(duplicates.size)throw Error('Sudah ada Stock Opname pada tanggal yang sama: '+outlet+' / '+[...duplicates].slice(0,5).join(', '));
   const balances=await projectedSoBalances(db,PROJECTION,{outlet,location:active.location_code,eventDate:active.event_date,codes});
   const later=await projectedSoLaterCheckpoints(db,PROJECTION,{outlet,location:active.location_code,eventDate:active.event_date,codes});
   const generated=await buildSoPlanRows(active,subset.map(x=>JSON.parse(x.payload_json)),found,balances,later);
   if(generated.issues.length)throw Error(generated.issues.slice(0,5).map(x=>'Baris '+x.row+': '+x.message).join('; '));
   planned.push(...generated.rows);
  }
  if(await soRevisions(sources)!==active.plan_revision)throw Error('Saldo berubah ketika memvalidasi SO. Tidak ada transaksi yang ditulis.');
  const last=source.at(-1).source_row;
  await db.batch([
   db.prepare(`INSERT INTO so_upload_plans(job_id,source_row,outlet_code,item_code,payload_json)
    SELECT ?,json_extract(value,'$.sourceRow'),json_extract(value,'$.outlet'),json_extract(value,'$.code'),value FROM json_each(?) WHERE true
    ON CONFLICT(job_id,source_row) DO NOTHING`).bind(job.job_id,JSON.stringify(planned)),
   db.prepare('UPDATE so_upload_jobs SET planned=planned+?,planning_cursor=?,updated_at=?,lease_token=NULL,lease_until=0 WHERE job_id=? AND lease_token=? AND status=? AND planning_cursor=?')
    .bind(source.length,last,iso(),job.job_id,active.lease_token,'PREPARING',active.planning_cursor||0)
  ]);
  return readSoJob(db,job.job_id);
 }catch(error){
  await actionRequired(env,job.job_id,String(error.message||error));
  return readSoJob(db,job.job_id);
 }finally{
  await finishLease(db,job.job_id,active.lease_token);
 }
}
export async function commitSoStep(env,job,sources){
 const db=env.OPERATIONS_DB,active=await claim(db,job,['PROCESSING']);
 if(!active)return readSoJob(db,job.job_id);
 try{
  if(committedRevision(active.plan_revision,Number(active.committed||0))!==await soRevisions(sources))
   throw Error('Revisi stok berubah saat menyimpan SO. Transaksi sebelumnya tetap tersimpan; perlu rekonsiliasi sebelum melanjutkan.');
  const rows=await dbRows(db,'SELECT source_row,outlet_code,payload_json FROM so_upload_plans WHERE job_id=? AND source_row>? ORDER BY source_row LIMIT 25',job.job_id,active.commit_cursor||0);
  if(!rows.length){
   const receipts=await dbRow(db,'SELECT COALESCE(SUM(row_count),0) AS n FROM so_commit_batches WHERE job_id=?',job.job_id);
   if(Number(receipts?.n)!==Number(active.total)||Number(active.committed)!==Number(active.total))throw Error('Rekonsiliasi jumlah batch SO gagal.');
   const audits=await dbRow(db,"SELECT COUNT(*) AS n FROM stock_movements WHERE source_hash=? AND record_type='OPNAME_DETAIL'",active.source_hash);
   const moves=await dbRow(db,"SELECT COUNT(*) AS n FROM stock_movements WHERE source_hash=? AND record_type='MOVEMENT' AND movement_type='Stock Opname'",active.source_hash);
   if(Number(audits?.n)!==active.total||Number(moves?.n)!==active.total)throw Error('Rekonsiliasi audit atau mutasi SO gagal.');
   await db.batch([
    db.prepare("UPDATE so_upload_jobs SET status='COMPLETE',lease_token=NULL,lease_until=0,updated_at=? WHERE job_id=? AND lease_token=?").bind(iso(),job.job_id,active.lease_token),
    db.prepare('DELETE FROM so_upload_outbox WHERE job_id=?').bind(job.job_id)
   ]);
   return readSoJob(db,job.job_id);
  }
  const outlet=rows[0].outlet_code,group=rows.filter(x=>x.outlet_code===outlet);
  const plans=group.map(x=>JSON.parse(x.payload_json));
  const currentMaster=await env.MASTER_DB.prepare(`SELECT item_code,default_unit,active FROM stock_items WHERE item_code IN (${plans.map(()=>'?').join(',')})`).bind(...plans.map(x=>x.code)).all();
  const masters=Object.fromEntries(currentMaster.results.map(x=>[x.item_code,x]));
  for(const p of plans)if(!masters[p.code]?.active||String(masters[p.code].default_unit).replace(/\s/g,'').toUpperCase()!==String(p.movement.unit).replace(/\s/g,'').toUpperCase())
   throw Error('Master item berubah selama SO: '+p.code);
  const earlier=await dbRow(db,'SELECT COALESCE(SUM(row_count),0) AS n FROM so_commit_batches WHERE job_id=? AND outlet_code=?',job.job_id,outlet);
  const first=await dbRow(db,'SELECT revision FROM so_upload_scope_revisions WHERE job_id=? AND outlet_code=?',job.job_id,outlet);
  const current=await dbRow(db,'SELECT revision FROM stock_snapshot_revisions WHERE outlet_code=? AND location_code=?',outlet,active.location_code);
  const expectedRevision=first?first.revision+2*Number(earlier.n):Number(current?.revision||0);
  if(first&&Number(current?.revision||0)!==expectedRevision)throw Error('Saldo outlet '+outlet+' berubah saat menyimpan SO.');
  if(!first)await db.prepare('INSERT OR IGNORE INTO so_upload_scope_revisions(job_id,outlet_code,revision) VALUES(?,?,?)').bind(job.job_id,outlet,expectedRevision).run();
  if(committedRevision(active.plan_revision,Number(active.committed||0))!==await soRevisions(sources))
   throw Error('Revisi stok berubah sebelum transaksi SO ditulis.');
  const last=group.at(-1).source_row;
  const batchId='so2-b-'+await soHash([job.job_id,group[0].source_row,last].join('|'));
  await commitSoPlanBatch(db,active,plans,{batchId,expectedRevision,leaseToken:active.lease_token,
   progress:{from:active.commit_cursor||0,to:last,count:group.length}});
  return readSoJob(db,job.job_id);
 }catch(error){
  await actionRequired(env,job.job_id,String(error.message||error));
  return readSoJob(db,job.job_id);
 }finally{
  await finishLease(db,job.job_id,active.lease_token);
 }
}
export async function processSoJob(env,id){
 const db=env.OPERATIONS_DB,job=await readSoJob(db,id);
 if(!job)return null;
 if(['COMPLETE','ACTION_REQUIRED','CANCELLED'].includes(job.status))return soJobProgress(job);
 let result;
 if(job.status==='RECEIVED'||job.status==='STAGING')result=await stageSoStep(env,id,await directory(env));
 else {
  const sources=soSources(env),state=await sharedProjectionStep(env,sources);
  if(!state.ready){await outboxLater(env,id,1500);return {...soJobProgress(job),stage:state.stage,scanned:state.scanned||0};}
  if(job.status==='READY'||job.status==='PREPARING')result=await prepareSoStep(env,job,sources);
  else if(job.status==='PROCESSING')result=await commitSoStep(env,job,sources);
 }
 if(result&&!['COMPLETE','ACTION_REQUIRED','CANCELLED'].includes(result.status))await outboxLater(env,id,500);
 return result?soJobProgress(result):null;
}
