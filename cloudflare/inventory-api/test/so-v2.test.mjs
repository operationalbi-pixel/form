import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {zipSync,strToU8} from 'fflate';
import {parseSoCells,parseSoWorkbook,validateSoDate} from '../lib/so-report.mjs';
import {soBalances} from '../lib/so-balance.mjs';
import {projectionSchema,startProjection,projectionPageStatement,sealProjection,projectedSoBalances,projectedSoLaterCheckpoints,copyProjectionPage} from '../lib/so-projection.mjs';
import {buildSoPlanRows,commitSchema,commitSoPlanBatch} from '../lib/so-plan.mjs';
import {sourceChangeFeedSchema,sourceChangeFeedTriggers,projectionWatermarkSchema,captureProjectionWatermarks,synchronizeProjectionPage,projectionFeedCaughtUp} from '../lib/so-projection-feed.mjs';
import {processSoJob} from '../lib/so-coordinator.mjs';
import {acceptSo,stageSoStep,cancelSo,readSoJob,dispatchSoOutbox,soJobProgress} from '../lib/so-intake.mjs';

const directory=[{code:'A',name:'Outlet A',active:true},{code:'B',name:'Outlet B',active:true}];
const headers=['BRANCH','LOCATION','PRODUCT','PRODUCT CODE','CATEGORY','SUBCATEGORY','UNIT','OPNAME STOCK'];
function cells(data=[['Outlet A','metadata','Item','I','Food','','PCS','0']]) {
  return Object.fromEntries([headers,...data].flatMap((row,i)=>row.map((v,j)=>[String.fromCharCode(65+j)+(i+1),v])));
}
function workbook(data=cells()) {
  const rows=new Map();for(const [ref,value] of Object.entries(data)) {
    const n=ref.match(/\d+/)[0];if(!rows.has(n))rows.set(n,[]);
    rows.get(n).push(`<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`);
  }
  return Buffer.from(zipSync({'xl/worksheets/sheet1.xml':strToU8(`<worksheet><sheetData>${[...rows].map(([n,cs])=>`<row r="${n}">${cs.join('')}</row>`).join('')}</sheetData></worksheet>`)})).toString('base64');
}
function environment() {
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../../migrations/0007_so_upload_v2.sql',import.meta.url),'utf8'));
  const db={prepare(query){const statement=(args=[])=>({bind(...bound){return statement(bound);},all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:sql.prepare(query).run(...args)}),execute:()=>sql.prepare(query).all(...args)});return statement();},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>({results:s.execute()}));sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const objects=new Map(),messages=[];
  return {sql,objects,messages,OPERATIONS_DB:db,FILES:{put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null},SO_UPLOAD_QUEUE:{send:async v=>messages.push(v)}};
}
const claims={owner:'HQ',outlet:'BIHQ',locations:['Store']};
const payload=()=>({fileName:'SO.xlsx',base64:workbook(),eventDate:'2026-10-31',location:'Store'});

