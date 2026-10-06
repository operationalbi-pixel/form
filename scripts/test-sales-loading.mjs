import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const backend=await readFile('gas/Code.gs','utf8');
const html=await readFile('docs/sales-analysis.html','utf8');
function between(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}

// The cached dashboard path must not open a spreadsheet or scan transactions.
const cached={year:2026,monthNumber:10,targets:{BISS:1000}};
const warm={Date,Number,TZ:'Asia/Jakarta',
  validateSession_:()=>({outlet_code:'BISS',outlet_name:'Outlet',role:'store'}),
  cacheKeyDashboard_:()=> 'key',getCacheJson_:()=>({...cached}),
  Utilities:{formatDate:()=> '2026-10-06'},
  bqIsAvailable_:()=>{throw Error('Unexpected table availability scan');},
  readConfig_:()=>{throw Error('Unexpected cold dashboard build');}};
vm.createContext(warm);
vm.runInContext(between(backend,'function getMonthDashboard(token,','function getMonthDashboardSheet_('),warm);
const dash=warm.getMonthDashboard('session',2026,10,'OTHER');
assert.equal(dash.fromCache,true);
assert.equal(dash.user.outlet_code,'BISS');

// Availability validates headers only, even with years of history.
let cells=0,opens=0;
const headers=['outlet_code','date','year','month','week','day_of_week','sales','analisa_harian','analisa_status','submitted_by','submitted_at','updated_at'];
const sheet={getLastRow:()=>100001,getLastColumn:()=>12,getRange:(r,c,h,w)=>({getValues:()=>{cells+=h*w;assert.equal(r,1);assert.equal(h,1);return [headers];}})};
const availability={SHEET_ID:'database',SpreadsheetApp:{openById:()=>{opens++;return {getSheetByName:()=>sheet};}},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},Logger:{log(){}}};
vm.createContext(availability);
vm.runInContext(between(backend,'const SALES_SHEET_TABS =','function bqFetchDailyRows_('),availability);
assert.equal(availability.bqIsAvailable_(),true);
assert.equal(availability.bqIsAvailable_(),true);
assert.equal(cells,24,'availability never reads the 100000 transaction rows');
assert.equal(opens,1,'reuse the spreadsheet handle within the request');

// Employee cache contains a row pointer, never a cached status or outlet.
const employeeRows=Array.from({length:1001},(_,i)=>[i?'EMP'+i:'NIK','Employee','BISS','','Server','','','','active','','','']);
employeeRows[600][0]=' S T A F F ';
let employeeCells=0;
const pointers=new Map();
const empSheet={getLastRow:()=>employeeRows.length,getRange:(r,c,h,w)=>({getDisplayValues:()=>{employeeCells+=h*w;return employeeRows.slice(r-1,r-1+h).map(row=>row.slice(c-1,c-1+w));}})};
const auth={CONFIG:{EMP_SHEET:'EMP_LIST'},getSpreadsheet_:()=>({getSheetByName:()=>empSheet}),
  CacheService:{getScriptCache:()=>({get:k=>pointers.get(k),put:(k,v)=>pointers.set(k,v)})},
  normalizeNik_:v=>String(v||'').trim().toUpperCase().replace(/\s+/g,''),normalizeEmployeePosition_:v=>v};
vm.createContext(auth);
vm.runInContext(between(backend,'function salesAnalysisEmployee_(','function salesAnalysisContext_('),auth);
assert.equal(auth.salesAnalysisEmployee_('STAFF').row,601);
assert.equal(employeeCells,1012,'cold lookup reads NIK column plus one employee');
employeeCells=0;employeeRows[600][2]='BIPS';employeeRows[600][8]='resign';
let employee=auth.salesAnalysisEmployee_('STAFF');
assert.equal(employeeCells,12);
assert.equal(employee.outlet,'BIPS');assert.equal(employee.status,'resign','revocation remains live on a warm lookup');
employeeRows[600][0]='OTHER';employeeRows[800][0]='STAFF';
employee=auth.salesAnalysisEmployee_('STAFF');
assert.equal(employee.row,801,'moved employee invalidates the pointer');

