import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c={console};vm.createContext(c);vm.runInContext(fs.readFileSync('docs/Code.gs','utf8'),c);
function raw(id,date,qty,direction,type='Sold',extra={}){return{record_id:id,logical_id:id,record_type:'MOVEMENT',item_code:'BIW01024',item_name:'ROMAINCE KUPAS OUTLET NEW',outlet_code:'BISS',event_date:date,quantity:qty,direction,movement_type:type,created_at:date+'T01:00:00Z',source_hash:'count',source_row:20895,...extra}}
const oldDebt=850000000000000.2;
const old=raw('sold','2026-08-10',oldDebt,'OUT');
const so=raw('so','2026-08-31',oldDebt,'IN','Stock Opname',{info:'Hasil Stock Opname tanggal 2026-08-31 · Saldo sistem -850000000000000.25 → Balance 0'});
const audit=raw('audit','2026-08-31',0,'NONE','Stock Opname Audit',{record_type:'OPNAME_DETAIL',info:JSON.stringify({cardQty:-oldDebt,actualQty:0,reportQty:0,conversionFactor:1,eventDate:'2026-08-31',effectiveDate:'2026-08-31'})});
const mapped=[old,so,audit].map(c.cloudflareMovementToApp_);
assert.equal(mapped[2].opnameBalance,0);assert.equal(mapped[2].opnameDate,'2026-08-31');
assert.equal(c.salesHistoryBalanceAtDate_(mapped,'2026-10-01'),0,'physical zero replaces the old corrupted debt');
assert.equal(c.salesHistoryBalanceAtDate_(mapped.slice(0,2),'2026-10-01'),0,'legacy SO movement text still supplies its checkpoint');
assert.equal(c.salesHistoryBalanceAtDate_([c.cloudflareMovementToApp_(old)],'2026-08-10'),-oldDebt,'pre-SO dates retain their original history');
for(const info of [{stockOpnameBalance:3,stockOpnameDate:'2026-08-30'},{actualQty:0,stockOpnameBalance:9,eventDate:'2026-08-31'},{actualQty:-2,eventDate:'2026-08-31'}]){
 const row=c.cloudflareMovementToApp_({...audit,info:JSON.stringify(info)});assert.equal(row.opnameBalance,info.actualQty===undefined?3:info.actualQty);
}
for(const info of ['bad JSON','{}','{"actualQty":false}','{"actualQty":[]}','{"actualQty":" "}','{"actualQty":null}','{"actualQty":""}','{"actualQty":"invalid"}'])assert.equal(c.cloudflareMovementToApp_({...audit,info}).opnameBalance,null,'invalid/missing quantities never become a fabricated zero');
const preciseAudit=c.cloudflareMovementToApp_({...audit,info:'{"actualQty":0.123456,"eventDate":"2026-08-31"}'});
const roundedMovement=c.cloudflareMovementToApp_({...so,created_at:'2026-08-31T02:00:00Z',info:'Hasil Stock Opname tanggal 2026-08-31 → Balance 0.1235'});
assert.equal(c.salesHistoryBalanceAtDate_([roundedMovement,preciseAudit],'2026-10-01'),0.123456,'audit precision overrides a newer rounded movement description');
const plus=raw('receipt','2026-09-01',0.5,'IN','Goods Receipt');const minus=raw('later-sold','2026-10-01',0.1,'OUT');
assert.ok(Math.abs(c.salesHistoryBalanceAtDate_([...mapped,c.cloudflareMovementToApp_(plus),c.cloudflareMovementToApp_(minus)],'2026-10-01')-0.4)<1e-9);
const future=c.cloudflareMovementToApp_({...audit,record_id:'future',event_date:'2026-10-02',info:'{"actualQty":8,"eventDate":"2026-10-02"}'});assert.equal(c.salesHistoryBalanceAtDate_([...mapped,future],'2026-10-01'),0);
// If no valid absolute count exists, a SO delta participates like normal history.
const legacy=c.cloudflareMovementToApp_(raw('legacy','2026-09-01',2,'IN','Stock Opname',{info:'legacy delta'}));assert.equal(c.salesHistoryBalanceAtDate_([legacy],'2026-10-01'),2);
const wip={code:'BIW01024',name:'ROMAINCE KUPAS OUTLET NEW',unit:'KG',category:'WIP'},material={code:'FVG00011',name:'BABY ROMAIN',unit:'KG',category:'Food'};
const variant={key:'recipe',code:wip.code,name:wip.name,unit:'KG',salesUsageMode:'AUTO_RECIPE',materials:[{code:material.code,name:material.name,qty:1.67,unit:'KG'}]};
const catalog={byCode:{BIW01024:[variant]},variants:[variant]},master={BIW01024:wip,FVG00011:material};
let uuid=0,writes=[];
Object.assign(c,{Utilities:{getUuid:()=> 'id'+ ++uuid},acquireStockWriteLock_:()=>({releaseLock(){}}),insertStockCardRows_:rows=>writes.push(...rows),
 cloudflarePreloadSalesFifoRowsBatch_:requests=>requests.map(request=>request.itemCodes.flatMap(code=>code===wip.code?[old,so,audit].map(c.cloudflareMovementToApp_):[c.cloudflareMovementToApp_(raw('baby-receipt','2026-09-25',5,'IN','Goods Receipt',{item_code:material.code,item_name:material.name}))]))});
const input=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')).rows.filter(r=>r.product===wip.name):[{product:wip.name,transactionDate:'2026-10-01',qty:0.07,sourceRow:94,salesNumber:'test',menu:'HAIL CAESAR'}];
const sales=input.map((r,i)=>({...r,rowHash:'hash'+i,outlet:'BISS',item:wip,target:wip,targetType:'WIP',qtyDefault:r.qty}));
const state=c.preloadSalesFifoLots_(sales,catalog,master,{});
for(const date of new Set(sales.map(s=>s.transactionDate))){assert.equal(c.salesBalanceFor_(state,'BISS',wip.code,date),0);assert.equal(c.salesFifoLotsFor_(state,'BISS',wip.code,date).length,0,'zero count also clears FIFO lots and old uncovered debts')}
const result=c.writePreparedSalesCogsChunk_({fileName:'actual-sales.xlsx',rows:sales,showcaseRows:[]},{nik:'owner'},{conversions:{}},{referenceData:{wipCatalog:catalog,masterByCode:master,savedConversions:{},salesMappings:{}}});
const total=sales.reduce((n,s)=>n+s.qtyDefault,0);const sum=type=>writes.filter(r=>r.json.movement_type===type).reduce((n,r)=>n+r.json.qty,0);
assert.ok(Math.abs(sum('Production')-total)<1e-9);assert.ok(Math.abs(sum('Sold')-total)<1e-9);assert.ok(Math.abs(sum('WIP Material Usage')-total*1.67)<1e-9);
assert.ok(writes.every(r=>r.json.qty<10));assert.equal(result.autoWipProductionCount,sales.length);
console.log(`SO checkpoint regression passed: ${sales.length} ROMAINCE rows, Sold ${total} KG; fixture recipe requires ${sum('WIP Material Usage')} KG BABY ROMAIN. No production writes performed.`);