test('real XLSX, branch mapping, zero counts, independent item identity per outlet',()=>{
  const report=parseSoWorkbook(workbook(),'SO.xlsx',directory);assert.equal(report.rows[0].actualQty,0);assert.equal(report.rows[0].outlet,'A');
  const two=parseSoCells(cells([['A','','One','I','','','PCS',2],['B','','One','I','','','PCS',3]]),directory);assert.equal(two.rows.length,2);
});
test('invalid quantities, duplicate products, inactive outlet, invalid date',()=>{
  for(const value of [-1,'garbage'])assert.throws(()=>parseSoCells(cells([['A','','One','I','','','PCS',value]]),directory),/OPNAME STOCK/);
  assert.throws(()=>parseSoCells(cells([['A','','One','I','','','PCS',0],['A','','One','I','','','PCS',2]]),directory),/duplikat/);
  assert.throws(()=>parseSoCells(cells(),directory.map(r=>({...r,active:false}))),/aktif/);
  for(const date of ['2026-02-30','2026-11-10','not-date'])assert.throws(()=>validateSoDate(date,'2026-11-09'));
});
test('streamed XLSX reader rejects entity declarations and broken shared strings',()=>{
  for(const xml of ['<!DOCTYPE worksheet [<!ENTITY x "bad">]><worksheet/>','<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>99</v></c></row></sheetData></worksheet>']) {
    const input=Buffer.from(zipSync({'xl/worksheets/sheet1.xml':strToU8(xml)})).toString('base64');
    assert.throws(()=>parseSoWorkbook(input,'SO.xlsx',directory),/XML|Referensi teks/);
  }
});
test('worksheet selection follows workbook relationships rather than numeric sheet names',()=>{
  const values=cells();const body=[1,2].map(n=>`<row r="${n}">${Object.entries(values).filter(([key])=>Number(key.match(/\d+/)[0])===n).map(([key,v])=>`<c r="${key}" t="inlineStr"><is><t>${v}</t></is></c>`).join('')}</row>`).join('');
  const input=Buffer.from(zipSync({
    'xl/workbook.xml':strToU8('<workbook><sheets><sheet name="SO" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml':strToU8('<worksheet><sheetData/></worksheet>'),
    'xl/worksheets/sheet2.xml':strToU8('<worksheet><sheetData>'+body+'</sheetData></worksheet>')
  })).toString('base64');
  assert.equal(parseSoWorkbook(input,'SO.xlsx',directory).rows.length,1);
});
test('durable acceptance, duplicate request, lost wake-up, source survives',async()=>{
  const env=environment();env.SO_UPLOAD_QUEUE.send=async()=>{throw Error('offline');};
  const a=await acceptSo(env,claims,payload(),'2026-11-09'),b=await acceptSo(env,claims,payload(),'2026-11-09');assert.equal(a.job_id,b.job_id);
  assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM so_upload_jobs').get().n,1);
  assert.ok(env.objects.has(a.source_key));env.SO_UPLOAD_QUEUE.send=async v=>env.messages.push(v);
  assert.equal(await dispatchSoOutbox(env),1);assert.equal(env.messages[0].id,a.job_id);
  await assert.rejects(()=>acceptSo(env,{...claims,outlet:'A'},payload(),'2026-11-09'),/BIHQ/);
});
test('Queue outage is isolated per SO job and failed wake-ups remain recoverable',async()=>{
  const env=environment();
  const a=await acceptSo(env,claims,payload(),'2026-11-09');
  const other=payload();other.base64=workbook(cells([['A','','Other','OTHER','','','PCS',2]]));
  const b=await acceptSo(env,claims,other,'2026-11-09');
  const attempted=[];let failedId;
  env.SO_UPLOAD_QUEUE.send=async message=>{
    attempted.push(message.id);
    if(!failedId){failedId=message.id;throw Error('Queue temporarily unavailable');}
    env.messages.push(message);
  };
  assert.equal(await dispatchSoOutbox(env),1);
  assert.equal(attempted.length,2);
  assert.deepEqual(new Set(attempted),new Set([a.job_id,b.job_id]));
  const pending=env.sql.prepare('SELECT job_id,available_at FROM so_upload_outbox').all();
  assert.equal(pending.length,2);
  assert.ok(pending.every(row=>row.available_at>Date.now()));
  // An unsuccessfully delivered job can be retried without accepting another file.
  env.sql.prepare('UPDATE so_upload_outbox SET available_at=0 WHERE job_id=?').run(failedId);
  env.SO_UPLOAD_QUEUE.send=async message=>env.messages.push(message);
  assert.equal(await dispatchSoOutbox(env),1);
  assert.equal(env.messages.at(-1).id,failedId);
});

test('parse once across chunks and repeated delivery, progress never claims stock saved',async()=>{
  const env=environment(),j=await acceptSo(env,claims,payload(),'2026-11-09');let calls=0;
  const parse=()=>{calls++;return {rows:Array.from({length:1201},(_,i)=>({sourceRow:i+2,outlet:'A',code:'I'+i,actualQty:0,unit:'PCS'}))};};
  for(let i=0;i<4;i++)await stageSoStep(env,j.job_id,directory,{parse});
  assert.equal(calls,1);const done=await readSoJob(env.OPERATIONS_DB,j.job_id);assert.equal(done.status,'READY');assert.equal(done.staged,1201);
  assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM so_upload_rows').get().n,1201);assert.equal(soJobProgress(done).stockCommitted,false);
});
test('cancellation fences a consumer already reading its source',async()=>{
  const env=environment(),j=await acceptSo(env,claims,payload(),'2026-11-09');let cancelled=false;
  const original=env.FILES.put;env.FILES.put=async(k,v)=>{await original(k,v);if(k.includes('/parsed/')){await cancelSo(env.OPERATIONS_DB,j.job_id,'HQ');cancelled=true;}};
  const result=await stageSoStep(env,j.job_id,directory);assert.ok(cancelled);assert.equal(result.status,'CANCELLED');assert.equal(result.staged,0);
  assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM so_upload_rows').get().n,0);
  assert.equal((await acceptSo(env,claims,payload(),'2026-11-09')).status,'CANCELLED');
});
test('a lease cannot commit after expiry, and duplicate deliveries cannot both stage',async()=>{
  const env=environment(),j=await acceptSo(env,claims,payload(),'2026-11-09');let time=1000,second;
  const original=env.FILES.put;env.FILES.put=async(k,v)=>{await original(k,v);if(k.includes('/parsed/')){second=await stageSoStep(env,j.job_id,directory,{clock:()=>time});time=122000;}};
  await stageSoStep(env,j.job_id,directory,{clock:()=>time});assert.equal(second.staged,0);assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM so_upload_rows').get().n,0);
  const done=await stageSoStep(env,j.job_id,directory,{clock:()=>time});assert.equal(done.status,'READY');
});
test('invalid workbook is terminal action required, no stock or partial staging',async()=>{
  const env=environment(),p=payload();p.base64=workbook(cells([['A','','One','I','','','PCS',-4]]));const j=await acceptSo(env,claims,p,'2026-11-09');
  const result=await stageSoStep(env,j.job_id,directory);assert.equal(result.status,'ACTION_REQUIRED');assert.equal(JSON.parse(result.error_json).issues[0].row,2);
  assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM so_upload_rows').get().n,0);assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM so_upload_outbox').get().n,0);
});