// Optional bootstrap dashboard reuses one authenticated context; old callers work.
let contexts=0,dashboardCalls=0;
const boot={Number,safe_:fn=>fn(),salesAnalysisContext_:()=>{contexts++;return {session:{token:'internal',role:'store',outlet_code:'BISS'},outlets:[]};},
 SALES_ANALYSIS:{getBootstrap:()=>({brand:'Bakerzin'}),getMonthDashboard:(token,y,m,outlet)=>{dashboardCalls++;assert.equal(token,'internal');assert.equal(outlet,'BISS');return {year:y,monthNumber:m};}}};
vm.createContext(boot);vm.runInContext(between(backend,'function getSalesAnalysisBootstrap(','function getSalesAnalysisDashboard('),boot);
assert.equal(boot.getSalesAnalysisBootstrap('session',2026,10).dashboard.monthNumber,10);
assert.equal(contexts,1);assert.equal(dashboardCalls,1);
assert.equal(boot.getSalesAnalysisBootstrap('session').dashboard,undefined);
assert.throws(()=>boot.getSalesAnalysisBootstrap('session',2026,13),/Periode/);

// New dashboard responses eliminate the separate targets request; old servers fall back.
const calls=[];
const elements=new Map();
const ui={state:{year:2026,month:10,outletFilter:'BISS',targetsCache:{}},session:{token:'session'},salesSavePending:false,monthLoadId:0,
  document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{classList:{add(){},remove(){}},textContent:''});return elements.get(id);}},
  pad2:v=>String(v).padStart(2,'0'),showLoader(){},render(){},toast(){},
  call:async fn=>{calls.push(fn);return fn==='getMonthDashboard'?{targets:{BISS:1200},defaultTarget:1000}:{targets:{BISS:1300},defaultTarget:1000};}};
vm.createContext(ui);vm.runInContext(between(html,'async function loadMonth(','function refreshMonthInBackground('),ui);
await ui.loadMonth(2026,10);
assert.deepEqual(calls,['getMonthDashboard']);assert.equal(ui.state.targetsCache['2026-10'].BISS,1200);
ui.state.targetsCache={};calls.length=0;
ui.call=async fn=>{calls.push(fn);return fn==='getMonthDashboard'?{}:{targets:{BISS:1300},defaultTarget:1000};};
await ui.loadMonth(2026,10);
assert.deepEqual(calls,['getMonthDashboard','getTargets']);assert.equal(ui.state.targetsCache['2026-10'].BISS,1300);

// Boot renders its bundled dashboard without issuing another dashboard request.
let loads=0,renders=0;
const entry={...ui,BOOT:{outlets:[]},today:new Date('2026-10-06'),ID_DOW_SHORT:Array(7).fill('D'),ID_MONTHS_SHORT:Array(12).fill('M'),
 state:{year:2026,month:10,targetsCache:{}},session:{role:'store',outlet_code:'BISS'},
 render:()=>renders++,loadMonth:()=>loads++};
entry.document={getElementById:id=>({style:{},classList:{toggle(){}},textContent:''})};
vm.createContext(entry);vm.runInContext(between(html,'function enterApp(','async function loadMonth('),entry);
entry.enterApp({year:2026,monthNumber:10,outlet:'BISS',targets:{BISS:900},defaultTarget:0});
assert.equal(loads,0);assert.equal(renders,1);
entry.enterApp();assert.equal(loads,1,'bootstrap without bundled data remains compatible');

// Cold dashboard prepares only unique daily-row pointers for the subsequent save.
let primed;
const prime={salesSpreadsheetId_:()=> 'database',salesSheetDateKey_:v=>String(v),Logger:{log(){}},
  CacheService:{getScriptCache:()=>({putAll:entries=>primed=entries})}};
vm.createContext(prime);vm.runInContext(between(backend,'function salesSheetPrimeDailyPointers_(','function salesSheetDailyRecord_('),prime);
prime.salesSheetPrimeDailyPointers_({values:Array(100000)},[
 {outlet_code:'BISS',date:'2026-10-06',__rowNumber:99000},
 {outlet_code:'BISS',date:'2026-10-05',__rowNumber:99001},
 {outlet_code:'BISS',date:'2026-10-05',__rowNumber:99002}]);
assert.equal(Object.keys(primed).length,1,'duplicate dates do not prime an unsafe pointer');
assert.deepEqual(JSON.parse(primed['sales-daily-row:database:BISS:2026-10-06']),{row:99000,lastRow:100001});

console.log('OK: Sales Analysis bundles startup, avoids cache-path table scans, reuses Sheet handles, and reads employee status live.');
