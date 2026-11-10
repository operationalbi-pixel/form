import {normalizeSoLedger} from './so-balance.mjs';

// A projection is an immutable, revision-labelled balance input. Fill it with
// keyset pages from every source, then seal it only after source revisions are
// checked again. Never reuse a partially built or stale projection.
export const projectionSchema=`
CREATE TABLE IF NOT EXISTS so_projection_runs (
 projection_id TEXT PRIMARY KEY, revision TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('BUILDING','READY','STALE')),
 source_count INTEGER NOT NULL, source_index INTEGER NOT NULL DEFAULT 0, cursor TEXT NOT NULL DEFAULT '',
 scanned INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS so_projection_rows (
 projection_id TEXT NOT NULL, logical_id TEXT NOT NULL, record_id TEXT NOT NULL,
 version INTEGER NOT NULL, created_at TEXT NOT NULL, created_ms REAL NOT NULL,
 record_type TEXT NOT NULL, outlet_code TEXT NOT NULL, location_code TEXT NOT NULL,
 item_code TEXT NOT NULL, event_date TEXT NOT NULL, direction TEXT NOT NULL,
 quantity REAL NOT NULL, movement_type TEXT NOT NULL,
 source_hash TEXT NOT NULL, source_row INTEGER NOT NULL,
 opname_qty REAL, opname_date TEXT NOT NULL,
 PRIMARY KEY(projection_id,logical_id)
);
CREATE INDEX IF NOT EXISTS so_projection_scope ON so_projection_rows(projection_id,outlet_code,location_code,item_code);
CREATE INDEX IF NOT EXISTS so_projection_audit ON so_projection_rows(projection_id,source_hash,source_row);
`;
const columns=['logical_id','record_id','version','created_at','created_ms','record_type','outlet_code','location_code','item_code','event_date','direction','quantity','movement_type','source_hash','source_row','opname_qty','opname_date'];
const strings=new Set(['logical_id','record_id','created_at','record_type','outlet_code','location_code','item_code','event_date','direction','movement_type','source_hash','opname_date']);

export function projectionPageStatement(db,id,rows) {
  const normalized=rows.map(raw=>{
    const r=normalizeSoLedger(raw),out={};
    for(const c of columns)out[c]=strings.has(c)?String(r[c]??''):c==='opname_qty'?r[c]:Number(r[c]||0);
    return out;
  });
  return db.prepare(`INSERT INTO so_projection_rows(projection_id,${columns.join(',')})
    SELECT ?,${columns.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?)
    WHERE EXISTS(SELECT 1 FROM so_projection_runs WHERE projection_id=? AND state='BUILDING')
    ON CONFLICT(projection_id,logical_id) DO UPDATE SET ${columns.filter(c=>c!=='logical_id').map(c=>`${c}=excluded.${c}`).join(',')}
    WHERE excluded.version>so_projection_rows.version OR
      (excluded.version=so_projection_rows.version AND (excluded.created_at>so_projection_rows.created_at OR
       (excluded.created_at=so_projection_rows.created_at AND excluded.record_id>so_projection_rows.record_id)))`).bind(id,JSON.stringify(normalized),id);
}

export async function startProjection(db,id,revision,sourceCount) {
  if(!Number.isInteger(sourceCount)||sourceCount<1)throw Error('Daftar sumber snapshot wajib lengkap.');
  await db.prepare(`INSERT OR IGNORE INTO so_projection_runs(projection_id,revision,source_count,state) VALUES(?,?,?,'BUILDING')`).bind(id,revision,sourceCount).run();
  const r=(await db.prepare('SELECT * FROM so_projection_runs WHERE projection_id=?').bind(id).all()).results[0];
  if(r.revision!==revision||r.source_count!==sourceCount)throw Error('Identitas snapshot dipakai untuk revisi berbeda.');
  return r;
}

export async function sealProjection(db,id,currentRevision) {
  await db.prepare(`UPDATE so_projection_runs SET state=CASE WHEN revision=? THEN 'READY' ELSE 'STALE' END WHERE projection_id=? AND state='BUILDING' AND source_index=source_count`).bind(currentRevision,id).run();
  return (await db.prepare('SELECT state FROM so_projection_runs WHERE projection_id=?').bind(id).all()).results[0]?.state==='READY';
}