const movement=(id,extra={})=>({record_id:id,logical_id:id,version:1,record_type:'MOVEMENT',outlet_code:'A',location_code:'Store',item_code:'I',event_date:'2026-10-01',created_at:'2026-11-01T00:00:00Z',direction:'IN',quantity:5,movement_type:'Goods Receipt',...extra});
test('balance parity with GAS: dated checkpoint, zero, audit, and later transactions',()=>{
  const source=readFileSync(new URL('../../../gas/Code.gs',import.meta.url),'utf8'),ctx={console};vm.createContext(ctx);vm.runInContext(source,ctx);
  const fixtures=[
    [movement('a'),movement('b',{event_date:'2026-11-01',quantity:999})],
    [movement('a'),movement('s',{movement_type:'Stock Opname',event_date:'2026-10-15',info:'Hasil Stock Opname tanggal 2026-10-15 → Balance 0'}),movement('b',{event_date:'2026-10-16',quantity:2})],
    [movement('s',{movement_type:'Stock Opname',source_hash:'hash',source_row:2,info:'Balance 77'}),movement('audit',{record_type:'OPNAME_DETAIL',source_hash:'hash',source_row:2,info:JSON.stringify({actualQty:3,eventDate:'2026-10-15'})}),movement('b',{direction:'OUT',quantity:1,event_date:'2026-10-20'})]
  ];
  for(const rows of fixtures){const legacy=ctx.stockCheckpointBalanceUntil_(ctx.applyStockHistoryAuditRows_(rows.map(r=>ctx.mapStockHistoryQueryRow_({...r,qty:r.quantity}))),'2026-11-01');assert.equal(soBalances(rows,{outlet:'A',location:'Store',eventDate:'2026-10-31',codes:['I']}).I,legacy);}
});
test('global version resolution handles another shard moving item outside scope',()=>{
  const old=movement('v1',{logical_id:'shared'}),correction=movement('v2',{logical_id:'shared',version:2,outlet_code:'B'});
  assert.equal(soBalances([old,correction,old],{outlet:'A',location:'Store',eventDate:'2026-10-31',codes:['I']}).I,0);
});

