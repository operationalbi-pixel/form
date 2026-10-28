import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
process.env.TZ='UTC';
const backend=fs.readFileSync('gas/Code.gs','utf8'),html=fs.readFileSync('docs/sales-analysis.html','utf8');
function section(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
const helpers=section(backend,'function salesAnalysisOutletClosures_()', 'const SALES_ANALYSIS =');
const outlets=[{code:'BIHQ',role:'admin'},{code:'BILW',name:'Living World',role:'store'},{code:'BISS',name:'Senayan Park',role:'store'}];
const records=[['BILW','2026-10-31',100],['BILW','2026-11-01',999],['BISS','2026-10-31',200],['BISS','2026-11-01',300]].map(([outlet_code,date,sales])=>({outlet_code,date,sales}));
const dateKey=d=>d.toISOString().slice(0,10);
const ctx={Date,console,OUTLETS:outlets,TZ:'Asia/Jakarta',salesSpreadsheetId_:()=> 'test',
 validateSession_:()=>({outlet_code:'BIHQ',role:'admin'}),cacheKeyDashboard_:()=> 'key',getCacheJson_:()=>null,putCacheJson_(){},
 Utilities:{formatDate:(d)=>dateKey(d)},readConfig_:()=>({monthly_target:0}),
 bqFetchDailyRows_:(codes,start,end)=>records.filter(r=>codes.includes(r.outlet_code)&&r.date>=dateKey(start)&&r.date<=dateKey(end)),
 bqFetchWeeklyRows_:()=>[],bqFetchMonthlyRows_:()=>[],bqGetTargetsMap_:()=>({BILW:1000,BISS:2000}),
 bqGetDailyTargetsByDate_:(codes,y,m)=>Object.fromEntries(Array.from({length:31},(_,i)=>[`${y}-${String(m).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,Object.fromEntries(codes.map(c=>[c,10]))])),
 bqFetchGlobalDailyRows_:()=>[],defaultGlobalDailyAnalysis_:()=>({items:[]}),weekOfMonth_:d=>Math.ceil(d.getDate()/7),
 outletName_:c=>c,dateKey_:dateKey,pad2_:n=>String(n).padStart(2,'0'),salesSheetDateKey_:x=>x,
 salesSheetTable_:()=>({rows:records}),salesSheetLatest_:rows=>rows};
vm.createContext(ctx);
vm.runInContext(helpers+section(backend,'function getMonthDashboard(token,','function getMonthDashboardSheet_(')+section(backend,'function sumSalesByDateRange_(', 'function bqFetchDailyRows_(')+section(backend.slice(backend.indexOf('const SALES_SHEET_TABS =')),'function bqFetchComparisonSums_(', 'function bqFetchGlobalDailyRows_('),ctx);
for(const [y,m,expected] of [[2026,10,true],[2026,11,false],[2026,12,false],[2027,1,false],[2025,11,true]]){
 assert.equal(ctx.salesAnalysisOutletActive_('BILW',y,m),expected);
 assert.equal(ctx.salesAnalysisOutletActive_('BISS',y,m),true);
}
const oct=ctx.getMonthDashboard('token',2026,10,'ALL');
assert.equal(oct.month.total,300);assert.equal(oct.perOutlet.length,2);assert.equal(oct.targets.BILW,1000);
const nov=ctx.getMonthDashboard('token',2026,11,'ALL');
assert.equal(nov.month.total,300);assert.equal(nov.monthTarget,2000);assert.equal(nov.perOutlet.length,1);
assert.equal(nov.targets.BILW,undefined);assert.ok(nov.days.every(d=>d.contributors.every(c=>c.outlet!=='BILW')));
assert.equal(nov.ytdTotal,600,'YTD retains pre-closure BILW sales and excludes post-closure records');
assert.equal(ctx.getMonthDashboard('token',2026,11,'BILW').perOutlet.length,0,'stale direct filters cannot include the closed outlet');
assert.equal(ctx.getMonthDashboard('token',2026,10,'ALL').month.total,300,'returning to October retains history');
// Daily Report excludes a closed outlet even when its old target/sales still exist.
Object.assign(ctx,{salesAnalysisCanonicalOutletCode_:s=>s,bqIsAvailable_:()=>true,parseDateKey_:s=>new Date(s+'T00:00:00Z'),
 bqGetDailyReportSales_:codes=>Object.fromEntries(codes.map(c=>[c,{dailySales:c==='BILW'?999:300,mtdSales:300}])),
 bqGetDailyTargetProgress_:(codes,y,m,d)=>Object.fromEntries(codes.map(c=>[c,{mtdTarget:10,targetDays:d}])),
 Logger:{log(){}}});
ctx.Utilities.formatDate=(d)=>d.getFullYear()>=2026&&dateKey(d)===dateKey(new Date())?'2027-12-31':dateKey(d);
vm.runInContext(section(backend,'function reportIntegerId_(', 'function syncOutlets_('),ctx);
const report=ctx.getDailyReport('token','2026-11-01',outlets);
assert.equal(report.ok,true,report.error);assert.deepEqual(Array.from(report.rows,r=>r.outlet),['BISS']);assert.ok(!report.text.includes('BILW'));
// Older target templates may still contain BILW: ignore its column only after closure.
const cells={A1:'Input Sales',A2:'Target',B1:'BILW',B2:310,C1:'BISS',C2:310};
for(let d=1;d<=31;d++){cells['A'+(d+2)]=d;cells['B'+(d+2)]=10;cells['C'+(d+2)]=10;}
Object.assign(ctx,{extractReportCells_:()=>cells,xlsxColumn_:n=>n<=26?String.fromCharCode(64+n):'X'+n,parseReportNumber_:Number,salesAnalysisCanonicalOutletCode_:s=>s});
vm.runInContext(section(backend,'function parseDailyTargetWorkbook_(', 'function uploadDailyTargets('),ctx);
cells.C2=300;
const parsed=ctx.parseDailyTargetWorkbook_('','',2026,11,outlets);
assert.deepEqual(Array.from(parsed.uploadedOutlets),['BISS']);assert.equal(parsed.rows.length,30);assert.equal(parsed.missingOutlets.length,0);
cells.C2=310;
assert.equal(ctx.parseDailyTargetWorkbook_('','',2026,10,outlets).uploadedOutlets.length,2);
// Real frontend picker logic preserves history and resets a stale BILW selection.
const nodes={outletFilter:{options:[],replaceChildren(){this.options=[];},append(o){this.options.push(o);}}};
const ui={BOOT:{outlets:outlets.map(o=>({...o,closedFrom:o.code==='BILW'?'2026-11-01':''}))},state:{year:2026,month:10,outletFilter:'BILW',hqOutletAna:'BILW'},session:{role:'admin'},document:{getElementById:id=>nodes[id],createElement:()=>({})}};
vm.createContext(ui);vm.runInContext(section(html,'function salesOutlets(', '/* ENTER APP */'),ui);
ui.refreshSalesOutletPickers();assert.equal(nodes.outletFilter.options.length,3);
ui.state.month=11;ui.refreshSalesOutletPickers();assert.equal(ui.state.outletFilter,'ALL');assert.equal(ui.state.hqOutletAna,'BISS');assert.equal(nodes.outletFilter.options.length,2);
ui.state.month=10;ui.refreshSalesOutletPickers();assert.equal(nodes.outletFilter.options.length,3);
assert.equal(ui.salesOutlets(2026,11).length,1);assert.equal(ui.salesOutlets(2026,10).length,2);
console.log('BILW closure: October history, November onward, totals, YTD, reports, templates, and picker navigation passed.');
