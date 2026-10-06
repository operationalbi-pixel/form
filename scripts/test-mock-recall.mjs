import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const backend=await readFile('gas/Code.gs','utf8');
const frontend=await readFile('docs/stock-card.html','utf8');
function between(source,start,end){
  const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
  assert.ok(first>=0&&last>first,`Source section exists: ${start}`);
  return source.slice(first,last);
}
let rows=[];
let roleOutlet='BISS';
const requests=[];
function movement(id,date,extra={}){
  return {record_id:id,logical_id:id,version:1,record_type:'MOVEMENT',outlet_code:'BISS',location_code:'Store',
    event_date:date,created_at:date+'T12:00:00Z',item_code:'RAW',item_name:'Flour',unit:'KG',quantity:2,
    direction:'OUT',movement_type:'Sold',info:'Sold · Noodle · Sales Number BILL-1',
    source_file:'SALES_COGS|usage.xlsx',source_row:1,arrival_date:'2026-06-20',production_date:'2026-06-19',expiry_date:'2026-11-01',...extra};
}
const context={console,
  safe_:fn=>{try{return {ok:true,data:fn()};}catch(error){return {ok:false,error:error.message};}},
  requireSession_:()=>({nik:'STAFF'}),findEmployee_:()=>({outlet:roleOutlet}),assertEmployeeActive_(){},
  normalizeDate_:value=>String(value),cleanText_:value=>String(value||'').trim(),normalizeStoreName_:value=>String(value||'').trim().toLowerCase(),
  readActiveOutlets_:()=>['BISS','BIPS'],
  readWipRecipeCatalog_:()=>({byCode:{}}),readStockMaster_:()=>[],readStockUnitConversions_:()=>({}),
  formatQty_:value=>String(value),
  runNamedQuery_:()=>{throw new Error('Recall must not read the frozen BigQuery dataset');},
  stockCardTable_:()=>{throw new Error('Recall must not build a BigQuery query');},
  cloudflareQueryString_:params=>new URLSearchParams(params).toString(),
  cloudflareInventoryRequest_(method,path){
    const query=new URL('https://inventory.test'+path).searchParams;
    requests.push(Object.fromEntries(query));
    assert.equal(method,'GET');assert.equal(query.get('record_type'),'MOVEMENT');
    assert.ok(query.get('outlet'),'every recall query is scoped to an outlet');
    const filtered=rows.filter(row=>row.outlet_code===query.get('outlet')&&
      (!query.get('from')||row.event_date>=query.get('from'))&&(!query.get('to')||row.event_date<=query.get('to'))&&
      (!query.get('location')||row.location_code===query.get('location'))&&
      (!query.get('item_code')||row.item_code===query.get('item_code'))&&
      (!query.get('movement_type')||row.movement_type===query.get('movement_type'))&&
      (!query.get('transfer_id')||row.transfer_id===query.get('transfer_id')));
    const offset=Number(query.get('cursor')||0),limit=Number(query.get('limit'));
    return {data:filtered.slice(offset,offset+limit),nextCursor:offset+limit<filtered.length?String(offset+limit):null};
  }
};
vm.createContext(context);
vm.runInContext(
  between(backend,'function cloudflareReadAllPages_(','function cloudflareMovementToApp_(')+
  between(backend,'function salesHistoryRowFromQuery_(','/**\r\n * Memuat histori FIFO')+
  between(backend,'function readMockRecallMovements_(','function sessionPayload_('),context);

// Both dates before and after the reported cutoff use the same live source.
for(const date of ['2026-07-01','2026-09-20','2026-09-21','2026-09-22','2026-10-06']){
  rows=[movement('SOLD-'+date,date)];
  const result=context.getMockRecallList('session',{date,outlet:'BIPS'});
  assert.equal(result.ok,true);assert.equal(result.data.items.length,1);
  assert.equal(result.data.items[0].date,date);
  assert.equal(requests.at(-1).outlet,'BISS','store sessions cannot read another outlet');
  const detail=context.getMockRecallDetail('session',{date,menu:'Noodle',salesNumber:'BILL-1',outlet:'BISS'});
  assert.equal(detail.ok,true);
  assert.equal(detail.data.materials[0].arrivalDate,'2026-06-20');
  assert.equal(detail.data.materials[0].productionDate,'2026-06-19');
  assert.equal(detail.data.materials[0].expiryDate,'2026-11-01');
  assert.equal(detail.data.materials[0].qty,2);
}
assert.equal(context.getMockRecallDetail('session',{date:'2026-10-06',menu:'Noodle',salesNumber:'BILL-1',outlet:'BIPS'}).ok,false);