test('SQL projection refuses partial/stale data and matches the checkpoint reducer',async()=>{
  const env=environment(),db=env.OPERATIONS_DB;env.sql.exec(projectionSchema);
  await startProjection(db,'p','revision-1',1);
  assert.equal(await sealProjection(db,'p','revision-1'),false);
  const scope={outlet:'A',location:'Store',eventDate:'2026-10-31',codes:['I','ZERO','ABSENT']};
  await assert.rejects(()=>projectedSoBalances(db,'p',scope),/belum lengkap/);
  const rows=[movement('a'),movement('s',{movement_type:'Stock Opname',event_date:'2026-10-15',info:'Balance 0'}),movement('b',{event_date:'2026-10-16',quantity:2}),movement('future',{event_date:'2026-11-01',quantity:1000}),movement('zero',{item_code:'ZERO',quantity:0}),movement('old',{logical_id:'moved',quantity:1000}),movement('new',{logical_id:'moved',version:2,outlet_code:'B'})];
  await db.batch([projectionPageStatement(db,'p',rows)]);
  await db.batch([projectionPageStatement(db,'p',rows.slice(0,3))]);
  env.sql.exec("UPDATE so_projection_runs SET source_index=1 WHERE projection_id='p'");
  assert.equal(await sealProjection(db,'p','revision-1'),true);
  assert.deepEqual(await projectedSoBalances(db,'p',scope),soBalances(rows,scope));
  assert.equal(env.sql.prepare("SELECT COUNT(*) n FROM so_projection_rows WHERE projection_id='p'").get().n,6);
  await startProjection(db,'stale','r1',1);env.sql.exec("UPDATE so_projection_runs SET source_index=1 WHERE projection_id='stale'");
  assert.equal(await sealProjection(db,'stale','r2'),false);
  await assert.rejects(()=>projectedSoBalances(db,'stale',scope),/berubah/);
});
test('SQL audit values override legacy text and respect effective SO dates',async()=>{
  const env=environment(),db=env.OPERATIONS_DB;env.sql.exec(projectionSchema);await startProjection(db,'p','r',1);
  const rows=[movement('s',{movement_type:'Stock Opname',source_hash:'hash',source_row:10,info:'Balance 999'}),movement('audit',{record_type:'OPNAME_DETAIL',source_hash:'hash',source_row:10,info:JSON.stringify({actualQty:0,eventDate:'2026-10-15'})}),movement('before',{event_date:'2026-10-10',quantity:123}),movement('after',{event_date:'2026-10-16',quantity:2})];
  await db.batch([projectionPageStatement(db,'p',rows)]);env.sql.exec("UPDATE so_projection_runs SET source_index=1");await sealProjection(db,'p','r');
  const scope={outlet:'A',location:'Store',eventDate:'2026-10-31',codes:['I']};assert.deepEqual(await projectedSoBalances(db,'p',scope),{I:2});
});
test('detects newer SO checkpoint by audit-effective date, including zero count',async()=>{
  const env=environment(),db=env.OPERATIONS_DB;env.sql.exec(projectionSchema);
  await startProjection(db,'p','revision',1);
  const rows=[
    movement('earlier',{movement_type:'Stock Opname',item_code:'EARLY',event_date:'2026-10-10',info:'Balance 5'}),
    movement('later',{movement_type:'Stock Opname',item_code:'LATER',source_hash:'sh',source_row:17,event_date:'2026-10-10',info:'Balance 99'}),
    movement('audit-later',{record_type:'OPNAME_DETAIL',item_code:'LATER',source_hash:'sh',source_row:17,info:JSON.stringify({actualQty:0,eventDate:'2026-11-02'})}),
    movement('gr',{item_code:'NORMAL',movement_type:'Goods Receipt',event_date:'2026-11-05'})
  ];
  await db.batch([projectionPageStatement(db,'p',rows)]);
  env.sql.exec("UPDATE so_projection_runs SET source_index=1 WHERE projection_id='p'");
  await sealProjection(db,'p','revision');
  const found=await projectedSoLaterCheckpoints(db,'p',{outlet:'A',location:'Store',eventDate:'2026-10-31',codes:['EARLY','LATER','NORMAL']});
  assert.deepEqual(found,{LATER:true});
});

test('bounded keyset copy resumes without skipping rows or losing cross-shard corrections',async()=>{
  const env=environment(),db=env.OPERATIONS_DB;env.sql.exec(projectionSchema);
  const sets=[[movement('a'),movement('b'),movement('c')],[movement('d',{logical_id:'b',version:2,outlet_code:'B'})]];
  const sources=sets.map(data=>({table:'stock_movements_history',database:{prepare:()=>({bind:(cursor,limit)=>({all:async()=>({results:data.filter(r=>r.record_id>cursor).slice(0,limit)})})})}}));
  await startProjection(db,'p','r',2);let run;
  for(let i=0;i<3;i++)run=await copyProjectionPage(db,'p',sources,{limit:2});
  assert.equal(run.source_index,2);assert.equal(run.scanned,4);assert.equal(await sealProjection(db,'p','r'),true);
  assert.deepEqual(await projectedSoBalances(db,'p',{outlet:'A',location:'Store',eventDate:'2026-10-31',codes:['I']}),{I:10});
});

