import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const ctx={console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('gas/Code.gs','utf8'),ctx);
const item={code:'CAKE',name:'Cake',unit:'PCS',active:true};
const report=[];
for(const outlet of ['BICP','BISS'])for(let day=1;day<=20;day++)for(let i=0;i<10;i++)report.push({outletName:outlet,transactionDate:'2026-10-'+String(day).padStart(2,'0'),salesNumber:outlet+'-'+day+'-'+i,menu:'Cake',product:'Cake',unit:'PCS',qty:2});
Object.assign(ctx,{
  parseSalesCogsReport_:()=>({rows:structuredClone(report),zeroRowsSkipped:0}),
  readStoreCodeDirectory_:()=>({byName:{BICP:{code:'BICP'},BISS:{code:'BISS'}}}),
  digest_:value=>createHash('sha256').update(value).digest('hex'),
  salesMappingCatalog_:()=>({}),readSalesProductMappings_:()=>({}),resolveSalesTarget_:()=>({type:'PRODUCT',target:item}),
  readStockUnitConversions_:()=>({}),readStockMaster_:()=>[item],readWipRecipeCatalog_:()=>({byCode:{}})
});
const duplicate=ctx.salesRowHash_({...report[0],outlet:'BICP'});let queries=[];
ctx.cloudflareReadAllPages_=(path,params,limit)=>{queries.push({path,params,limit});return params.outlet==='BICP'?[{outlet_code:'BICP',record_id:'saved',logical_id:'saved',version:1,event_date:'2026-10-01',movement_type:'Sold',source_hash:duplicate}]:[]};
const result=ctx.prepareSalesCogsImport_({outlet:'BIHQ'},{fileName:'sales.xlsx',base64:'file'},true);
assert.equal(result.rows.length,399);assert.equal(result.duplicateRowsSkipped,1);
assert.equal(queries.length,2,'40 outlet/date scopes share two bounded outlet-period reads');
for(const query of queries){assert.equal(query.params.from,'2026-10-01');assert.equal(query.params.to,'2026-10-20');assert.equal(query.params.resolve_scope,1);assert.equal(query.params.movement_type,'Sold');assert.equal(query.limit,200);}
queries=[];const repair=ctx.prepareSalesCogsImport_({outlet:'BIHQ'},{fileName:'sales.xlsx',base64:'file'},true,{includeExisting:true});
assert.equal(repair.rows.length,400);assert.equal(queries.length,0,'authorized repair keeps its include-existing behavior');
assert.throws(()=>ctx.prepareSalesCogsImport_({outlet:'BICP'},{fileName:'sales.xlsx',base64:'file'},true),/bukan outlet login/);
queries=[];assert.equal(ctx.existingSalesRowHashes_('BICP','2026-10-01')[duplicate],true);assert.equal(queries[0].params.to,'2026-10-01');

const html=fs.readFileSync('docs/stock-card.html','utf8');
function extract(a,b){return html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)+a.length));}
const elements=new Map();function byId(id){if(!elements.has(id))elements.set(id,{classList:{add(){},remove(){}},style:{width:'35%'},textContent:'',disabled:false});return elements.get(id);}
let timers=new Map(),callbacks=[],handled=0,labels=[],toasts=[];
const ui={APP:{token:'token',usage:{}},Date,byId,usagePayload:()=>({}),setUsageProgress:(p,label)=>labels.push(label),
  setInterval:fn=>{timers.set(1,fn);return 1},clearInterval:id=>timers.delete(id),clearTimeout(){},forgetUsageJob(){},
  server:(name,args,success,options)=>callbacks.push({success,options}),handleUsageVerification:()=>handled++,toast:text=>toasts.push(text)};
vm.createContext(ui);vm.runInContext(extract('    function requestUsageVerification()','    function handleUsageVerification('),ui);
vm.runInContext(extract('    function usageUploadError(','    function pollUsageUploadJob('),ui);
ui.requestUsageVerification();timers.get(1)();assert.match(labels.at(-1),/Durasi/);
ui.requestUsageVerification();callbacks[0].success({});assert.equal(handled,0,'older verification reply cannot enable Save');
callbacks[1].success({});assert.equal(handled,1);assert.equal(timers.size,0);
ui.requestUsageVerification();callbacks[2].options.onError('Server tidak merespons dalam 5 menit.');
assert.equal(timers.size,0);assert.equal(ui.APP.usage.verified,false);assert.equal(byId('confirmUsageUpload').disabled,true);
assert.doesNotMatch(byId('usageErrorMessage').textContent,/background tetap berjalan|Job background/,'verification timeout must not claim an accepted background job');
assert.match(labels.at(-1),/Verifikasi belum selesai/);
ui.APP.usage={jobId:'accepted',uploading:true};ui.usageUploadError('timeout');assert.match(byId('usageErrorMessage').textContent,/Job background tidak dibatalkan/,'accepted job status remains recoverable');
console.log('COGS duplicate verification batches outlet periods, preserves repair/access rules, and distinguishes pre-upload timeouts from accepted jobs.');
