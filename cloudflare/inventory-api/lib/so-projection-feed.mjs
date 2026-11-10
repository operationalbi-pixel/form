import {normalizeSoLedger} from './so-balance.mjs';

/**
 * Each source D1 maintains a small append-only journal for stock ledger changes.
 * Watermarks are captured BEFORE the first full projection copy. Replaying
 * journal entries afterwards prevents concurrent writes from being lost.
 * Later uploads only synchronize changed logical IDs rather than all history.
 */
export const sourceChangeFeedSchema = `
CREATE TABLE IF NOT EXISTS so_ledger_changes (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, logical_id TEXT NOT NULL,
 changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS so_ledger_changes_id ON so_ledger_changes(logical_id,seq);
`;
export function sourceChangeFeedTriggers(table) {
  if(!['stock_movements','stock_movements_history'].includes(table))throw Error('Tabel jurnal SO tidak valid.');
  return `
CREATE TRIGGER IF NOT EXISTS so_feed_${table}_insert AFTER INSERT ON ${table} BEGIN
 INSERT INTO so_ledger_changes(logical_id) VALUES(COALESCE(NULLIF(NEW.logical_id,''),NEW.record_id));
END;
CREATE TRIGGER IF NOT EXISTS so_feed_${table}_delete AFTER DELETE ON ${table} BEGIN
 INSERT INTO so_ledger_changes(logical_id) VALUES(COALESCE(NULLIF(OLD.logical_id,''),OLD.record_id));
END;
CREATE TRIGGER IF NOT EXISTS so_feed_${table}_update AFTER UPDATE ON ${table} BEGIN
 INSERT INTO so_ledger_changes(logical_id) VALUES(COALESCE(NULLIF(OLD.logical_id,''),OLD.record_id));
 INSERT INTO so_ledger_changes(logical_id)
 SELECT COALESCE(NULLIF(NEW.logical_id,''),NEW.record_id)
 WHERE COALESCE(NULLIF(OLD.logical_id,''),OLD.record_id)<>COALESCE(NULLIF(NEW.logical_id,''),NEW.record_id);
END;`;
}
export const projectionWatermarkSchema = `
CREATE TABLE IF NOT EXISTS so_projection_watermarks (
 projection_id TEXT NOT NULL, source_key TEXT NOT NULL, sequence_no INTEGER NOT NULL,
 PRIMARY KEY(projection_id,source_key)
);
`;
const get=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const sqlFields=['logical_id','record_id','version','created_at','created_ms','record_type','outlet_code','location_code','item_code','event_date','direction','quantity','movement_type','source_hash','source_row','opname_qty','opname_date'];
const strings=new Set(['logical_id','record_id','created_at','record_type','outlet_code','location_code','item_code','event_date','direction','movement_type','source_hash','opname_date']);
function normalized(row){
 const v=normalizeSoLedger(row),out={};
 for(const key of sqlFields)out[key]=strings.has(key)?String(v[key]??''):key==='opname_qty'?v[key]:Number(v[key]||0);
 return out;
}
function newest(a,b){
 if(!b)return true;
 if(a.version!==b.version)return a.version>b.version;
 return a.created_at>b.created_at||a.created_at===b.created_at&&a.record_id>b.record_id;
}
function validateSources(sources){
 if(!Array.isArray(sources)||!sources.length)throw Error('Sumber perubahan SO tidak tersedia.');
 const ids=new Set();
 for(const s of sources){
  if(!/^[A-Za-z0-9_-]+$/.test(s.key)||ids.has(s.key)||!['stock_movements','stock_movements_history'].includes(s.table)||!s.database)throw Error('Konfigurasi sumber SO tidak valid.');
  ids.add(s.key);
 }
}
// Capture journal sequence before the first bulk copy; never reset it on resume.
export async function captureProjectionWatermarks(db,id,sources){
 validateSources(sources);
 for(const s of sources){
  const result=await get(s.database,'SELECT COALESCE(MAX(seq),0) AS n FROM so_ledger_changes');
  await db.prepare('INSERT OR IGNORE INTO so_projection_watermarks(projection_id,source_key,sequence_no) VALUES(?,?,?)').bind(id,s.key,Number(result[0]?.n||0)).run();
 }
}
export async function synchronizeProjectionPage(db,id,sources,{limit=40}={}){
 validateSources(sources);
 if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Ukuran perubahan SO tidak valid.');
 const run=(await get(db,'SELECT state FROM so_projection_runs WHERE projection_id=?',id))[0];
 if(run?.state!=='READY')throw Error('Projection SO belum selesai.');
 for(const source of sources){
  const watermark=(await get(db,'SELECT sequence_no FROM so_projection_watermarks WHERE projection_id=? AND source_key=?',id,source.key))[0];
  if(!watermark)throw Error('Watermark SO belum direkam untuk '+source.key);
  const changes=await get(source.database,'SELECT seq,logical_id FROM so_ledger_changes WHERE seq>? ORDER BY seq LIMIT ?',watermark.sequence_no,limit);
  if(!changes.length)continue;
  const ids=[...new Set(changes.map(x=>String(x.logical_id)))];
  const latest=new Map();
  const names=ids.map(()=>'?').join(',');
  for(const s of sources){
   const rows=await get(s.database,`SELECT * FROM ${s.table} WHERE logical_id IN (${names}) OR record_id IN (${names})`,...ids,...ids);
   for(const raw of rows){
    const row=normalized(raw),previous=latest.get(row.logical_id);
    if(newest(row,previous))latest.set(row.logical_id,row);
   }
  }
  const select=ids.map(()=>'?').join(','),values=JSON.stringify([...latest.values()]);
  const watermarkRow=changes.at(-1).seq;
  await db.batch([
   db.prepare(`DELETE FROM so_projection_rows WHERE projection_id=? AND logical_id IN (${select})`).bind(id,...ids),
   db.prepare(`INSERT INTO so_projection_rows(projection_id,${sqlFields.join(',')})
    SELECT ?,${sqlFields.map(x=>`json_extract(value,'$.${x}')`).join(',')} FROM json_each(?)`).bind(id,values),
   db.prepare('UPDATE so_projection_watermarks SET sequence_no=? WHERE projection_id=? AND source_key=? AND sequence_no=?').bind(watermarkRow,id,source.key,watermark.sequence_no)
  ]);
  return {changed:ids.length,source:source.key,more:true};
 }
 return {changed:0,more:false};
}
export async function projectionFeedCaughtUp(db,id,sources){
 validateSources(sources);
 for(const s of sources){
  const [cursor,max]=await Promise.all([
   get(db,'SELECT sequence_no FROM so_projection_watermarks WHERE projection_id=? AND source_key=?',id,s.key),
   get(s.database,'SELECT COALESCE(MAX(seq),0) AS n FROM so_ledger_changes')
  ]);
  if(!cursor.length||cursor[0].sequence_no<Number(max[0]?.n||0))return false;
 }
 return true;
}