async function commitEnvironment() {
  const env=environment();
  env.sql.exec(readFileSync(new URL('../../migrations/0000_container_metadata.sql',import.meta.url),'utf8'));
  env.sql.exec(readFileSync(new URL('../../migrations/0001_operations.sql',import.meta.url),'utf8'));
  env.sql.exec(readFileSync(new URL('../../migrations/0004_snapshot_operations.sql',import.meta.url),'utf8'));
  env.sql.exec(commitSchema);
  const job=await acceptSo(env,claims,payload(),'2026-11-09');
  env.sql.prepare("UPDATE so_upload_jobs SET status='PROCESSING',lease_token='lease',lease_until=9999999999999 WHERE job_id=?").run(job.job_id);
  const planned=await buildSoPlanRows(job,[{sourceRow:2,outlet:'A',code:'I',name:'Item',unit:'PCS',actualQty:3}],{I:{item_name:'Item',default_unit:'PCS',category:'Food'}},{I:5});
  env.sql.prepare("INSERT INTO stock_balances(outlet_code,location_code,item_code,item_name,current_qty,unit,updated_at) VALUES('A','Store','I','Item',9,'PCS','2026-11-09')").run();
  return {env,job,planned};
}
test('SO plan blocks mismatched units and creates owner-independent deterministic IDs',async()=>{
  const job={source_hash:'hash',event_date:'2026-10-31',location_code:'Store',created_at:'2026-11-09T00:00:00Z',owner_nik:'one'},row={sourceRow:2,outlet:'A',code:'I',name:'Item',unit:'PCS',actualQty:0};
  assert.equal((await buildSoPlanRows(job,[row],{I:{default_unit:'KG'}},{I:5})).issues.length,1);
  const first=await buildSoPlanRows(job,[row],{},{I:5}),second=await buildSoPlanRows({...job,owner_nik:'two'},[row],{},{I:5});
  assert.equal(first.rows[0].movement.record_id,second.rows[0].movement.record_id);assert.equal(first.rows[0].delta,-5);
  assert.equal(JSON.parse(first.rows[0].audit.info).actualQty,0);
});
test('atomic batch applies delta once and a repeated delivery returns its receipt',async()=>{
  const {env,job,planned}=await commitEnvironment(),opts={batchId:'batch',expectedRevision:0,leaseToken:'lease'};
  assert.equal((await commitSoPlanBatch(env.OPERATIONS_DB,job,planned.rows,opts)).replayed,false);
  assert.equal((await commitSoPlanBatch(env.OPERATIONS_DB,job,planned.rows,opts)).replayed,true);
  assert.equal(env.sql.prepare('SELECT current_qty FROM stock_balances').get().current_qty,7);
  assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM stock_movements').get().n,2);
  assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM so_commit_batches').get().n,1);
  await assert.rejects(()=>commitSoPlanBatch(env.OPERATIONS_DB,job,[{...planned.rows[0],delta:4}],opts),/rencana berbeda/);
});
test('backdated SO writes the historical audit without changing stock after a newer SO',async()=>{
  const {env,job}=await commitEnvironment();
  const rows=[{sourceRow:2,outlet:'A',code:'I',name:'Item',unit:'PCS',actualQty:3}];
  const plan=await buildSoPlanRows(job,rows,{I:{item_name:'Item',default_unit:'PCS',category:'Food'}},{I:5},{I:true});
  assert.equal(plan.rows[0].delta,-2);
  assert.equal(plan.rows[0].balanceDelta,0);
  await commitSoPlanBatch(env.OPERATIONS_DB,job,plan.rows,{batchId:'backdated',expectedRevision:0,leaseToken:'lease'});
  assert.equal(env.sql.prepare('SELECT current_qty FROM stock_balances').get().current_qty,9);
  const movement=env.sql.prepare("SELECT quantity,direction FROM stock_movements WHERE record_type='MOVEMENT'").get();
  assert.equal(movement.quantity,2);
  assert.equal(movement.direction,'OUT');
});

