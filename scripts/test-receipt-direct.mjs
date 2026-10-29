import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import worker from '../cloudflare/inventory-api/src/index.js';
function database(paths){const db=new DatabaseSync(':memory:');for(const p of paths)db.exec(fs.readFileSync(p,'utf8'));let lose=false;return{db,lose(){lose=true},prepare(sql){const statement=db.prepare(sql);let args=[];return{bind(...v){args=v;return this},async all(){return{results:statement.all(...args)}},async first(){return statement.get(...args)},async run(){return{meta:{changes:Number(statement.run(...args).changes)}}},sql,get args(){return args}}},async batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>/^SELECT/i.test(s.sql.trim())?{results:db.prepare(s.sql).all(...s.args)}:{meta:{changes:Number(db.prepare(s.sql).run(...s.args).changes)}});db.exec('COMMIT');if(lose&&statements.some(s=>s.sql.includes('WITH previous'))){lose=false;throw Error('timeout after commit');}return result;}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}}};}
const ops=database(['cloudflare/migrations/0000_container_metadata.sql','cloudflare/migrations/0001_operations.sql']);
const master=database(['cloudflare/migrations/0000_container_metadata.sql','cloudflare/migrations/0001_master.sql']);master.db.prepare('INSERT INTO stock_items(item_code,item_name,category,default_unit,active) VALUES(?,?,?,?,1)').run('P1','Cake','Food','BOX');
const files=new Map(),messages=[];
const history=database(['cloudflare/migrations/0000_container_metadata.sql','cloudflare/migrations/0001_history.sql']);
const env={HISTORY_DB_2026:history,API_KEY:'test-key',MASTER_DB:master,OPERATIONS_DB:ops,FILES:{put:async(k,v)=>{files.set(k,v)},get:async k=>files.has(k)?{json:async()=>JSON.parse(files.get(k))}:null},RECEIPT_UPLOAD_QUEUE:{send:async body=>messages.push(body)}};
const owner={aud:'receipt-direct-v1',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,owner:'N1',outlet:'BISS',location:'Store',outletNames:['Bakerzin Senayan Park']};
async function token(c=owner){const encoded=Buffer.from(JSON.stringify(c)).toString('base64url'),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.API_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);return encoded+'.'+Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('receipt-direct-v1.'+encoded))).toString('base64url');}
async function call(action,payload={},options={}){const r=await worker.fetch(new Request('https://test/v1/receipt-direct',{method:'POST',headers:{origin:options.origin||'https://operationalbi-pixel.github.io',authorization:'Bearer '+(options.token||await token()),'content-type':'application/json'},body:JSON.stringify({action,payload})}),env);return{status:r.status,...await r.json()};}
const makeFile=(qty='3',destination='Bakerzin Senayan Park',repeat=1)=>execFileSync('python3',['-c',`import zipfile,io,json,base64,sys,xml.sax.saxutils as x
q,d,n=json.load(sys.stdin)
cells={'A1':'GOODS RECEIPT NUMBER','B1':'GOODS RECEIPT DATE','C1':'REFERENCE NUMBER','D1':'PRODUCT CODE','E1':'ORIGIN','F1':'PRODUCT NAME','G1':'DESTINATION','H1':'UNIT','I1':'QTY','J1':'SUB CATEGORY','K1':'EXPIRED DATE','U1':'STATUS','A2':'GR1','B2':'29-10-2026','C2':'PO1','D2':'P1','E2':'Supplier A','F2':'Cake','G2':d,'H2':'PCS','I2':q,'J2':'Food','K2':'11-30-2026','U2':'Authorized','A3':'GR2','B3':'29-10-2026','D3':'P1','E3':'Supplier A','F3':'Cake','G3':d,'H3':'PCS','I3':'999','U3':'Draft'}
if n>1:
 template={a[:-1]:v for a,v in list(cells.items()) if a.endswith('2')}
 for i in range(2,n+2):
  for col,v in template.items():cells[col+str(i)]=v
  cells['A'+str(i)]='GR'+str(i)
rows={}
for a,v in cells.items():rows.setdefault(''.join(c for c in a if c.isdigit()),[]).append('<c r="'+a+'" t="inlineStr"><is><t xml:space="preserve">'+x.escape(v)+'</t></is></c>')
sheet='<worksheet><sheetData>'+''.join('<row r="'+r+'">'+''.join(c)+'</row>' for r,c in rows.items())+'</sheetData></worksheet>'
f=io.BytesIO()
with zipfile.ZipFile(f,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('xl/worksheets/sheet1.xml',sheet);z.writestr('xl/workbook.xml','<workbook/>')
print(base64.b64encode(f.getvalue()).decode())`],{input:JSON.stringify([qty,destination,repeat]),encoding:'utf8'}).trim();
const payload={type:'GOODS_RECEIPT',outlet:'BISS',location:'Store',fileName:'receipt.xlsx',base64:makeFile(),requestId:'12345678-1234-4567-1234-123456789000'};
let r=await call('verify',payload);assert.equal(r.status,200);assert.equal(r.data.requiresConversion,true);assert.equal(r.data.conversions[0].itemCode,'P1');
assert.equal((await call('verify',{...payload,outlet:'OTHER'})).status,403);
assert.equal((await call('verify',payload,{token:await token({...owner,exp:0})})).status,401);
assert.equal((await call('verify',payload,{origin:'https://evil.test'})).status,403);
r=await call('conversions',{conversions:[{itemCode:'P1',itemName:'Cake',fromUnit:'PCS',toUnit:'BOX',factor:0.5}]});assert.equal(r.ok,true);
assert.equal((await call('conversions',{conversions:[{itemCode:'P1',fromUnit:'PCS',toUnit:'BOX',factor:2}]})).status,409);
r=await call('verify',payload);assert.equal(r.data.verified,true);assert.equal(r.data.movementCount,1);assert.equal(r.data.sourceItemCount,1,'unauthorized rows skipped');
const accepted=await call('accept',payload);assert.equal(accepted.ok,true);const id=accepted.data.jobId;assert.equal(ops.db.prepare('SELECT COUNT(*) n FROM stock_movements').get().n,0,'acceptance never writes stock');
assert.equal((await call('accept',payload)).data.jobId,id);assert.equal((await call('accept',{...payload,base64:makeFile('4')})).status,409);
async function consume(attempts=1){const body=messages.shift();assert.ok(body);let ack=false,retry=false;await worker.queue({messages:[{body,attempts,ack(){ack=true},retry(){retry=true}}]},env);return{ack,retry};}
ops.lose();assert.equal((await consume()).retry,true);assert.equal(Number(ops.db.prepare('SELECT current_qty FROM stock_balances').get().current_qty),1.5);
await consume(2);assert.equal(Number(ops.db.prepare('SELECT current_qty FROM stock_balances').get().current_qty),1.5,'lost acknowledgement replay applies same record IDs once');
r=await call('status');assert.equal(r.data.jobs[0].status,'COMPLETE');assert.equal(r.data.jobs[0].processed,1);assert.ok(!JSON.stringify(r).includes('sourceKey'));
assert.equal((await call('status',{}, {token:await token({...owner,owner:'N2'})})).data.jobs.length,0);
r=await call('verify',payload);assert.equal(r.data.requiresDuplicateDecision,true);assert.equal(r.data.duplicates[0].matchType,'DATABASE');assert.equal(r.data.duplicates[0].qty,1.5);
r=await call('verify',{...payload,skipDuplicateRows:[2]});assert.equal(r.data.nothingToUpload,true);
r=await call('verify',{...payload,allowDuplicateRows:[2]});assert.equal(r.data.verified,true);
assert.equal((await call('verify',{...payload,base64:makeFile('3','Bakerzin Other')})).status,403);
assert.equal((await call('verify',{...payload,base64:'garbage'})).ok,false);
// A 51-row accepted plan advances in durable 25-row Queue batches.
const large={...payload,base64:makeFile('3','Bakerzin Senayan Park',51),requestId:'12345678-1234-4567-1234-123456789001',allowDuplicateRows:Array.from({length:51},(_,i)=>i+2)};
const bulk=await call('accept',large);assert.equal(bulk.ok,true);await consume();let bulkStatus=(await call('status')).data.jobs.find(j=>j.jobId===bulk.data.jobId);assert.equal(bulkStatus.processed,25);assert.equal(bulkStatus.status,'PROCESSING');await consume();bulkStatus=(await call('status')).data.jobs.find(j=>j.jobId===bulk.data.jobId);assert.equal(bulkStatus.processed,50);assert.equal(bulkStatus.status,'PROCESSING');await consume();bulkStatus=(await call('status')).data.jobs.find(j=>j.jobId===bulk.data.jobId);assert.equal(bulkStatus.status,'COMPLETE');assert.equal(bulkStatus.processed,51);assert.equal(ops.db.prepare('SELECT current_qty FROM stock_balances').get().current_qty,78);
// A failed plan must release its outlet lock. Otherwise every later upload for
// the same outlet remains QUEUED forever even though the failed job is visible.
const staleId='receipt-'+('f'.repeat(64));
const stale={jobId:staleId,fileName:'broken.xlsx',outlet:'BISS',location:'Store',ownerNik:'N1',status:'QUEUED',planKey:'receipt-direct/plan/missing.json',processed:0,total:1,createdAt:new Date().toISOString()};
ops.db.prepare('INSERT INTO application_records(table_name,record_id,outlet_code,payload_json,created_at) VALUES(?,?,?,?,?)').run('receipt_direct_jobs',staleId,'BISS',JSON.stringify(stale),stale.createdAt);
messages.push({kind:'RECEIPT_DIRECT',id:staleId});await consume();
assert.equal(JSON.parse(ops.db.prepare('SELECT payload_json FROM application_records WHERE table_name=? AND record_id=?').get('receipt_direct_jobs',staleId).payload_json).status,'FAILED');
assert.equal(ops.db.prepare('SELECT COUNT(*) n FROM application_records WHERE table_name=? AND record_id=?').get('receipt_direct_locks','BISS|Store').n,0,'a failed receipt must not retain the outlet lock');
// The grant route must remain local even when UrlFetch quota is exhausted.
const gas={console};vm.createContext(gas);vm.runInContext(fs.readFileSync('gas/Code.gs','utf8'),gas);Object.assign(gas,{requireSession_:()=>({nik:'N'}),findEmployee_:()=>({nik:'N',outlet:'BISS'}),assertEmployeeActive_(){},normalizeLocation_:v=>v,readStockLocations_:()=>['Store'],readStoreCodeDirectory_:()=>({byCode:{BISS:{name:'Bakerzin Senayan Park'}}}),cloudflareInventoryConfig_:()=>({url:'https://test',apiKey:'test'}),Utilities:{Charset:{UTF_8:'UTF-8'},base64EncodeWebSafe:v=>Buffer.from(typeof v==='string'?v:Uint8Array.from(v)).toString('base64url'),computeHmacSha256Signature:()=>[1,2,3]},UrlFetchApp:{fetch:()=>assert.fail('grant must not use UrlFetch')}});assert.equal(gas.getReceiptDirectGrant('T','BISS','Store').ok,true);assert.equal(gas.getReceiptDirectGrant('T','OTHER','Store').ok,false);
console.log('Direct Goods Receipt: real XLSX parsing, signed scoped access, saved conversions, authorized rows, durable acceptance, lost acknowledgements, duplicate decisions and quota-free grants passed.');

