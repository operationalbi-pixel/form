import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const backend = await readFile('gas/Code.gs', 'utf8');
const html = await readFile('docs/sales-analysis.html', 'utf8');
function between(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Source section exists: ${start}`);
  return source.slice(first, last);
}

// Execute the real Sheet helpers and save API against an in-memory Sheet.
const headers = ['outlet_code','date','year','month','week','day_of_week','sales','analisa_harian','analisa_status','submitted_by','submitted_at','updated_at'];
const rows = [headers];
const events = [];
const rowCache = new Map();
let readCells=0;
let onAcquire = () => {};
const sheet = {
  getLastRow: () => rows.length,
  getLastColumn: () => headers.length,
  getRange(row, column, height, width) {
    return {
      getValues: () => {readCells+=height*width;return rows.slice(row - 1, row - 1 + height).map(value => value.slice(column - 1, column - 1 + width));},
      setValues(values) {
        events.push('write');
        values.forEach((value, index) => { rows[row - 1 + index] = value.slice(); });
      }
    };
  }
};
const spreadsheet = { getSheetByName: () => sheet };
const server = {
  Date, console, SHEET_ID: 'test-sheet',
  CacheService: {getScriptCache:()=>({get:key=>rowCache.get(key),put:(key,value)=>rowCache.set(key,value),remove:key=>rowCache.delete(key)})},
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
  SpreadsheetApp: { openById: () => spreadsheet, flush: () => events.push('flush') },
  LockService: { getScriptLock: () => ({ waitLock: () => { events.push('lock'); onAcquire(); }, releaseLock: () => events.push('release') }) },
  clearDashboardCache_: () => events.push('invalidate'),
  dateKeyFromCell_: value => String(value).slice(0, 10),
  parseDateKey_: value => new Date(value + 'T00:00:00'),
  dateKey_: value => value.toISOString().slice(0, 10),
  weekOfMonth_: () => 2, dowName_: () => 'Sel',
  readConfig_: () => ({ min_analysis_chars: 20 }),
  validateSession_: () => ({ outlet_code: 'BISS', role: 'store' }),
  Logger: { log() {} }, audit_() {}
};
vm.createContext(server);
vm.runInContext(
  between(backend, 'const SALES_SHEET_TABS =', 'function bqFetchDailyRows_(') +
  between(backend, 'function salesSheetDailyRecord_(', 'function bqSyncWeekly_(oc,periodKey,') +
  between(backend, 'function saveDaily(token, payload)', 'function saveGlobalDailyAnalysis(token, payload)'), server
);
function sheetRecord() {
  return Object.fromEntries(headers.map((name, index) => [name, rows[1][index]]));
}
function existingRecord(sales, analysis) {
  return headers.map(name => ({ outlet_code:'BISS', date:'2026-10-06', sales, analisa_harian:analysis, updated_at:new Date() })[name] ?? '');
}

// Another execution inserts the day while this request is waiting for the lock.
server.bqIsAvailable_();
onAcquire = () => { rows[1] = existingRecord(900, 'Analysis from the other request'); onAcquire = () => {}; };
const analysis = 'New daily analysis entered by the employee';
let saved = server.saveDaily('session', { date:'2026-10-06', analisa:analysis });
assert.equal(saved.ok, true);
assert.equal(rows.length, 2, 'a read before the lock must not create a duplicate day');
assert.equal(saved.sales, 900, 'analysis-only saves preserve the latest sales');
assert.equal(sheetRecord().analisa_harian, analysis);
assert.deepEqual(events.slice(-4), ['write','flush','invalidate','release'], 'flush and invalidate before releasing the writer lock');

saved = server.saveDaily('session', { date:'2026-10-06', sales:1200 });
assert.equal(saved.ok, true);
assert.equal(saved.analisa, analysis, 'sales-only saves preserve the latest analysis');
assert.equal(sheetRecord().sales, 1200);
saved = server.saveDaily('session', {date:'2026-10-06',sales:100,analisa:'Updated analysis with a stale sales snapshot',preserveSales:true});
assert.equal(saved.sales,1200,'compatibility sales snapshot must not overwrite the current sales');
saved = server.saveDaily('session', {date:'2026-10-06',sales:1400,analisa:'Stale analysis snapshot',preserveAnalysis:true});
assert.equal(saved.analisa,'Updated analysis with a stale sales snapshot','compatibility analysis snapshot must not overwrite the current analysis');
saved = server.saveDaily('session', { date:'2026-10-06', sales:0, analisa:'' });
assert.equal(saved.sales, 0, 'an explicit zero is saved');
assert.equal(saved.analisa, '', 'an explicit empty analysis is saved');
assert.equal(saved.status, 'pending');
assert.equal(server.saveDaily('session', { date:'2026-10-06', sales:'invalid' }).ok, false);

// Saving an existing date in a large table reads only headers and that row once warmed.
for(let index=0;index<1000;index++) rows.push(headers.map(name=>({outlet_code:'OTHER',date:'2026-01-01',sales:index})[name]??''));
server.saveDaily('session',{date:'2026-10-06',sales:1500});
readCells=0;
server.saveDaily('session',{date:'2026-10-06',analisa:analysis});
assert.equal(readCells,headers.length*3,'warm save reads two header rows and the matching daily row, not the full table');
const latestDuplicate=existingRecord(3000,'Newer duplicate');
latestDuplicate[headers.indexOf('updated_at')]=new Date(Date.now()+1000);
rows.push(latestDuplicate);
saved=server.saveDaily('session',{date:'2026-10-06',analisa:analysis});
assert.equal(saved.sales,3000,'an inserted row invalidates the cached row pointer and preserves the newest duplicate');
assert.equal(rows.length,1003,'duplicate legacy data is updated without appending another row');

const periodReads=[];
const periodServer={Date,Number,
  dateKey_:date=>date.toISOString().slice(0,10),
  bqFetchDailyRows_:(outlets,start,end)=>{periodReads.push({outlets,start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)});return [{sales:100},{sales:250}];},
  bqGetTargetsMap_:()=>({BISS:1000})};
vm.createContext(periodServer);
vm.runInContext(between(backend,'function salesPeriodSummary_(','function saveWeekly('),periodServer);
let summary=periodServer.salesPeriodSummary_('BISS',2026,10,1);
assert.equal(summary.start,'2026-09-28');assert.equal(summary.end,'2026-10-04');
assert.equal(summary.total,350,'weekly totals include days across the month boundary');
summary=periodServer.salesPeriodSummary_('BISS',2026,10,5);
assert.equal(summary.start,'2026-10-26');assert.equal(summary.end,'2026-11-01');
summary=periodServer.salesPeriodSummary_('BISS',2026,10);
assert.equal(summary.start,'2026-10-01');assert.equal(summary.end,'2026-10-31');
assert.equal(summary.target,1000);assert.equal(summary.pct,35);
assert.throws(()=>periodServer.salesPeriodSummary_('BISS',2026,10,6),/Minggu analisa tidak valid/);
const periodWrites=[];
Object.assign(periodServer,{
  validateSession_:()=>({outlet_code:'BISS',role:'store'}),readConfig_:()=>({min_analysis_chars:20}),
  pad2_:value=>String(value).padStart(2,'0'),
  getMonthDashboard:()=>{throw new Error('Saving must not rebuild the dashboard');},
  bqIsAvailable_:()=>{throw new Error('Saving must not scan the daily table twice');},
  bqSyncWeekly_:(...args)=>periodWrites.push({scope:'week',args}),
  bqSyncMonthly_:(...args)=>periodWrites.push({scope:'month',args}),
  audit_(){},clearDashboardCache_(){},Logger:{log(){}}
});
vm.runInContext(between(backend,'function saveWeekly(token, payload)','/* ============================================================\r\n *  HELPERS'),periodServer);
assert.equal(periodServer.saveWeekly('session',{year:2026,month:10,week:1,analisa:analysis}).ok,true);
assert.equal(periodWrites[0].args[5],'2026-09-28');
assert.equal(periodWrites[0].args[6],'2026-10-04');
assert.equal(periodWrites[0].args[7],350);
assert.equal(periodServer.saveMonthly('session',{year:2026,month:10,analisa:analysis}).ok,true);
assert.equal(periodWrites[1].args[4],350);
assert.equal(periodWrites[1].args[5],1000);
assert.equal(periodWrites[1].args[6],35);
periodServer.validateSession_=()=>({outlet_code:'BIHQ',role:'admin'});
assert.equal(periodServer.saveWeekly('session',{year:2026,month:10,week:1,analisa:analysis}).ok,false);
assert.equal(periodWrites.length,2,'HQ cannot submit an outlet analysis through the fast save path');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function dashboard() {
  return { daysInMonth:31, isAggregate:false, ytdTotal:100,
    days:Array.from({length:31}, (_, index) => ({day:index+1,week:2,sales:index===5?100:0,daily:{text:index===5?'Old saved analysis':'',status:'pending'}})),
    weeks:[{w:2,total:100,status:'pending'}], month:{total:100,target:1000,pct:10,status:'pending'} };
}
const elements = new Map();
const handlers = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, { value:'', style:{}, dataset:{}, classList:{add(){},remove(){},toggle(){}},
    addEventListener(type, callback) { handlers.set(`${id}:${type}`, callback); } });
  return elements.get(id);
}
const calls = [];
const messages = [];
const storage=new Map();
const timers=new Map();let timerId=0;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const client = {
  dailyReportCopyCache:new Map(),dailyReportDataVersion:0,console, Map, Object, JSON, Promise,navigator:{onLine:true},
  window:{addEventListener(){}},
  localStorage:{getItem:key=>key==='bakerzin_session'?'account':storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
  document: { getElementById: element,querySelectorAll:()=>[] },
  state: {year:2026,month:10,day:6,scope:'day',outletFilter:'BISS',dash:dashboard(),targetsCache:{'2026-10':{}},defaultTarget:0},
  session: {role:'store',outlet_code:'BISS',token:'session'},
  pad2: value => String(value).padStart(2,'0'),
  fmtIDR: value => String(value), fmtShort: value => String(value),
  ID_MONTHS_LONG:Array(12).fill('Month'), ID_MONTHS_SHORT:Array(12).fill('M'),
  ID_DOW_LONG:Array(7).fill('Day'), ID_DOW_SHORT:Array(7).fill('D'),
  weekOfYear: () => 41, parseDateKey: value => new Date(value),
  setDelta(){},renderStatement(){},renderHQDetail(){},renderCalendar(){},
  showLoader(){}, toast: (message, error) => messages.push({message,error}),
  formatIDRInputElement(){}, TEMPLATE_TEXT:'Template analysis',
  call: (fn, ...args) => { const pending=deferred(); calls.push({fn,args,...pending}); return pending.promise; }
};
vm.createContext(client);
vm.runInContext(await readFile('docs/sales-realtime.js','utf8'),client);client.SalesRealtime=client.window.SalesRealtime;
vm.runInContext(
  between(html, 'let monthLoadId =', 'const fmtIDR =') +
  between(html, 'function salesOutlets(', '/* ENTER APP */') +
  between(html, 'async function loadMonth(', '/* target cache helpers */') +
  between(html, 'function render(){', 'function setDelta(') +
  between(html, 'function getAnalisaTextForCurrent(){', 'function renderStatement(') +
  between(html, "document.getElementById('anaBox').addEventListener('input'", '/* ============= DAY DETAIL MODAL') +
  between(html,'function updateModalSalesConfirmation(', 'function escapeHtml('), client
);
vm.runInContext("refreshMonthInBackground = function(){}; startSalesRealtime('account');", client);
const click = async id => {const operation=handlers.get(`${id}:click`)();await tick();return operation;};
function input(id, value) {
  element(id).value=value;
  handlers.get(`${id}:input`)({target:element(id)});
}
client.render();
input('anaBox', analysis);
input('dayAmount', '1250');
let saving = click('saveDay');await tick();
assert.equal(calls[0].args[1].analisa, analysis, 'Simpan persists the visible daily analysis');
assert.equal(calls[0].args[1].sales, 1250);
void click('saveDay');await tick();
assert.equal(calls.length, 1, 'repeated clicks do not create another save');
calls[0].resolve({ok:true,sales:1250,analisa:analysis,status:'done'});
await saving;
assert.equal(client.state.dash.days[5].daily.text, analysis);
assert.equal(element('anaBox').value, analysis);
assert.equal(client.state.dash.weeks[0].total, 1250);
assert.equal(client.state.dash.month.total, 1250);

input('anaBox', 'Draft that must survive a failed save');
saving = click('saveDay');await tick();
calls.at(-1).reject(new Error('Database permission denied'));
await saving;
client.render();
assert.equal(element('anaBox').value, 'Draft that must survive a failed save');
assert.match(element('savedAt').title, /Database permission denied/, 'retain error details on the inline status');

input('anaBox',analysis);
saving=click('saveDay');await tick();
calls.at(-1).resolve({ok:true,sales:1250,analisa:analysis,status:'done'});await saving;

client.state.scope='week';
client.render();
input('anaBox', 'Unsubmitted weekly analysis must remain');
input('dayAmount', '1500');
saving = click('saveDay');await tick();
assert.equal(calls.at(-1).args[1].analisa, undefined, 'weekly text must not overwrite daily analysis');
assert.equal(calls.at(-1).args[1].sales,1500,'sales-only save sends only the edited field');
calls.at(-1).resolve({ok:true,sales:1500,analisa:analysis,status:'done'});
await saving;
assert.equal(element('anaBox').value, 'Unsubmitted weekly analysis must remain');

client.state.scope='day'; client.render();
input('anaBox', analysis);
saving=click('submitBtn');await tick();
assert.equal(calls.at(-1).args[1].sales, undefined, 'analysis submit must not overwrite concurrent sales with the dashboard value');
calls.at(-1).resolve({ok:true,sales:2000,analisa:analysis,status:'done'});
await saving;
assert.equal(element('dayAmount').value, '2000');

// An older dashboard response cannot erase a save or a more recent load.
const olderLoad=client.loadMonth(2026,10,true);
const olderCall=calls.at(-1);
input('anaBox', 'Analysis written while an earlier refresh is running');
saving=click('saveDay');await tick();
const saveCall=calls.at(-1);
saveCall.resolve({ok:true,sales:2000,analisa:'Analysis written while an earlier refresh is running',status:'done'});
await saving;
olderCall.resolve(dashboard());
await olderLoad;
assert.equal(element('anaBox').value, 'Analysis written while an earlier refresh is running');
const firstLoad=client.loadMonth(2026,10,true), firstCall=calls.at(-1);
const secondLoad=client.loadMonth(2026,10,true), secondCall=calls.at(-1);
const latest=dashboard(); latest.days[5].daily.text='Latest server result';
secondCall.resolve(latest); await secondLoad;
firstCall.resolve(dashboard()); await firstLoad;
assert.equal(element('anaBox').value, 'Latest server result');

// Refreshing while typing preserves the draft; only its own successful save clears it.
input('anaBox', 'Unsaved draft during background refresh');
const refresh=client.loadMonth(2026,10,true);
calls.at(-1).resolve(dashboard()); await refresh;
assert.equal(element('anaBox').value, 'Unsaved draft during background refresh');
console.log('OK: Sales saves persist visible input, preserve partial fields and drafts, flush under lock, and ignore stale refreshes.');

// New text typed during a slow acknowledgement remains visible and unconfirmed.
input('anaBox','First text sent to the server');
saving=click('submitBtn');await tick();const firstTextCall=calls.at(-1);
input('anaBox','Latest text typed during the request');
firstTextCall.resolve({ok:true,sales:2000,analisa:'First text sent to the server',status:'done'});await saving;
assert.equal(element('anaBox').value,'Latest text typed during the request');
assert.equal(client.state.dash.days[5].daily.text,'First text sent to the server','panel model contains only confirmed text');
// No mouse click is needed: the debounce sends the latest draft, never the intermediate one.
const callbacks=[...timers.values()];timers.clear();for(const fn of callbacks)fn();await tick();
const automaticCall=calls.find(call=>call.fn==='saveDaily'&&call.args[1].analisa==='Latest text typed during the request');
assert.ok(automaticCall,'latest daily draft is automatically saved');
automaticCall.resolve({ok:true,sales:2000,analisa:'Latest text typed during the request',status:'done'});await tick();
assert.equal(client.state.dash.days[5].daily.text,'Latest text typed during the request');

// Old outbox entries become reviewed drafts, never another queue or silent replay.
client.fmtIDRInput=value=>String(value??'');
client.BAKERZIN_API={call:async(action,args)=>{assert.equal(action,'salesSaveJobs');return {ok:true,data:{jobs:[]}};}};
const oldSnapshot={year:2026,month:10,day:6,outlet:'ALL',scope:'day'};
const legacyEntry=(id,payload)=>({requestId:id,fn:'saveDaily',payload:{outlet_code:'BISS',date:'2026-10-06',...payload},snapshot:oldSnapshot});
storage.clear();
storage.set('sales-save-outbox-v1:account',JSON.stringify([
  legacyEntry('old1',{sales:100}),legacyEntry('old2',{sales:200,analisa:'Old text'}),legacyEntry('old3',{analisa:'Newest text',preserveSales:true})
]));
vm.runInContext("startSalesRealtime('account');",client);
await client.recoverSalesLegacyDrafts('account');
let recovered=JSON.parse(storage.get('sales-editor-drafts-v2:account'));
assert.equal(recovered.length,1);assert.equal(recovered[0][1].payload.sales,200);assert.equal(recovered[0][1].payload.analisa,'Newest text');
assert.equal(recovered[0][1].snapshot.outlet,'BISS','HQ modal drafts retain their actual target outlet');
assert.equal(recovered[0][1].snapshot.salesInput,'200');assert.equal(JSON.parse(storage.get('sales-save-outbox-v1:account')).length,0);
assert.equal(vm.runInContext('salesRealtime.busy()',client),false,'recovered drafts are not submitted without review');
storage.clear();storage.set('sales-save-outbox-v1:account',JSON.stringify([legacyEntry('old1',{sales:100}),legacyEntry('old2',{sales:200})]));
client.BAKERZIN_API.call=async()=>({ok:true,data:{jobs:[{requestId:'old2',status:'COMPLETE'}]}});
vm.runInContext("startSalesRealtime('account');",client);await client.recoverSalesLegacyDrafts('account');
assert.equal(vm.runInContext('salesRealtime.hasDrafts()',client),false,'older local snapshots cannot resurrect over a newer completed legacy write');

client.render();input('dayAmount','0');saving=click('saveDay');await tick();
calls.at(-1).resolve({ok:true,sales:0,analisa:'Saved analysis with an explicit zero',status:'done'});await saving;
assert.equal(element('dayAmount').value,'0','confirmed zero remains visible instead of looking like a cleared unsaved field');

// A lost reply can be retried, while an older tab cannot overwrite a newer value.
let guardResult=server.saveDaily('session',{date:'2026-10-06',sales:3100,expected:{sales:3000}});
assert.equal(guardResult.ok,true);
server.saveDaily('session',{date:'2026-10-06',sales:3200});
let writeCount=events.filter(e=>e==='write').length;
guardResult=server.saveDaily('session',{date:'2026-10-06',sales:3100,expected:{sales:3000}});
assert.equal(guardResult.ok,false);assert.match(guardResult.error,/SAVE_CONFLICT/);assert.equal(events.filter(e=>e==='write').length,writeCount);
guardResult=server.saveDaily('session',{date:'2026-10-06',sales:3300,expected:{sales:3200}});assert.equal(guardResult.ok,true);
writeCount=events.filter(e=>e==='write').length;
guardResult=server.saveDaily('session',{date:'2026-10-06',sales:3300,expected:{sales:3200}});
assert.equal(guardResult.ok,true,'lost acknowledgement confirms an already committed absolute value');assert.equal(events.filter(e=>e==='write').length,writeCount,'same-value retry does not write a duplicate');
const analysisBefore=guardResult.analisa;
guardResult=server.saveDaily('session',{date:'2026-10-06',analisa:'Independent new analysis',expected:{analisa:analysisBefore,sales:100}});
assert.equal(guardResult.ok,true,'concurrent sales changes do not block an analysis-only edit');assert.equal(guardResult.sales,3300);
const periodGuard={salesSheetLatest_:rows=>rows,salesSheetTable_:()=>({rows:[{period_key:'period',analisa_mingguan:'Newer week',analisa_bulanan:'Newer month'}]})};
vm.createContext(periodGuard);vm.runInContext(between(backend,'function salesSheetCheckAnalysis_(', 'function bqSyncWeekly_(oc,periodKey'),periodGuard);
assert.throws(()=>periodGuard.salesSheetCheckAnalysis_('weekly_analysis','period','analisa_mingguan','My week',{analisa:'Old week'}),/SAVE_CONFLICT/);
periodGuard.salesSheetCheckAnalysis_('weekly_analysis','period','analisa_mingguan','Newer week',{analisa:'Old week'});
assert.throws(()=>periodGuard.salesSheetCheckAnalysis_('monthly_analysis','period','analisa_bulanan','My month',{analisa:'Old month'}),/SAVE_CONFLICT/);

const gateway={safe_:fn=>{try{return {ok:true,data:fn()};}catch(error){return {ok:false,error:error.message};}},salesAnalysisContext_:()=>({session:{role:'store',outlet_code:'BISS',token:'internal'}}),salesSaveDirectGuard_(){throw Error('Legacy UrlFetch must not run');},SALES_ANALYSIS:{saveDaily:()=>({ok:true}),saveWeekly:()=>({ok:true}),saveMonthly:()=>({ok:true})}};
vm.createContext(gateway);vm.runInContext(between(backend,'function saveSalesAnalysisDaily(', 'function saveSalesAnalysisGlobal('),gateway);
assert.equal(gateway.saveSalesAnalysisDaily('token',{sales:1}).ok,false,'old unguarded clients must reload before writing');
assert.equal(gateway.saveSalesAnalysisDaily('token',{sales:1,expected:{sales:0}}).ok,true);

// A retired, globally drained legacy queue needs no network lookup during draft recovery.
storage.clear();const acceptedOld={...legacyEntry('accepted',{sales:100}),jobId:'confirmed-old-job'};
storage.set('sales-save-outbox-v1:account',JSON.stringify([acceptedOld,legacyEntry('local-only',{sales:200})]));
client.BAKERZIN_API.call=async()=>assert.fail('retired legacy recovery must not invoke UrlFetch');
vm.runInContext("startSalesRealtime('account',undefined,true);",client);await client.recoverSalesLegacyDrafts('account');
assert.equal(JSON.parse(storage.get('sales-save-outbox-v1:account:retired-backup')).length,2,'original old requests remain archived before migration');
assert.equal(vm.runInContext('salesRealtime.drafts()[0][1].payload.sales',client),200,'only the unaccepted local draft needs review');

// Reproduce typing a new sales value while blur/autosave is still in flight.
storage.clear();timers.clear();client.state.dash=dashboard();client.state.scope='day';
client.state.year=2026;client.state.month=10;client.state.day=6;client.state.outletFilter='BISS';
client.state.dash.perOutlet=[{code:'BISS',total:100},{code:'BILW',total:900}];
vm.runInContext("salesEditorDrafts.clear(); startSalesRealtime('account');",client);client.render();
const firstCallIndex=calls.length;
input('dayAmount','400');handlers.get('dayAmount:blur')();await tick();
assert.equal(calls[firstCallIndex].args[1].analisa,undefined,'sales-only Save cannot overwrite untouched analysis');
input('dayAmount','500');let clickedDone=false;
const clicked=click('saveDay').then(()=>{clickedDone=true;});await tick();
calls[firstCallIndex].resolve({ok:true,sales:400,analisa:'Old saved analysis',status:'pending'});await tick();
assert.equal(clickedDone,false);assert.equal(calls.length,firstCallIndex+2);
assert.equal(calls.at(-1).args[1].sales,500);assert.equal(calls.at(-1).args[1].expected.sales,400);
assert.equal(element('dayAmount').value,'500','older confirmation never replaces the new input');
assert.equal(element('saveDay').textContent,'Menyimpan…');
client.dailyReportCopyCache.set('2026-10-07','Old MTD');
calls.at(-1).resolve({ok:true,sales:500,analisa:'Old saved analysis',status:'pending'});await clicked;
assert.equal(client.state.dash.month.total,500);assert.equal(client.state.dash.perOutlet.find(r=>r.code==='BISS').total,500);
assert.equal(element('salesAmountStatus').textContent,'Tersimpan');assert.equal(element('saveDay').textContent,'Simpan');
assert.equal(client.dailyReportCopyCache.size,0,'previously copied MTD reports are invalidated after a saved amount');
console.log('UI Save waits for the latest visible amount, updates totals/ranking, preserves untouched analysis and clears stale copied reports.');

// A report already loading before a save cannot repopulate the stale MTD cache.
const reportWaits=[],reportCache=new Map();
const reportButton={dataset:{reportDate:'2026-10-07'},classList:{remove(){}},removeAttribute(){},disabled:false,textContent:''};
const reportUi={dailyReportPrepareId:0,dailyReportDataVersion:0,dailyReportCopyCache:reportCache,session:{token:'session'},
 document:{getElementById:()=>reportButton},call:()=>new Promise(resolve=>reportWaits.push(resolve)),setDailyReportUnavailable(){assert.fail('valid report should not fail');}};
vm.createContext(reportUi);vm.runInContext(between(html,'async function prepareDailyReport(', 'function setDailyReportUnavailable('),reportUi);
const oldReport=reportUi.prepareDailyReport('2026-10-07');reportUi.dailyReportDataVersion++;
reportWaits[0]({ok:true,text:'Old MTD'});await oldReport;assert.equal(reportCache.size,0);
const currentReport=reportUi.prepareDailyReport('2026-10-07');reportWaits[1]({ok:true,text:'New MTD'});await currentReport;
assert.equal(reportCache.get('2026-10-07'),'New MTD');

// HQ's per-outlet modal uses the same explicit Save path as the store editor.
storage.clear();timers.clear();
const hqEvents=new Map();
const hqInput={value:'100',addEventListener:(name,fn)=>hqEvents.set('input:'+name,fn)};
const hqButton={textContent:'Simpan',addEventListener:(name,fn)=>hqEvents.set('button:'+name,fn)};
const hqStatus={style:{},dataset:{},textContent:''},hqSales={textContent:''};
const hqNodes={'[data-hq-sales]':hqInput,'[data-hq-save]':hqButton,'[data-hq-status]':hqStatus,'.ob-sales':hqSales};
const hqBox={dataset:{},querySelector:key=>hqNodes[key]};
client.document.createElement=()=>hqBox;client.document.querySelectorAll=()=>[hqBox];client.escapeHtml=String;client.render=()=>{};
client.session.role='admin';client.session.outlet_code='BIHQ';client.state.outletFilter='ALL';
client.state.dash=dashboard();client.state.dash.isAggregate=true;client.state.dash.days[5].contributors=[{outlet:'BISS',sales:100,text:'',status:'pending'}];
vm.runInContext("salesEditorDrafts.clear(); startSalesRealtime('account');",client);
vm.runInContext(between(html,'function renderOutletBox(', 'function updateModalSalesConfirmation('),client);
client.renderOutletBox({code:'BISS',name:'Senayan Park'},client.state.dash.days[5].contributors[0],6);
const hqFirst=calls.length;
hqInput.value='600';hqEvents.get('input:input')();hqEvents.get('input:blur')();await tick();
hqInput.value='700';hqEvents.get('input:input')();hqEvents.get('button:click')();await tick();
calls[hqFirst].resolve({ok:true,sales:600,analisa:'',status:'pending'});await tick();
assert.equal(calls.length,hqFirst+2);assert.equal(calls.at(-1).args[1].sales,700);assert.equal(hqInput.value,'700');
calls.at(-1).resolve({ok:true,sales:700,analisa:'',status:'pending'});await tick();
assert.equal(hqStatus.textContent,'Tersimpan');assert.equal(hqSales.textContent,'Rp 700');assert.equal(client.state.dash.month.total,700);
console.log('HQ per-outlet modal Save also confirms the latest clicked amount without another click or refresh.');

// Partial reports remain copyable; a missing entry differs from an entered zero.
let reportRecords=[{outlet_code:'BISS',date:'2026-10-26',sales:100},{outlet_code:'BILW',date:'2026-10-25',sales:50},{outlet_code:'BICP',date:'2026-10-26',sales:0}];
const reportOutlets=['BISS','BILW','BICP'].map(code=>({code,role:'store'}));
const reportBackend={Date,TZ:'Asia/Jakarta',OUTLETS:reportOutlets,validateSession_:()=>({role:'admin'}),bqIsAvailable_:()=>true,
 parseDateKey_:key=>{const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d);},dateKey_:date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'),
 Utilities:{formatDate:()=> '2026-10-28'},salesAnalysisCanonicalOutletCode_:code=>code,salesAnalysisPeriodOutlets_:rows=>rows.filter(o=>o.role!=='admin'),
 salesSheetLatest_:rows=>rows,salesSheetTable_:()=>({rows:reportRecords}),salesSheetDateKey_:value=>value,
 bqGetTargetsMap_:()=>({BISS:1000,BILW:1000,BICP:1000}),bqGetDailyTargetProgress_:codes=>Object.fromEntries(codes.map(code=>[code,{mtdTarget:260,targetDays:26}])),Logger:{log(){}}};
vm.createContext(reportBackend);
vm.runInContext(between(backend,'function bqGetDailyReportSales_(outletCodes,reportDate){','/* ============================================================\n *  SAVE APIs')+between(backend,'function reportIntegerId_(', 'function syncOutlets_('),reportBackend);
const partial=reportBackend.getDailyReport('token','2026-10-26');
assert.equal(partial.ok,true,partial.error);assert.equal(partial.total.dailySales,100);assert.equal(partial.total.mtdSales,150);
assert.deepEqual(Array.from(partial.missingSalesOutlets),['BILW']);assert.match(partial.text,/BILW Belum input sales/);assert.match(partial.text,/BICP 0/);assert.ok(!partial.text.includes('Total sementara'));assert.ok(!partial.text.includes('_Belum input sales:'));
reportRecords=[];
const emptyReport=reportBackend.getDailyReport('token','2026-10-26');assert.equal(emptyReport.ok,true);assert.equal(emptyReport.missingSalesOutlets.length,3);
reportRecords=reportOutlets.map((o,index)=>({outlet_code:o.code,date:'2026-10-26',sales:index*100}));
const complete=reportBackend.getDailyReport('token','2026-10-26');assert.equal(complete.ok,true);assert.equal(complete.missingSalesOutlets.length,0);assert.ok(!complete.text.includes('Total sementara'));
// A report fetch error stays retryable and cannot masquerade as missing sales.
const retryButton={dataset:{reportDate:'2026-10-26'},classList:{remove(){}},removeAttribute(){},disabled:true};
reportUi.document.getElementById=()=>retryButton;
vm.runInContext(between(html,'function setDailyReportUnavailable(', "document.getElementById('btnUploadDailyTargets')"),reportUi);
reportUi.setDailyReportUnavailable(retryButton,'Koneksi terputus');
assert.equal(retryButton.disabled,false);assert.equal(retryButton.dataset.unavailable,undefined);assert.equal(retryButton.textContent,'Coba Salin Lagi');assert.equal(retryButton.title,'Koneksi terputus');
console.log('Daily Report copies partial or empty sales with missing-entry labels, distinguishes explicit zero, preserves MTD and lets users retry loading.');
// One click copies either the prepared partial report or the just-fetched report.
let copyHandler;const copiedReports=[];
const copyUi={dailyReportCopyCache:new Map([['2026-10-26',partial.text]]),prepareDailyReport:async()=>emptyReport.text,copyPlainText:async text=>{copiedReports.push(text);return true;},toast(){},
 document:{getElementById:()=>({addEventListener:(_name,handler)=>copyHandler=handler})}};
vm.createContext(copyUi);vm.runInContext(between(html,"document.getElementById('btnCopyDailyReport').addEventListener",'/* ENTER APP */'),copyUi);
const copyEvent={currentTarget:{dataset:{reportDate:'2026-10-26'}}};
await copyHandler(copyEvent);assert.equal(copiedReports[0],partial.text);
copyUi.dailyReportCopyCache.clear();await copyHandler(copyEvent);assert.equal(copiedReports[1],emptyReport.text);

// BIKK reopened on 25 October: three target days must not block the 27 October report.
const reopeningTargets=[25,26,27,28].map((day,index)=>({outlet_code:'BIKK',date:`2026-10-${day}`,year:2026,month:10,day,daily_target:100+index*50}));
for(let day=1;day<=31;day++)reopeningTargets.push({outlet_code:'BISS',date:`2026-10-${String(day).padStart(2,'0')}`,year:2026,month:10,day,daily_target:10});
reportRecords=[{outlet_code:'BIKK',date:'2026-10-27',sales:400},{outlet_code:'BISS',date:'2026-10-27',sales:300}];
reportBackend.OUTLETS=[{code:'BIKK',role:'store'},{code:'BISS',role:'store'}];
reportBackend.salesSheetTable_=name=>({rows:name==='daily_targets'?reopeningTargets:reportRecords});
reportBackend.bqGetTargetsMap_=()=>({BIKK:700,BISS:310});
vm.runInContext(between(backend,'function bqGetDailyTargetProgress_(outletCodes,year,month,throughDay){','function bqGetDailyTargetsByDate_(outletCodes,year,month){'),reportBackend);
const reopened=reportBackend.getDailyReport('token','2026-10-27');
assert.equal(reopened.ok,true,reopened.error);
const bikkReport=reopened.rows.find(row=>row.outlet==='BIKK');
assert.equal(bikkReport.mtdTarget,450,'only targets on 25, 26 and 27 count; future targets do not');
assert.equal(bikkReport.monthlyTarget,700);assert.equal(reopened.total.dailySales,700);assert.equal(reopened.total.mtdTarget,720);
assert.ok(!reopened.text.includes('Total sementara'));
const beforeReopening=reportBackend.getDailyReport('token','2026-10-24');assert.equal(beforeReopening.ok,true);assert.ok(!beforeReopening.rows.some(row=>row.outlet==='BIKK'));
reportBackend.validateSession_=()=>({role:'store'});assert.equal(reportBackend.getDailyReport('token','2026-10-27').ok,false,'HQ authorization is unchanged');
console.log('BIKK reopening: 25–27 October targets permit copying the 27 October report without requiring closed-day targets.');