test('SO batch receipt, stock movements and resume cursor commit atomically',async()=>{
  const {env,job,planned}=await commitEnvironment();
  env.sql.exec(readFileSync(new URL('../../migrations/0014_so_v2_workflow.sql',import.meta.url),'utf8'));
  env.sql.prepare('UPDATE so_upload_jobs SET total=1 WHERE job_id=?').run(job.job_id);
  const opts={batchId:'cursor-batch',expectedRevision:0,leaseToken:'lease',progress:{from:0,to:2,count:1}};
  const first=await commitSoPlanBatch(env.OPERATIONS_DB,job,planned.rows,opts);
  assert.equal(first.replayed,false);
  let state=env.sql.prepare('SELECT committed,commit_cursor FROM so_upload_jobs WHERE job_id=?').get(job.job_id);
  assert.deepEqual(state,{committed:1,commit_cursor:2});
  const again=await commitSoPlanBatch(env.OPERATIONS_DB,job,planned.rows,opts);
  assert.equal(again.replayed,true);
  state=env.sql.prepare('SELECT committed,commit_cursor FROM so_upload_jobs WHERE job_id=?').get(job.job_id);
  assert.deepEqual(state,{committed:1,commit_cursor:2});
  assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM so_commit_batches').get().n,1);
});

test('stale revision or cancelled consumer cannot write stock',async()=>{
  const {env,job,planned}=await commitEnvironment();
  const opts={batchId:'batch',expectedRevision:10,leaseToken:'lease'};
  await assert.rejects(()=>commitSoPlanBatch(env.OPERATIONS_DB,job,planned.rows,opts),/CHECK constraint/);
  env.sql.prepare("UPDATE so_upload_jobs SET lease_token=NULL WHERE job_id=?").run(job.job_id);
  await assert.rejects(()=>commitSoPlanBatch(env.OPERATIONS_DB,job,planned.rows,{...opts,expectedRevision:0}),/CHECK constraint/);
  assert.equal(env.sql.prepare('SELECT current_qty FROM stock_balances').get().current_qty,9);assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM stock_movements').get().n,0);
});
test('ledger failure rolls back balance, audit rows and durable batch receipt',async()=>{
  const {env,job,planned}=await commitEnvironment();
  env.sql.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON stock_movements WHEN NEW.record_type='MOVEMENT' BEGIN SELECT RAISE(ABORT,'injected disk error'); END");
  await assert.rejects(()=>commitSoPlanBatch(env.OPERATIONS_DB,job,planned.rows,{batchId:'batch',expectedRevision:0,leaseToken:'lease'}),/injected disk error/);
  assert.equal(env.sql.prepare('SELECT current_qty FROM stock_balances').get().current_qty,9);
  assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM stock_movements').get().n,0);
  assert.equal(env.sql.prepare('SELECT COUNT(*) n FROM so_commit_batches').get().n,0);
});

