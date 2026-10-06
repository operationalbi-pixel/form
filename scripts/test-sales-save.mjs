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
let onAcquire = () => {};
const sheet = {
  getLastRow: () => rows.length,
  getLastColumn: () => headers.length,
  getRange(row, column, height, width) {
    return {
      getValues: () => rows.slice(row - 1, row - 1 + height).map(value => value.slice(column - 1, column - 1 + width)),
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
  between(backend, 'function bqSyncDaily_(oc,key,', 'function bqSyncWeekly_(oc,periodKey,') +
  between(backend, 'function saveDaily(token, payload)', 'function saveGlobalDailyAnalysis(token, payload)'), server
);
function sheetRecord() {
  return Object.fromEntries(headers.map((name, index) => [name, rows[1][index]]));
}
function existingRecord(sales, analysis) {
  return headers.map(name => ({ outlet_code:'BISS', date:'2026-10-06', sales, analisa_harian:analysis, updated_at:new Date() })[name] ?? '');
}

// Another execution inserts the day while this request is waiting for the lock.
onAcquire = () => { rows[1] = existingRecord(900, 'Analysis from the other request'); onAcquire = () => {}; };
const analysis = 'New daily analysis entered by the employee';
let saved = server.saveDaily('session', { date:'2026-10-06', analisa:analysis });
assert.equal(saved.ok, true);
assert.equal(rows.length, 2, 'a read before the lock must not create a duplicate day');
assert.equal(saved.sales, 900, 'analysis-only saves preserve the latest sales');
assert.equal(sheetRecord().analisa_harian, analysis);
assert.deepEqual(events.slice(-5), ['write','flush','invalidate','release','invalidate'], 'flush and invalidate before releasing the writer lock');

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
  if (!elements.has(id)) elements.set(id, { value:'', style:{}, classList:{add(){},remove(){},toggle(){}},
    addEventListener(type, callback) { handlers.set(`${id}:${type}`, callback); } });
  return elements.get(id);
}
const calls = [];
const messages = [];
const client = {
  console, Map,
  document: { getElementById: element },
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
vm.runInContext(
  between(html, 'let monthLoadId =', 'const fmtIDR =') +
  between(html, 'async function loadMonth(', '/* target cache helpers */') +
  between(html, 'function render(){', 'function setDelta(') +
  between(html, 'function getAnalisaTextForCurrent(){', 'function renderStatement(') +
  between(html, "document.getElementById('anaBox').addEventListener('input'", '/* ============= DAY DETAIL MODAL'), client
);
vm.runInContext('refreshMonthInBackground = function(){};', client);
const click = id => handlers.get(`${id}:click`)();
function input(id, value) {
  element(id).value=value;
  handlers.get(`${id}:input`)({target:element(id)});
}
client.render();
input('anaBox', analysis);
input('dayAmount', '1250');
let saving = click('saveDay');
assert.equal(calls[0].args[1].analisa, analysis, 'Simpan persists the visible daily analysis');
assert.equal(calls[0].args[1].sales, 1250);
await click('saveDay');
assert.equal(calls.length, 1, 'repeated clicks do not create another save');
calls[0].resolve({ok:true,sales:1250,analisa:analysis,status:'done'});
await saving;
assert.equal(client.state.dash.days[5].daily.text, analysis);
assert.equal(element('anaBox').value, analysis);
assert.equal(client.state.dash.weeks[0].total, 1250);
assert.equal(client.state.dash.month.total, 1250);

input('anaBox', 'Draft that must survive a failed save');
saving = click('saveDay');
calls.at(-1).reject(new Error('Database temporarily unavailable'));
await saving;
client.render();
assert.equal(element('anaBox').value, 'Draft that must survive a failed save');
assert.match(messages.at(-1).message, /Database temporarily unavailable/, 'show the actual save error');

client.state.scope='week';
client.render();
input('anaBox', 'Unsubmitted weekly analysis must remain');
input('dayAmount', '1500');
saving = click('saveDay');
assert.equal(calls.at(-1).args[1].preserveAnalysis, true, 'weekly text must not overwrite daily analysis');
assert.equal(calls.at(-1).args[1].analisa, analysis, 'older GAS deployments receive the saved daily text');
calls.at(-1).resolve({ok:true,sales:1500,analisa:analysis,status:'done'});
await saving;
assert.equal(element('anaBox').value, 'Unsubmitted weekly analysis must remain');

client.state.scope='day'; client.render();
input('anaBox', analysis);
saving=click('submitBtn');
assert.equal(calls.at(-1).args[1].preserveSales, true, 'analysis submit must not overwrite concurrent sales with the dashboard value');
calls.at(-1).resolve({ok:true,sales:2000,analisa:analysis,status:'done'});
await saving;
assert.equal(element('dayAmount').value, '2000');

// An older dashboard response cannot erase a save or a more recent load.
const olderLoad=client.loadMonth(2026,10,true);
const olderCall=calls.at(-1);
input('anaBox', 'Analysis written while an earlier refresh is running');
saving=click('saveDay');
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
