import {soHash} from './so-intake.mjs';

const unit=value=>String(value||'').trim().replace(/\s+/g,'').toUpperCase();

// A plan is created only from a complete, revision-validated balance snapshot.
// Its IDs identify the stock effect, not a browser request or its owner.
export async function buildSoPlanRows(job,rows,master,balances,laterCheckpoints={}) {
  const issues=[],result=[];
  for(const row of rows) {
    const item=master[row.code]||{item_code:row.code,item_name:row.name,category:row.category||'Uncategorized',default_unit:row.unit};
    if(unit(row.unit)!==unit(item.default_unit)) {
      issues.push({row:row.sourceRow,itemCode:row.code,fromUnit:item.default_unit,toUnit:row.unit,message:'Unit file berbeda dari Unit Default. Konfirmasi perubahan unit terlebih dahulu.'});continue;
    }
    if(!Object.hasOwn(balances,row.code)||!Number.isFinite(balances[row.code]))throw Error('Snapshot belum memuat saldo '+row.code+'.');
    const cardQty=balances[row.code],actualQty=Number(row.actualQty),delta=actualQty-cardQty;
    if(!Number.isFinite(actualQty)||actualQty<0||!Number.isFinite(delta))throw Error('QTY SO tidak valid pada baris '+row.sourceRow+'.');
    const identity=await soHash([job.source_hash,job.event_date,job.location_code,row.outlet,row.code].join('|'));
    const shared={version:1,outlet_code:row.outlet,location_code:job.location_code,item_code:row.code,item_name:item.item_name,category:item.category,unit:item.default_unit,event_date:job.event_date,created_at:job.created_at,created_by:job.owner_nik,source_file:job.file_name,source_hash:job.source_hash,source_row:row.sourceRow};
    const auditId='so2-a-'+identity,movementId='so2-m-'+identity;
    const audit={...shared,record_id:auditId,logical_id:auditId,record_type:'OPNAME_DETAIL',direction:'NONE',quantity:actualQty,movement_type:'Stock Opname Audit',info:JSON.stringify({cardQty,actualQty,reportQty:row.actualQty,conversionFactor:1,eventDate:job.event_date,effectiveDate:job.event_date})};
    const movement={...shared,record_id:movementId,logical_id:movementId,record_type:'MOVEMENT',direction:delta>=0?'IN':'OUT',quantity:Math.abs(delta),movement_type:'Stock Opname',info:`Hasil Stock Opname tanggal ${job.event_date} · Saldo sistem ${cardQty} → Balance ${actualQty}`,arrival_date:delta>0?job.event_date:null};
    // A later dated SO resets the ledger; a backdated SO must not perturb today's balance.
    const balanceDelta=laterCheckpoints[row.code]?0:delta;
    result.push({sourceRow:row.sourceRow,outlet:row.outlet,code:row.code,cardQty,actualQty,delta,balanceDelta,audit,movement,newItem:master[row.code]?null:item});
  }
  return {rows:issues.length?[]:result,issues};
}

export const commitSchema=`
CREATE TABLE IF NOT EXISTS so_commit_batches (
 batch_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, outlet_code TEXT NOT NULL,
 digest TEXT NOT NULL, row_count INTEGER NOT NULL, committed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS so_commit_guard (
 id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1)
);
`;

const ledgerColumns=['record_id','logical_id','version','record_type','outlet_code','location_code','item_code','category','item_name','unit','direction','quantity','movement_type','info','event_date','arrival_date','source_file','source_hash','source_row','created_by','created_at'];

// Both records, the balance effect, and the durable batch receipt commit in a
// single D1 transaction. This does NOT call the older multi-transaction writer.
// The caller must check history revisions and master units immediately before
// invoking this function; the operations revision is checked inside the batch.
export async function commitSoPlanBatch(db,job,plans,{batchId,expectedRevision,leaseToken,clock=Date.now}) {
  if(!plans.length||plans.length>25)throw Error('Batch SO harus 1–25 item.');
  const outlet=plans[0].outlet;
  if(plans.some(p=>p.outlet!==outlet||p.movement.location_code!==job.location_code))throw Error('Batch SO harus satu outlet dan lokasi.');
  const content=JSON.stringify(plans),digest=await soHash(content);
  const existing=(await db.prepare('SELECT * FROM so_commit_batches WHERE batch_id=?').bind(batchId).all()).results[0];
  if(existing) {
    if(existing.digest!==digest||existing.job_id!==job.job_id)throw Error('Identitas batch SO dipakai untuk rencana berbeda.');
    return {committed:true,replayed:true,count:existing.row_count};
  }
  const encoded=JSON.stringify(plans.flatMap(p=>[p.audit,p.movement])),time=clock();
  await db.batch([
    db.prepare(`INSERT OR REPLACE INTO so_commit_guard(id,valid) SELECT ?,CASE WHEN
      EXISTS(SELECT 1 FROM so_upload_jobs WHERE job_id=? AND status='PROCESSING' AND lease_token=? AND lease_until>?)
      AND COALESCE((SELECT revision FROM stock_snapshot_revisions WHERE outlet_code=? AND location_code=?),0)=?
      AND NOT EXISTS(SELECT 1 FROM so_commit_batches WHERE batch_id=?)
      THEN 1 ELSE 0 END`).bind(batchId,job.job_id,leaseToken,time,outlet,job.location_code,expectedRevision,batchId),
    db.prepare(`INSERT INTO stock_balances(outlet_code,location_code,item_code,item_name,current_qty,unit,updated_at)
      SELECT json_extract(value,'$.movement.outlet_code'),json_extract(value,'$.movement.location_code'),json_extract(value,'$.code'),json_extract(value,'$.movement.item_name'),json_extract(value,'$.balanceDelta'),json_extract(value,'$.movement.unit'),?
      FROM json_each(?) WHERE NOT EXISTS(SELECT 1 FROM stock_movements WHERE record_id=json_extract(value,'$.movement.record_id'))
      ON CONFLICT(outlet_code,location_code,item_code) DO UPDATE SET current_qty=stock_balances.current_qty+excluded.current_qty,item_name=excluded.item_name,unit=excluded.unit,updated_at=excluded.updated_at`).bind(nowIso(),content),
    db.prepare(`INSERT INTO stock_movements(${ledgerColumns.join(',')}) SELECT ${ledgerColumns.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?) WHERE true ON CONFLICT(record_id) DO NOTHING`).bind(encoded),
    db.prepare(`INSERT INTO so_commit_batches(batch_id,job_id,outlet_code,digest,row_count,committed_at) VALUES(?,?,?,?,?,?)`).bind(batchId,job.job_id,outlet,digest,plans.length,nowIso()),
    db.prepare('DELETE FROM so_commit_guard WHERE id=?').bind(batchId)
  ]);
  return {committed:true,replayed:false,count:plans.length};
}
const nowIso=()=>new Date().toISOString();