// Browser transport never submits GR verification, acceptance or worker starts to GAS.
const calls=[],fetches=[];const browser={APP:{token:'T',outlet:'BISS',location:'Store',goodsReceipt:{savingConversions:true}},BAKERZIN_API:{call:async(action,args)=>{calls.push(action);if(action==='receiptDirectGrant')return{ok:true,data:{url:'https://direct',token:'short',expiresAt:Date.now()+300000}};if(action==='saveConversions')return{ok:true,data:{saved:true}};if(action==='localStockUploadStatus')return{ok:true,data:{jobs:[]}};if(action==='bootstrap'||action==='data')return{ok:false,error:'Service invoked too many times for one day: urlfetch.'};if(action==='localStockContext')return{ok:true,data:{inventoryUnavailable:true,items:[]}};throw Error('unexpected GAS '+action)}},fetch:async(url,options)=>{const p=JSON.parse(options.body);fetches.push(p.action);return{status:200,json:async()=>({ok:true,data:p.action==='status'?{jobs:[]}:p.action==='accept'?{jobId:'native',outlet:'BISS',location:'Store'}:{verified:true}})}}};browser.window=browser;vm.createContext(browser);vm.runInContext(fs.readFileSync('docs/stock-receipt-direct.js','utf8'),browser);
await browser.BAKERZIN_API.call('verifyGoodsReceipt',['T',payload]);await browser.BAKERZIN_API.call('saveConversions',['T',{conversions:[]}]);await browser.BAKERZIN_API.call('queueGoodsUpload',['T',payload]);await browser.BAKERZIN_API.call('goodsUploadStatus',['T']);assert.deepEqual(fetches,['verify','conversions','accept','status']);assert.ok(calls.every(c=>['receiptDirectGrant','saveConversions','localStockUploadStatus'].includes(c)));console.log('GR browser transport bypasses GAS UrlFetch paths while keeping the Sheet conversion mirror.');

const limited=await browser.BAKERZIN_API.call('bootstrap',['T','BISS']);assert.equal(limited.ok,true);assert.equal(limited.data.inventoryUnavailable,true);assert.deepEqual(limited.data.items,[]);assert.ok(calls.includes('localStockContext'));
Object.assign(gas,{userView_:e=>e,readTasksForEmployee_:()=>[],readPagesForEmployee_:()=>[],ScriptApp:{getService:()=>({getUrl:()=> 'https://test'})}});const local=gas.getLocalStockContext('T','BISS','Store');assert.equal(local.ok,true);assert.equal(local.data.inventoryUnavailable,true);assert.equal(local.data.items.length,0);assert.equal(local.data.selectedOutlet,'BISS');
console.log('Quota-exhausted bootstrap exposes local outlet/location context without inventing stock balances or using UrlFetch.');
