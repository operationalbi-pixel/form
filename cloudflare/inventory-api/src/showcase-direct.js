import {remainingLots,balanceAt,conversionFactor} from './showcase-inventory.js';
const EPS=1e-7,MAX_ROWS=50000;
const qtyFields=['inQty','soldQty','wasteQty'],totalFields=['inTotal','soldTotal','wasteTotal'];
const qtyFlags=['hasInInput','hasSoldInput','hasWasteInput'],totalFlags=['hasInTotal','hasSoldTotal','hasWasteTotal'];
const round=value=>Math.round(Number(value)*1e6)/1e6;
const today=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,10);
class Failure extends Error {constructor(status,code,message,retryable=false){super(message);Object.assign(this,{status,code,retryable});}}
const fail=(status,code,message,retryable=false)=>{throw new Failure(status,code,message,retryable);};
function json(value,status=200,headers={}){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});}
function bytes64(value){if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('encoding');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));}
async function hex(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
async function claimsFor(request,env){
  const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  try{
    const parts=token.split('.');if(parts.length!==2||token.length>6000||!env.API_KEY)throw Error('token');
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.API_KEY),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('HMAC',key,bytes64(parts[1]),new TextEncoder().encode('showcase-direct-v1.'+parts[0])))throw Error('signature');
    const c=JSON.parse(new TextDecoder().decode(bytes64(parts[0]))),now=Math.floor(Date.now()/1000);
    if(c.aud!=='showcase-direct-v1'||!Number.isInteger(c.exp)||!Number.isInteger(c.iat)||c.exp<=now||c.iat>now+30||c.exp-c.iat>300||!c.owner||!c.outlet||!c.item?.code||!c.item?.name)throw Error('scope');
    return c;
  }catch{fail(401,'SESSION_EXPIRED','Sesi penyimpanan perlu diperbarui.');}
}
function validateDate(value){const parsed=Date.parse(String(value)+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value))||!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==value||value>today())fail(422,'INVALID_DATE','Tanggal Showcase tidak valid.');return value;}
async function record(database,table,id){const r=await database.prepare('SELECT payload_json FROM application_records WHERE table_name=? AND record_id=?').bind(table,id).all();return r.results?.[0]?JSON.parse(r.results[0].payload_json):null;}
async function scopeState(database,outlet,location,code){
  const r=await database.prepare(`SELECT COALESCE((SELECT current_qty FROM stock_balances WHERE outlet_code=? AND location_code=? AND item_code=?),0) qty,
    COALESCE((SELECT unit FROM stock_balances WHERE outlet_code=? AND location_code=? AND item_code=?),'') unit,
    COUNT(*) count,COALESCE(MAX(rowid),0) watermark FROM stock_movements WHERE outlet_code=? AND location_code=? AND item_code=?`).bind(outlet,location,code,outlet,location,code,outlet,location,code).all();
  return {outlet,location,code,...r.results[0]};
}
async function ledger(env,deps,outlet,location,code,snapshot,from){
  const sources=[{database:env.OPERATIONS_DB,table:'stock_movements'},...deps.historyDatabasesForRange(env,'0000-01-01','9999-12-31').map(e=>({database:e.database,table:'stock_movements_history'}))];
  const results=await Promise.all(sources.map(s=>s.database.prepare(`SELECT * FROM ${s.table} WHERE outlet_code=? AND location_code=? AND item_code=? AND record_type IN ('MOVEMENT','OPNAME_DETAIL')${from?' AND event_date >= ?':''} LIMIT ?`).bind(outlet,location,code,...(from?[from]:[]),MAX_ROWS+1).all()));
  if(results.some(r=>r.results.length>MAX_ROWS))fail(422,'HISTORY_TOO_LARGE','Riwayat item perlu dirapikan sebelum disimpan.');
  const candidates=results.flatMap(r=>r.results),ids=[...new Set(candidates.map(r=>r.logical_id||r.record_id))];
  if(snapshot&&ids.length){const jsonIds=JSON.stringify(ids);if(jsonIds.length>400000)fail(422,'HISTORY_TOO_LARGE','Riwayat item perlu dirapikan sebelum disimpan.');const mark=await env.OPERATIONS_DB.prepare(`SELECT COALESCE(MAX(rowid),0) watermark FROM stock_movements WHERE logical_id IN(SELECT value FROM json_each(?)) OR (COALESCE(logical_id,'')='' AND record_id IN(SELECT value FROM json_each(?)))`).bind(jsonIds,jsonIds).all();snapshot.logicalIds=jsonIds;snapshot.logicalWatermark=Number(mark.results[0].watermark);}
  const resolved=[];
  for(let start=0;start<ids.length;start+=3000){const values=JSON.stringify(ids.slice(start,start+3000));const found=await Promise.all(sources.map(source=>source.database.prepare(`SELECT * FROM ${source.table} WHERE logical_id IN(SELECT value FROM json_each(?)) OR (COALESCE(logical_id,'')='' AND record_id IN(SELECT value FROM json_each(?)))`).bind(values,values).all()));resolved.push(...found.flatMap(r=>r.results));}
  return deps.activeMovements(resolved).filter(r=>r.outlet_code===outlet&&r.location_code===location&&r.item_code===code);
}
function dailyState(rows,date,state){
  const day={total_in:0,total_sold:0,total_waste:0};
  for(const row of rows){if(row.event_date!==date||row.record_type!=='MOVEMENT')continue;const sign=row.direction==='IN'?1:row.direction==='OUT'?-1:0,amount=sign*Number(row.quantity||0);if(row.movement_type==='Transfer In')day.total_in+=amount;if(['Terjual','Sold'].includes(row.movement_type))day.total_sold-=amount;if(row.movement_type==='Waste')day.total_waste-=amount;}
  const balance=date===today()?Number(state.qty):balanceAt(rows,date);
  const dayNet=rows.filter(r=>r.event_date===date&&r.record_type==='MOVEMENT').reduce((sum,r)=>sum+(r.direction==='IN'?1:r.direction==='OUT'?-1:0)*Number(r.quantity||0),0);
  return {...day,balance,previous_balance:balance-dayNet};
}
function takeLots(lots,quantity){let left=quantity;const result=[];for(const lot of lots){const used=Math.min(Math.max(0,Number(lot.qty)),left);if(used>EPS)result.push({...lot,qty:used});left-=used;if(left<=EPS)break;}if(left>EPS)result.push({qty:left,productionDate:'',expiryDate:'',sourceDate:''});return result;}
function makeGuard(database,scopes,receiptId,receipt){
  const conditions=[],values=[];
  for(const s of scopes){
    conditions.push(`ABS(COALESCE((SELECT current_qty FROM stock_balances WHERE outlet_code=? AND location_code=? AND item_code=?),0)-?)<0.00000001`);values.push(s.outlet,s.location,s.code,Number(s.qty));
    conditions.push(`COALESCE((SELECT unit FROM stock_balances WHERE outlet_code=? AND location_code=? AND item_code=?),'')=?`);values.push(s.outlet,s.location,s.code,s.unit);
    conditions.push(`(SELECT COUNT(*) FROM stock_movements WHERE outlet_code=? AND location_code=? AND item_code=?)=?`);values.push(s.outlet,s.location,s.code,Number(s.count));
    if(s.logicalIds){conditions.push(`COALESCE((SELECT MAX(rowid) FROM stock_movements WHERE logical_id IN(SELECT value FROM json_each(?)) OR (COALESCE(logical_id,'')='' AND record_id IN(SELECT value FROM json_each(?)))),0)=?`);values.push(s.logicalIds,s.logicalIds,s.logicalWatermark);}
    conditions.push(`COALESCE((SELECT MAX(rowid) FROM stock_movements WHERE outlet_code=? AND location_code=? AND item_code=?),0)=?`);values.push(s.outlet,s.location,s.code,Number(s.watermark));
  }
  // Previously accepted GAS plans must finish before direct writes can interleave with them.
  conditions.push(`NOT EXISTS(SELECT 1 FROM application_records WHERE table_name='background_upload_jobs' AND outlet_code=? AND json_extract(payload_json,'$.type')='SHOWCASE_LOG' AND json_extract(payload_json,'$.status') IN ('QUEUED','PREPARING','PROCESSING','FAILED'))`);values.push(receipt.outlet);
  return database.prepare(`INSERT INTO application_records(table_name,record_id,outlet_code,payload_json,created_at) VALUES('showcase_direct_receipts',CASE WHEN ${conditions.join(' AND ')} THEN ? ELSE NULL END,?,?,?)`).bind(...values,receiptId,receipt.outlet,JSON.stringify(receipt),new Date().toISOString());
}
async function productFor(env,item){
  const r=await env.MASTER_DB.prepare('SELECT * FROM stock_items WHERE active=1 AND item_name=? COLLATE NOCASE').bind(item.productName).all();
  if(r.results.length!==1)fail(422,'PRODUCT_MAPPING','Product Showcase tidak ditemukan atau ambigu.');
  const product=r.results[0],c=await env.MASTER_DB.prepare('SELECT from_unit,to_unit,factor FROM stock_unit_conversions WHERE item_code=? AND active=1').bind(product.item_code).all();
  const factor=conversionFactor(product.item_code,item.productUnit,product.default_unit,c.results),perMenu=Number(item.productQty)*factor;
  if(!Number.isFinite(perMenu)||perMenu<=0)fail(422,'UNIT_CONVERSION','Konversi unit Product belum tersedia.');
  return {...product,perMenu};
}
async function conflict(env,c,deps,root,date,edit){
  const result=await env.OPERATIONS_DB.prepare(`SELECT payload_json FROM application_records WHERE table_name='showcase_row_edits' AND record_id LIKE ? ORDER BY CAST(json_extract(payload_json,'$.revision') AS INTEGER) DESC LIMIT 1`).bind(root+'-%').all();
  const latest=result.results?.[0]?JSON.parse(result.results[0].payload_json):null;
  const error=new Failure(409,'REVISION_CONFLICT','Perubahan dari tab lain sudah tersimpan. Periksa angka lalu klik Simpan.');
  if(latest){const state=await scopeState(env.OPERATIONS_DB,c.outlet,'Showcase',c.item.code),rows=await ledger(env,deps,c.outlet,'Showcase',c.item.code,undefined,date===today()?date:null);error.confirmed={status:'COMPLETE',result:{rowEdit:{id:edit.id,revision:latest.revision,values:latest.values,touched:latest.touched||{}}},item:{item_code:c.item.code,item_name:c.item.name,...dailyState(rows,date,state)}};}
  throw error;
}
async function saveDirect(request,env,c,deps){
  let payload;try{payload=await deps.readJsonWithLimit(request,24000);}catch{fail(400,'INVALID_PAYLOAD','Data Showcase tidak valid.');}
  const date=validateDate(payload.eventDate),edit=payload.rowEdit,entry=payload.entries?.[0];
  if(payload.outlet!==c.outlet||!entry||payload.entries.length!==1||entry.itemCode!==c.item.code)fail(403,'SCOPE_MISMATCH','Akses baris atau outlet tidak sesuai.');
  if(!edit||!/^[a-zA-Z0-9-]{16,64}$/.test(edit.id)||!Number.isSafeInteger(edit.revision)||edit.revision<1||payload.requestId!=='row-'+edit.id+'-'+edit.revision)fail(422,'INVALID_REVISION','Identitas revisi tidak valid.');
  if(!qtyFlags.some((flag,i)=>entry[flag]||entry[totalFlags[i]]))fail(422,'EMPTY_ROW','Isi setidaknya satu aktivitas Showcase.');
  for(let i=0;i<3;i++)for(const [flag,field]of [[qtyFlags[i],qtyFields[i]],[totalFlags[i],totalFields[i]]])if(entry[flag]&&(!Number.isFinite(Number(entry[field]))||Number(entry[field])<0||Number(entry[field])>1e9))fail(422,'INVALID_QUANTITY','Jumlah harus berupa angka 0 atau lebih.');
  const root=await hex([c.owner,c.outlet,date,c.item.code.toUpperCase(),edit.id].join('|')),checkpointId=root+'-'+edit.revision;
  // Same shape as previously accepted row-edit payloads, so uncertain old acknowledgements remain detectable.
  const sourceHash=await hex(JSON.stringify({outlet:c.outlet,location:'Showcase',eventDate:date,entries:[entry],rowEdit:{id:edit.id,revision:edit.revision}}));
  for(let attempt=0;attempt<3;attempt++){
    const receipt=await record(env.OPERATIONS_DB,'showcase_direct_receipts',checkpointId);
    if(receipt){if(receipt.sourceHash!==sourceHash)return conflict(env,c,deps,root,date,edit);const state=await scopeState(env.OPERATIONS_DB,c.outlet,'Showcase',c.item.code),history=await ledger(env,deps,c.outlet,'Showcase',c.item.code,undefined,date===today()?date:null);return {ok:true,data:{...receipt.response.data,item:{item_code:c.item.code,item_name:c.item.name,...dailyState(history,date,state)}}};}
    const committed=await record(env.OPERATIONS_DB,'showcase_row_edits',checkpointId);
    if(committed){if(committed.sourceHash!==sourceHash)return conflict(env,c,deps,root,date,edit);const state=await scopeState(env.OPERATIONS_DB,c.outlet,'Showcase',c.item.code),history=await ledger(env,deps,c.outlet,'Showcase',c.item.code,undefined,date===today()?date:null);return {ok:true,data:{status:'COMPLETE',requestId:payload.requestId,result:{rowEdit:{...edit,values:committed.values}},item:{item_code:c.item.code,item_name:c.item.name,...dailyState(history,date,state)}}};}
    const previous=edit.revision>1?await record(env.OPERATIONS_DB,'showcase_row_edits',root+'-'+(edit.revision-1)):null;
    if(edit.revision>1&&!previous)fail(409,'REVISION_GAP','Revisi sebelumnya belum terkonfirmasi. Periksa kembali status simpan.');
    const showcase=await scopeState(env.OPERATIONS_DB,c.outlet,'Showcase',c.item.code),showRows=await ledger(env,deps,c.outlet,'Showcase',c.item.code,showcase,date===today()?date:null),day=dailyState(showRows,date,showcase);
    const old=previous?.values||{},values={},touched={...(previous?.touched||{})},delta=[];
    for(let i=0;i<3;i++){
      values[qtyFields[i]]=Number(old[qtyFields[i]]||0);delta[i]=0;if(entry[qtyFlags[i]]||entry[totalFlags[i]])touched[qtyFields[i]]=true;
      if(entry[totalFlags[i]]){delta[i]=round(Number(entry[totalFields[i]])-day[['total_in','total_sold','total_waste'][i]]);values[qtyFields[i]]=0;}
      else if(entry[qtyFlags[i]]){values[qtyFields[i]]=round(Number(entry[qtyFields[i]]));delta[i]=round(values[qtyFields[i]]-Number(old[qtyFields[i]]||0));}
    }
    if(delta.some((value,i)=>day[['total_in','total_sold','total_waste'][i]]+value<-EPS))fail(422,'TOTAL_CHANGED','Total harian sudah berubah. Periksa kembali koreksi pada baris ini.');
    if(day.balance+delta[0]-delta[1]-delta[2]<-EPS)fail(422,'INSUFFICIENT_BALANCE',c.item.name+': Sold dan Waste melebihi Balance.');
    const rows=[],scopes=[showcase],now=new Date().toISOString(),movementPrefix='showcase-'+checkpointId;
    const add=(location,item,direction,quantity,type,info,lot={},transferId=null)=>{const id=movementPrefix+'-'+rows.length;rows.push(deps.normalizeMovement({record_id:id,logical_id:id,version:1,record_type:'MOVEMENT',outlet_code:c.outlet,location_code:location,item_code:item.code,item_name:item.name,category:item.category||'SHOWCASE',unit:item.unit,direction,quantity:round(quantity),movement_type:type,info,event_date:date,production_date:lot.productionDate||null,expiry_date:lot.expiryDate||null,arrival_date:lot.sourceDate||null,transfer_id:transferId,created_by:c.owner,created_at:now,source_file:'SHOWCASE_LOG'}));};
    if(Math.abs(delta[0])>EPS){
      const product=await productFor(env,c.item),p={code:product.item_code,name:product.item_name,category:product.category,unit:product.default_unit};
      const store=await scopeState(env.OPERATIONS_DB,c.outlet,'Store',p.code);scopes.push(store);
      const sourceLots=delta[0]>0?remainingLots(await ledger(env,deps,c.outlet,'Store',p.code,store)):remainingLots(date===today()?await ledger(env,deps,c.outlet,'Showcase',c.item.code,showcase):showRows);
      const requested=delta[0]>0?round(delta[0]*product.perMenu):Math.abs(delta[0]);if(!Number.isFinite(requested))fail(422,'INVALID_QUANTITY','Jumlah konversi Product terlalu besar.');const lots=takeLots(sourceLots,requested);let assigned=0;
      lots.forEach((lot,index)=>{
        const transfer=movementPrefix+'-transfer-'+index;
        if(delta[0]>0){const menuQty=index===lots.length-1?round(delta[0]-assigned):Math.min(round(delta[0]-assigned),round(lot.qty/product.perMenu));assigned+=menuQty;
          add('Store',p,'OUT',lot.qty,'Transfer Out','Transfer To Showcase untuk Produk '+c.item.name,lot,transfer);
          if(menuQty>EPS)add('Showcase',c.item,'IN',menuQty,'Transfer In','Transfer From Store · Product '+p.name,lot,transfer);
        }else{add('Showcase',c.item,'OUT',lot.qty,'Transfer In','Koreksi Total In · Transfer To Store',lot,transfer);add('Store',p,'IN',round(lot.qty*product.perMenu),'Transfer Out','Koreksi Total In Showcase · Transfer From Showcase',lot,transfer);}
      });
    }
    for(let i=1;i<3;i++)if(Math.abs(delta[i])>EPS)add('Showcase',c.item,delta[i]>0?'OUT':'IN',Math.abs(delta[i]),i===1?'Terjual':'Waste','Koreksi Input Showcase Log');
    for(let i=0;i<3;i++)if(entry[qtyFlags[i]]||entry[totalFlags[i]]){const id=movementPrefix+'-log-'+i;rows.push(deps.normalizeMovement({record_id:id,logical_id:id,record_type:'LOG',outlet_code:c.outlet,location_code:'Showcase',item_code:'__LOG__',item_name:'Showcase Log '+['In','Sold','Waste'][i],unit:'NONE',quantity:0,movement_type:'Showcase Log '+['In','Sold','Waste'][i],event_date:date,created_by:c.owner,created_at:now,source_file:'SHOWCASE_LOG'}));}
    if(rows.length>180)fail(422,'TOO_MANY_LOTS','Terlalu banyak lot untuk satu baris. Perlu penataan lot sebelum disimpan.');
    const updated={item_code:c.item.code,item_name:c.item.name,previous_balance:day.previous_balance,balance:round(day.balance+delta[0]-delta[1]-delta[2]),total_in:round(day.total_in+delta[0]),total_sold:round(day.total_sold+delta[1]),total_waste:round(day.total_waste+delta[2])};
    const response={ok:true,data:{status:'COMPLETE',requestId:payload.requestId,eventDate:date,outlet:c.outlet,result:{saved:true,rowEdit:{...edit,values,touched}},item:updated}};
    const receiptValue={ownerNik:c.owner,outlet:c.outlet,eventDate:date,sourceHash,response};
    const statements=[makeGuard(env.OPERATIONS_DB,scopes,checkpointId,receiptValue),...rows.map(row=>deps.movementInsertStatement(env.OPERATIONS_DB,row))];
    const deltas=new Map();for(const row of rows){if(row.record_type!=='MOVEMENT')continue;const k=row.location_code+'|'+row.item_code,v=deltas.get(k)||{row,quantity:0};v.quantity+=(row.direction==='IN'?1:-1)*row.quantity;deltas.set(k,v);}
    for(const {row,quantity}of deltas.values())if(Math.abs(quantity)>EPS)statements.push(env.OPERATIONS_DB.prepare(`INSERT INTO stock_balances(outlet_code,location_code,item_code,item_name,current_qty,unit,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(outlet_code,location_code,item_code) DO UPDATE SET current_qty=stock_balances.current_qty+excluded.current_qty,item_name=excluded.item_name,unit=excluded.unit,updated_at=excluded.updated_at`).bind(row.outlet_code,row.location_code,row.item_code,row.item_name,round(quantity),row.unit,now));
    const checkpoint={recordId:checkpointId,id:edit.id,revision:edit.revision,itemCode:c.item.code,ownerNik:c.owner,outlet:c.outlet,eventDate:date,values,touched,sourceHash};
    statements.push(env.OPERATIONS_DB.prepare(`INSERT INTO application_records(table_name,record_id,outlet_code,payload_json,created_at) VALUES('showcase_row_edits',?,?,?,?)`).bind(checkpointId,c.outlet,JSON.stringify(checkpoint),now));
    try{await env.OPERATIONS_DB.batch(statements);return response;}
    catch(error){
      const saved=await record(env.OPERATIONS_DB,'showcase_direct_receipts',checkpointId);
      if(saved){if(saved.sourceHash!==sourceHash)return conflict(env,c,deps,root,date,edit);return saved.response;}
      if(!/NOT NULL constraint failed|UNIQUE constraint failed/i.test(String(error.message||error)))throw error;
      const active=await env.OPERATIONS_DB.prepare(`SELECT COUNT(*) n FROM application_records WHERE table_name='background_upload_jobs' AND outlet_code=? AND json_extract(payload_json,'$.type')='SHOWCASE_LOG' AND json_extract(payload_json,'$.status') IN ('QUEUED','PREPARING','PROCESSING','FAILED')`).bind(c.outlet).all();
      if(Number(active.results[0]?.n)>0)fail(409,'LEGACY_WRITE_ACTIVE','Permintaan lama masih perlu diselesaikan. Input baru belum ditulis.',true);
      if(attempt===2)fail(409,'WRITE_CONFLICT','Stok berubah bersamaan. Coba kirim kembali.',true);
    }
  }
}
export async function handleShowcaseDirect(request,env,requestId,deps){
  const origin=request.headers.get('origin')||'',allowed=String(env.SHOWCASE_ALLOWED_ORIGINS||'https://operationalbi-pixel.github.io').split(',').map(v=>v.trim());
  if(!allowed.includes(origin))return json({ok:false,error:{code:'ORIGIN_FORBIDDEN',message:'Asal aplikasi tidak diizinkan.'}},403);
  const cors={'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Authorization, Content-Type','access-control-max-age':'300'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
    if(request.method!=='POST')fail(405,'METHOD_NOT_ALLOWED','Metode tidak diizinkan.');
    const c=await claimsFor(request,env);const session=env.OPERATIONS_DB.withSession?.('first-primary')||env.OPERATIONS_DB;env={...env,OPERATIONS_DB:session};
    await deps.ensureApplicationRecords(env);
    const result=await saveDirect(request,env,c,deps);return json({...result,requestId},200,cors);
  }catch(error){if(error instanceof Failure)return json({ok:false,error:{code:error.code,message:error.message,retryable:error.retryable},confirmed:error.confirmed,requestId},error.status,cors);console.error(JSON.stringify({event:'showcase_direct_failed',requestId,message:String(error.message||error)}));return json({ok:false,error:{code:'SAVE_UNCONFIRMED',message:'Penyimpanan belum terkonfirmasi. Coba kembali dengan permintaan yang sama.',retryable:true},requestId},503,cors);}
}
