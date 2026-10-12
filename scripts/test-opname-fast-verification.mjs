import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('docs/Code.gs','utf8'),ctx={console};vm.createContext(ctx);vm.runInContext(source,ctx);
const employee={nik:'HQ',outlet:'BIHQ'},outlets=Array.from({length:12},(_,i)=>'B'+i);
const master=Array.from({length:300},(_,i)=>({code:'I'+i,name:'Item '+i,unit:'PCS',category:'Food'}));
let report={outlets,rows:outlets.flatMap(outlet=>master.map((item,i)=>({...item,outlet,actualQty:i%8,sourceRow:i+2})))};
let historyReads=0,currentReads=0,duplicateReads=0,duplicate=false,uuid=0;
Object.assign(ctx,{Utilities:{getUuid:()=> 'ID'+ ++uuid},safe_:fn=>fn(),requireSession_:()=>({nik:'HQ'}),findEmployee_:()=>employee,assertEmployeeActive_:e=>{if(e.inactive)throw Error('inactive')},
 normalizeDate_:value=>value,todayIso_:()=> '2026-10-12',digest_:()=> 'file-hash',parseStockOpnameReport_:()=>structuredClone(report),
 ensureStockCardInfrastructure_(){},readActiveOutlets_:()=>outlets,readStockLocations_:()=>['Store'],readStockMaster_:()=>master,readStockUnitConversions_:()=>({}),
 stockOpnameAlreadyImported_:()=>{duplicateReads++;return duplicate},
 readStockCodeQtyMapAtDate_:()=>{historyReads++;return Object.fromEntries(master.map(i=>[i.code,5]))},
 readCurrentStockCodeQtyMapForItems_:()=>{currentReads++;return Object.fromEntries(master.map(i=>[i.code,9]))}});
const payload={fileName:'opname.xlsx',base64:'file',eventDate:'2026-09-30',location:'Store'};
const preview=ctx.previewStockOpnameUpload('token',payload);
assert.equal(preview.verified,true);assert.equal(preview.balancePending,true);assert.equal(preview.sourceItemCount,3600);assert.equal(preview.outletCount,12);
assert.equal(historyReads+currentReads+duplicateReads,0,'verification does not scan balances or movement histories for 12 branches');
const plan=ctx.buildStockOpnamePlan_({employee}, {...payload,validationOnly:true});
assert.equal(historyReads,12);assert.equal(currentReads,12);assert.equal(duplicateReads,12,'background preparation rechecks duplicates despite a payload flag');
const adjustments=plan.stockRows.filter(r=>r.json.record_type==='MOVEMENT');
assert.equal(adjustments.length,3600);assert.equal(adjustments[0].json.direction,'OUT');assert.equal(adjustments[0].json.qty,5);
assert.equal(plan.stockRows.filter(r=>r.json.record_type==='OPNAME_DETAIL').length,3600);
assert.equal(plan.stockRows.filter(r=>r.json.record_type==='IMPORT').length,12);
assert.equal(JSON.parse(plan.stockRows[0].json.info).actualQty,0,'explicit zero counts remain audit checkpoints');
duplicate=true;assert.throws(()=>ctx.buildStockOpnamePlan_({employee},payload),/sudah pernah/);duplicate=false;
assert.throws(()=>ctx.prepareStockOpnameForEmployee_({...employee,outlet:'B1'},payload,{validationOnly:true}),/BIHQ/);
assert.throws(()=>ctx.prepareStockOpnameForEmployee_({...employee,inactive:true},payload,{validationOnly:true}),/inactive/);
assert.throws(()=>ctx.previewStockOpnameUpload('token',{...payload,eventDate:'2026-10-13'}),/melewati/);
report={outlets:['B0'],rows:[{code:'NEW',name:'New item',unit:'PCS',outlet:'B0',actualQty:2,sourceRow:2}]};
assert.equal(ctx.previewStockOpnameUpload('token',payload).newItemCount,1);
report.rows[0].name='';assert.throws(()=>ctx.previewStockOpnameUpload('token',payload),/PRODUCT/);
report={outlets:['B0'],rows:[{...master[0],outlet:'B0',unit:'KG',actualQty:2,sourceRow:2}]};
const conversion=ctx.previewStockOpnameUpload('token',payload);assert.equal(conversion.requiresConversion,true);assert.equal(conversion.verified,false);
// Exercise the real SO success handler: pending balances must never display
// fabricated zero adjustment counts, and a stale request cannot enable Save.
const html=fs.readFileSync('docs/stock-card.html','utf8');const a=html.indexOf('    function requestStockOpnameVerification()'),z=html.indexOf('    function confirmStockOpnameUpload()',a);
const elements=new Map(),byId=id=>{if(!elements.has(id))elements.set(id,{value:'2026-09-30',disabled:false,innerHTML:'',classList:{add(){},remove(){}}});return elements.get(id)};
const u={APP:{token:'token',stockOpname:{fileName:'opname.xlsx',base64:'file'}},byId,stockOpnamePayload:()=>payload,beginFileVerification:()=>({finish:()=>true}),clearInterval(){},renderStockOpnameConversions(){},closeStockOpnameConversionModal(){},escapeHtml:String,formatDate:String,formatQty:String,setStockOpnameProgress(){},stockOpnameError:m=>{throw Error(m)},server:(name,args,fn)=>fn(preview)};
vm.createContext(u);vm.runInContext(html.slice(a,z),u);u.requestStockOpnameVerification();
assert.equal(byId('confirmStockOpnameUpload').disabled,false);assert.match(byId('stockOpnameVerified').innerHTML,/Diperiksa saat proses background/);assert.doesNotMatch(byId('stockOpnameVerified').innerHTML,/PENYESUAIAN|TANPA PERUBAHAN/);
u.beginFileVerification=()=>({finish:()=>false});u.requestStockOpnameVerification();assert.equal(byId('confirmStockOpnameUpload').disabled,true);
console.log('SO verification skips 12-branch ledger scans; background keeps live balances, duplicate checks, audit zeros, access checks and conversion requirements.');
