import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const gas=fs.readFileSync('docs/Code.gs','utf8'),html=fs.readFileSync('docs/stock-card.html','utf8');
assert.equal(gas,fs.readFileSync('gas/Code.gs','utf8'),'GAS mirror must stay identical');
const start=gas.indexOf('function changeStockItemDefaultUnit('),end=gas.indexOf('function convertStockDefaultUnitBigQuery_(',start);
assert(start>0&&end>start);
const body=gas.slice(start,end);
assert(!body.includes('cloudflareLedgerRows_('),'Conversion must not download entire movement ledger');
assert(body.includes('readStoreCodeDirectory_()'),'Cache scope should use the bounded outlet directory');
assert(body.includes('if (payload.oldUnit &&'),'Stale conversion confirmation must be rejected');
assert(body.includes('cacheError'),'Post-write cache failure must not report conversion failure');
const context={console};
vm.createContext(context);vm.runInContext(gas,context);
let converted=0,scanned=0,flushed=0,invalidated=0,started=0,completed=0;
const item=['FGR01170','GROCERIES','NORI TABUR / KOREAN NORI','PCK@50GR',true];
const sheet={getLastRow:()=>2,getRange:(r,c)=>({
 getDisplayValues(){assert.equal(r,2);assert.equal(c,1);return [item.slice()]},
 setValue(value){assert.equal(r,2);assert.equal(c,4);item[3]=value}
})};
Object.assign(context,{
 safe_:fn=>{try{return {ok:true,data:fn()}}catch(error){return {ok:false,error:error.message}}},
 requireAdmin_:()=>({nik:'HQ'}),
 cleanText_:value=>String(value||'').trim(),
 normalizeUnit_:value=>String(value||'').trim().toUpperCase(),
 ensureStockMasterSheet_:()=>sheet,
 readStockUnitConversions_:()=>({}),
 resolveUnitConversionFactor_:()=>null,
 ensureStockCardInfrastructure_(){},
 acquireStockScopeLock_:()=>{started++;return {releaseLock(){completed++}}},
 acquireStockWriteLock_:()=>({releaseLock(){}}),
 readStoreCodeDirectory_:()=>({byCode:{BICP:{},BIKK:{}}}),
 readStockLocations_:()=>['Store','Gudang'],
 cloudflareLedgerRows_(){scanned++;throw Error('unbounded ledger scan')},
 convertStockDefaultUnitBigQuery_:(code,name,to,factor,from)=>{
   assert.equal(code,'FGR01170');assert.equal(from,'PCK@50GR');assert.equal(to,'PCK@60GR');
   assert.equal(factor,50/60);converted++;return {stock_rows:10,transfer_rows:2};
 },
 upsertStockConversionRows_(){},
 SpreadsheetApp:{flush(){flushed++}},
 ensureSheet_:()=>({appendRow(){}}),
 removeScriptCacheKeys_(){},
 invalidateStockItemCachesForRows_:rows=>{invalidated++;assert.equal(rows.length,4);throw Error('cache temporarily unavailable')},
 invalidateFastStockHistoryRows_(){},
});
const payload={itemCode:'FGR01170',oldUnit:'PCK@50GR',newUnit:'PCK@60GR',factor:50/60,useProvidedFactor:true,fromStockOpname:true};
const result=context.changeStockItemDefaultUnit('token',payload);
assert(result.ok,JSON.stringify(result));
assert.equal(result.data.changed,true);
assert.equal(item[3],'PCK@60GR');
assert.equal(converted,1);assert.equal(scanned,0);
assert.equal(started,1);assert.equal(completed,1);assert.equal(invalidated,1);assert(flushed>0);
const stale=context.changeStockItemDefaultUnit('token',payload);
assert.equal(stale.ok,false);assert.match(stale.error,/sudah berubah/);assert.equal(converted,1);

const a=html.indexOf('    function continueStockOpnameConversion(){');
const z=html.indexOf('    function requestStockOpnameVerification(){',a);
assert(a>0&&z>a);
assert(html.includes("if(name==='changeDefaultUnit')return false;"),'Destructive operation must not be automatically replayed');
assert(html.includes('id="stockOpnameConversionStatus"'),'Modal must have visible status');
function clientScenario(message){
 const controls=new Map();
 const fields=[{value:'0,8333333333',getAttribute:key=>({
   'data-code':'FGR01170','data-name':'NORI TABUR / KOREAN NORI',
   'data-old':'PCK@50GR','data-new':'PCK@60GR'
 })[key]}];
 const byId=id=>{
   if(!controls.has(id))controls.set(id,{
     textContent:'',disabled:false,
     querySelectorAll:()=>id==='stockOpnameUnitConversionRows'?fields:[]
   });
   return controls.get(id);
 };
 let calls=0,reverified=0,cacheCleared=0,clockStopped=0;
 const ui={
   APP:{user:{isAdmin:true},token:'token',stockOpname:{unitChanging:false}},
   byId,toast(){},parseLocaleNumber:s=>Number(s.replace(',','.')),
   setStockOpnameProgress(){},
   setInterval:fn=>{fn();return 1},
   clearInterval:()=>{clockStopped++},
   clearStockDataCaches:()=>{cacheCleared++},
   closeStockOpnameConversionModal(){},
   requestStockOpnameVerification(){reverified++},
   server:(action,args,success,opts)=>{calls++;assert.equal(action,'changeDefaultUnit');assert.equal(opts.blocking,false);
     assert.equal(args[1].fromStockOpname,true);
     if(message)opts.onError(message);else success({changed:true});
   }
 };
 vm.createContext(ui);vm.runInContext(html.slice(a,z),ui);
 ui.continueStockOpnameConversion();
 assert.equal(calls,1);assert.equal(ui.APP.stockOpname.unitChanging,false);
 assert(clockStopped>0);
 if(message){
   assert.equal(reverified,0,'Uncertain outcome must not automatically retry or reverify');
   assert.equal(byId('saveStockOpnameConversions').disabled,true);
   assert.match(byId('stockOpnameConversionStatus').textContent,/belum dapat dipastikan/);
 }else{
   assert.equal(reverified,1);assert.equal(cacheCleared,1);
   assert.equal(byId('saveStockOpnameConversions').disabled,false);
 }
}
clientScenario(null);
clientScenario('Server tidak merespons dalam 90 detik.');
console.log('OK: SO unit conversion skips ledger scan, validates old unit, survives cache errors, shows elapsed status, and never repeats ambiguous writes.');