test('incremental projection journal repairs newer corrections and restores deleted fallback',async()=>{
 const env=environment(),db=env.OPERATIONS_DB;
 env.sql.exec(readFileSync(new URL('../../migrations/0000_container_metadata.sql',import.meta.url),'utf8'));
 env.sql.exec(readFileSync(new URL('../../migrations/0001_operations.sql',import.meta.url),'utf8'));
 env.sql.exec(projectionSchema+sourceChangeFeedSchema+projectionWatermarkSchema+sourceChangeFeedTriggers('stock_movements'));
 const sources=[{key:'ops',table:'stock_movements',database:db}];
 function insert(row){
  env.sql.prepare(`INSERT INTO stock_movements(record_id,logical_id,version,record_type,outlet_code,location_code,item_code,unit,direction,quantity,movement_type,event_date,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
   .run(row.record_id,row.logical_id,row.version,row.record_type,row.outlet_code,row.location_code,row.item_code,'PCS',row.direction,row.quantity,row.movement_type,row.event_date,'TEST',row.created_at);
 }
 const old=movement('first',{logical_id:'shared',version:1}),newer=movement('second',{logical_id:'shared',version:2,outlet_code:'B',quantity:7,created_at:'2026-11-02T00:00:00Z'});
 insert(old);
 await startProjection(db,'p','snapshot',1);
 await captureProjectionWatermarks(db,'p',sources);
 await db.batch([projectionPageStatement(db,'p',[old])]);
 env.sql.exec("UPDATE so_projection_runs SET source_index=1 WHERE projection_id='p'");
 await sealProjection(db,'p','snapshot');
 assert.equal(await projectionFeedCaughtUp(db,'p',sources),true);
 insert(newer);
 assert.equal(await projectionFeedCaughtUp(db,'p',sources),false);
 assert.equal((await synchronizeProjectionPage(db,'p',sources)).changed,1);
 assert.equal(await projectionFeedCaughtUp(db,'p',sources),true);
 assert.deepEqual(await projectedSoBalances(db,'p',{outlet:'A',location:'Store',eventDate:'2026-10-31',codes:['I']}),{I:0});
 assert.deepEqual(await projectedSoBalances(db,'p',{outlet:'B',location:'Store',eventDate:'2026-10-31',codes:['I']}),{I:7});
 env.sql.prepare('DELETE FROM stock_movements WHERE record_id=?').run('second');
 assert.equal((await synchronizeProjectionPage(db,'p',sources)).changed,1);
 assert.deepEqual(await projectedSoBalances(db,'p',{outlet:'A',location:'Store',eventDate:'2026-10-31',codes:['I']}),{I:5});
 assert.equal(await projectionFeedCaughtUp(db,'p',sources),true);
 assert.equal((await synchronizeProjectionPage(db,'p',sources)).changed,0);
});

test('SO coordinator stages, validates, writes exactly once and reconciles a complete job',async()=>{
 const env=environment();
 for(const file of ['0000_container_metadata.sql','0001_operations.sql','0001_master.sql','0004_snapshot_operations.sql','0007_so_upload_v2.sql','0013_so_v2_operations.sql','0014_so_v2_workflow.sql']){
  env.sql.exec(readFileSync(new URL('../../migrations/'+file,import.meta.url),'utf8'));
 }
 env.MASTER_DB=env.OPERATIONS_DB;
 env.sql.prepare("INSERT INTO outlets(outlet_code,outlet_name,active) VALUES('A','Outlet A',1)").run();
 env.sql.prepare("INSERT INTO stock_items(item_code,item_name,default_unit,category,active) VALUES('I','Item','PCS','Food',1)").run();
 env.sql.prepare("INSERT INTO stock_balances(outlet_code,location_code,item_code,item_name,current_qty,unit,updated_at) VALUES('A','Store','I','Item',5,'PCS','2026-11-09')").run();
 env.sql.prepare("INSERT INTO stock_movements(record_id,logical_id,version,record_type,outlet_code,location_code,item_code,unit,direction,quantity,movement_type,event_date,created_by,created_at) VALUES('initial','initial',1,'MOVEMENT','A','Store','I','PCS','IN',5,'Goods Receipt','2026-10-01','TEST','2026-10-01T00:00:00Z')").run();
 const job=await acceptSo(env,claims,payload(),'2026-11-09');
 let finished;
 for(let n=0;n<20;n++){
  finished=await processSoJob(env,job.job_id);
  if(['COMPLETE','ACTION_REQUIRED','CANCELLED'].includes(finished?.status))break;
 }
 assert.equal(finished?.status,'COMPLETE',JSON.stringify(finished));
 assert.equal(finished.stockCommitted,true);
 assert.equal(finished.committed,1);
 assert.equal(env.sql.prepare("SELECT current_qty AS qty FROM stock_balances WHERE outlet_code='A' AND item_code='I'").get().qty,0);
 assert.equal(env.sql.prepare("SELECT COUNT(*) n FROM stock_movements WHERE movement_type='Stock Opname'").get().n,1);
 assert.equal(env.sql.prepare("SELECT COUNT(*) n FROM stock_movements WHERE record_type='OPNAME_DETAIL'").get().n,1);
 assert.equal(env.sql.prepare("SELECT COUNT(*) n FROM so_commit_batches").get().n,1);
 const repeated=await processSoJob(env,job.job_id);
 assert.equal(repeated.status,'COMPLETE');
 assert.equal(env.sql.prepare("SELECT COUNT(*) n FROM stock_movements WHERE record_type='OPNAME_DETAIL'").get().n,1);
});