rows=Array.from({length:1003},(_,index)=>movement('SALE-'+index,'2026-10-06',{info:`Sold · Menu ${index} · Sales Number BILL-${index}`}));
rows.push(movement('REVISION','2026-10-06',{logical_id:'SALE-0',version:2,info:'Sold · Updated menu · Sales Number BILL-0'}));
requests.length=0;
let result=context.getMockRecallList('session',{date:'2026-10-06',outlet:'BISS'});
assert.equal(result.data.items.length,1003,'all recall pages are read');
assert.equal(requests.length,2);
assert.equal(result.data.items.some(item=>item.menu==='Menu 0'),false,'older logical versions are discarded');
assert.equal(result.data.items.some(item=>item.menu==='Updated menu'),true);

roleOutlet='BIHQ';
rows=[movement('S1','2026-10-06'),movement('S2','2026-10-06',{outlet_code:'BIPS'})];
result=context.getMockRecallList('session',{date:'2026-10-06',outlet:''});
assert.equal(result.data.items.length,2,'HQ can read its allowed outlet list');
roleOutlet='BISS';

// An older batch remains traceable even when there are more than 200 newer productions.
rows=Array.from({length:205},(_,index)=>movement('PROD-'+index,'2026-10-01',{
  item_code:'WIP',direction:'IN',movement_type:'Production',transfer_id:'NEW-'+index,source_file:'WIP_MANUAL',production_date:'2026-10-01'}));
rows.push(movement('OLD-PROD','2026-07-01',{item_code:'WIP',direction:'IN',movement_type:'Production',transfer_id:'OLD-TRANSFER',quantity:4,production_date:'2026-07-01',expiry_date:'2026-12-01'}));
rows.push(movement('OLD-USAGE','2026-07-01',{movement_type:'WIP Material Usage',transfer_id:'OLD-TRANSFER',quantity:8}));
const usages=context.loadMockRecallHistoricalWipUsage_('BISS','WIP',[{qty:2,production_date:'2026-07-01',source_arrival_date:'2026-07-01',expiry_date:'2026-12-01',event_date:'2026-10-06'}]);
assert.equal(usages.length,1);assert.equal(usages[0]._mockRecallScale,.5);
assert.equal(usages[0].source_arrival_date,'2026-06-20');
const state={outlet:'BISS',saleDate:'2026-10-06'};
const sources=context.mockRecallWipSourceRows_(state,'WIP');
assert.equal(sources.length,206,'WIP sources include older and current productions');
const beforeCache=requests.length;
context.mockRecallWipSourceRows_(state,'WIP');
assert.equal(requests.length,beforeCache,'WIP sources are reused within a recall');

// FIFO reconstruction must receive the older transaction, rather than only the last 500.
rows=Array.from({length:601},(_,index)=>movement('HISTORY-'+index,'2026-09-22',{item_code:'RAW',arrival_date:'',production_date:'',expiry_date:''}));
context.calculateFifoSnapshots_=history=>{
  assert.equal(history.length,601);
  history[0].fifoUsageLots=[{qty:2,sourceDate:'2026-06-20',productionDate:'2026-06-19',expiryDate:'2026-11-01'}];
};
const expanded=context.expandMockRecallWipUsageLots_('BISS',[{record_id:'HISTORY-0',item_code:'RAW',event_date:'2026-09-22',qty:2}]);
assert.equal(expanded[0].source_arrival_date,'2026-06-20');

// A slow response for the previous date must not replace the newly selected date.
const elements={mockRecallDate:{value:'2026-09-21'},mockRecallRows:{innerHTML:''}};
const callbacks=[];
const ui={APP:{token:'session',outlet:'BISS',mockRecall:{items:[]}},
  byId:id=>elements[id],renderMockRecallList(){},escapeHtml:message=>String(message),
  server:(action,args,success,options)=>callbacks.push({success,options})};
vm.createContext(ui);
vm.runInContext(between(frontend,'    function loadMockRecall(){','    function renderMockRecallList('),ui);
ui.loadMockRecall();elements.mockRecallDate.value='2026-10-06';ui.loadMockRecall();
callbacks[1].success({items:[{date:'2026-10-06'}]});
callbacks[0].success({items:[{date:'2026-09-21'}]});
assert.equal(ui.APP.mockRecall.items[0].date,'2026-10-06');
callbacks[0].options.onError('Old request failed');
assert.equal(elements.mockRecallRows.innerHTML.includes('Old request failed'),false);

console.log('OK: Mock Recall uses paginated Cloudflare history before/after September 21, preserves batches, and rejects stale date responses.');