export async function copyProjectionPage(db,id,sources,{limit=500}={}) {
  if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('Ukuran halaman snapshot tidak valid.');
  const run=(await db.prepare('SELECT * FROM so_projection_runs WHERE projection_id=?').bind(id).all()).results[0];
  if(!run||run.state!=='BUILDING'||run.source_index===run.source_count)return run;
  if(sources.length!==run.source_count)throw Error('Daftar sumber snapshot berubah.');
  const source=sources[run.source_index];
  if(!['stock_movements','stock_movements_history'].includes(source.table))throw Error('Tabel snapshot tidak valid.');
  const rows=(await source.database.prepare(`SELECT * FROM ${source.table} WHERE record_id>? ORDER BY record_id LIMIT ?`).bind(run.cursor,limit).all()).results;
  const finished=rows.length<limit,nextCursor=finished?'':rows.at(-1).record_id;
  await db.batch([
    projectionPageStatement(db,id,rows),
    db.prepare(`UPDATE so_projection_runs SET source_index=?,cursor=?,scanned=scanned+? WHERE projection_id=? AND state='BUILDING' AND source_index=? AND cursor=?`).bind(run.source_index+(finished?1:0),nextCursor,rows.length,id,run.source_index,run.cursor)
  ]);
  return (await db.prepare('SELECT * FROM so_projection_runs WHERE projection_id=?').bind(id).all()).results[0];
}

export async function projectedSoBalances(db,id,{outlet,location,eventDate,codes}) {
  if(!codes.length||codes.length>500)throw Error('Batch saldo SO harus 1–500 item.');
  const run=(await db.prepare('SELECT state FROM so_projection_runs WHERE projection_id=?').bind(id).all()).results[0];
  if(run?.state!=='READY')throw Error('Snapshot saldo belum lengkap atau sudah berubah.');
  // Window functions and SUM stay in D1. Only one result per requested item
  // crosses the Worker boundary, irrespective of the number of ledger rows.
  const result=await db.prepare(`
    WITH wanted AS (SELECT value AS item_code FROM json_each(?)),
    scoped AS (SELECT r.* FROM so_projection_rows r JOIN wanted w ON w.item_code=r.item_code
      WHERE r.projection_id=? AND r.outlet_code=? AND r.location_code=?),
    audits AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY item_code,source_hash,source_row ORDER BY created_ms DESC,record_id DESC) audit_rank
      FROM scoped WHERE record_type='OPNAME_DETAIL'),
    effective AS (SELECT m.item_code,m.record_id,m.direction,m.quantity,m.movement_type,m.created_ms,
      CASE WHEN m.movement_type='Stock Opname' THEN COALESCE(NULLIF(a.opname_date,''),NULLIF(m.opname_date,''),m.event_date) ELSE m.event_date END AS day,
      CASE WHEN m.movement_type='Stock Opname' THEN COALESCE(a.opname_qty,m.opname_qty) END AS actual
      FROM scoped m LEFT JOIN audits a ON a.item_code=m.item_code AND a.source_hash=m.source_hash AND a.source_row=m.source_row AND a.audit_rank=1
      WHERE m.record_type='MOVEMENT'),
    dated AS (SELECT * FROM effective WHERE day<=?),
    checkpoints AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY item_code ORDER BY day DESC,created_ms DESC,record_id DESC) checkpoint_rank
      FROM dated WHERE movement_type='Stock Opname' AND actual IS NOT NULL),
    latest AS (SELECT * FROM checkpoints WHERE checkpoint_rank=1)
    SELECT w.item_code,COALESCE(c.actual,0)+COALESCE(SUM(CASE
      WHEN c.item_code IS NOT NULL AND (d.day<=c.day OR d.movement_type='Stock Opname') THEN 0
      WHEN d.direction='IN' THEN d.quantity WHEN d.direction='OUT' THEN -d.quantity ELSE 0 END),0) quantity
    FROM wanted w LEFT JOIN latest c ON c.item_code=w.item_code LEFT JOIN dated d ON d.item_code=w.item_code
    GROUP BY w.item_code,c.actual
  `).bind(JSON.stringify([...new Set(codes)]),id,outlet,location,eventDate).all();
  return Object.fromEntries(result.results.map(r=>[r.item_code,Number(r.quantity)]));
}
