import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const ba=await readFile('berita-acara-gas/Code.gs','utf8');
const main=await readFile('gas/Code.gs','utf8');
const index=await readFile('berita-acara-gas/Index.html','utf8');
const outlet=await readFile('berita-acara-gas/OutletDashboard.html','utf8');
function between(s,start,end){const a=s.indexOf(start),b=s.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return s.slice(a,b);}

// Initial response bundles the correct dashboard after session validation.
let template,includes=[],identity={POSITION:'FNB',NIK:'STAFF'},canApprove=true;
const output={addMetaTag(){return this;},setXFrameOptionsMode(){return this;},setTitle(){return this;}};
const server={JSON,HtmlService:{XFrameOptionsMode:{ALLOWALL:'allow'},createTemplateFromFile:()=>{template={evaluate:()=>output};return template;},createHtmlOutput:()=>output},
 consumeBiSpaceHandoff_:()=>({...identity}),createBaSession_:()=> 'session',requireBaSession_:()=>({...identity}),
 baUserCanApprove_:()=>canApprove,include:page=>{includes.push(page);return '<section>'+page+'</section><script>var x="</script>";</script>';},escapeHtml_:v=>v};
vm.createContext(server);vm.runInContext(between(ba,'function doGet(e)','function include(filename)'),server);
server.doGet({parameter:{handoff:'valid'}});
assert.equal(includes.at(-1),'ApprovalDashboard');
assert.equal(JSON.parse(template.initialDashboardPageJson),'ApprovalDashboard');
assert.equal(template.initialDashboardHtmlJson.includes('<'),false,'embedded HTML cannot terminate its enclosing script');
assert.ok(JSON.parse(template.initialDashboardHtmlJson).includes('<section>'));
server.doGet({parameter:{baSession:'session',mode:'user'}});assert.equal(includes.at(-1),'OutletDashboard');
canApprove=false;server.doGet({parameter:{baSession:'session',mode:'approval'}});assert.equal(includes.at(-1),'OutletDashboard','mode query cannot grant approval access');
const count=includes.length;server.requireBaSession_=()=>{throw Error('expired');};server.doGet({parameter:{baSession:'bad'}});assert.equal(includes.length,count,'invalid session cannot render a dashboard');

// Mount bundled HTML immediately; keep dynamic-include fallback.
let mounts=0,requests=0;
const container={querySelectorAll:()=>[],innerHTML:'',className:''};
const ui={initialDashboardPage:'OutletDashboard',initialDashboardHtml:'<section>Ready</section>',
 document:{getElementById:()=>container},window:{initializeDashboard:()=>mounts++},Array,
 google:{script:{run:{withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(){return this;},include(){requests++;this.success('<section>Fallback</section>');}}}}};
vm.createContext(ui);vm.runInContext(between(index,'        function openBiSpaceDashboard(','        function switchBaMode('),ui);
ui.openBiSpaceDashboard({CAN_BA_APPROVE:false},'');assert.equal(mounts,1);assert.equal(requests,0);assert.equal(container.innerHTML,'<section>Ready</section>');
ui.openBiSpaceDashboard({CAN_BA_APPROVE:true},'');assert.equal(requests,1);assert.equal(mounts,2);

// Cached employee pointers always reread live identity and status.
const employees=Array.from({length:1001},(_,i)=>[i?'EMP'+i:'NIK','Name','BISS','','Server','','','','active','','','']);
employees[600][0]='STAFF';let cells=0;const cache=new Map();let uuid=0;
const empSheet={getLastRow:()=>employees.length,getRange:(r,c,h,w)=>({getDisplayValues:()=>{cells+=h*w;return employees.slice(r-1,r-1+h).map(row=>row.slice(c-1,c-1+w));}})};
const auth={Date,JSON,CONFIG:{EMP_SHEET:'EMP_LIST'},getSpreadsheet_:()=>({getSheetByName:()=>empSheet}),
 CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
 normalizeNik_:v=>String(v||'').trim().toUpperCase().replace(/\s+/g,''),normalizeEmployeePosition_:v=>String(v||'').toUpperCase(),
 requireSession_:()=>({nik:'STAFF'}),assertEmployeeActive_:e=>{if(e.status==='resign')throw Error('Resign');},
 Utilities:{getUuid:()=>String(++uuid).padStart(32,'0')},safe_:fn=>{try{return {ok:true,data:fn()};}catch(e){return {ok:false,error:e.message};}}};
vm.createContext(auth);vm.runInContext(between(main,'function findBeritaAcaraEmployee_(','/** Receives a trusted Berita Acara event'),auth);
let handoff=auth.createBeritaAcaraHandoff('main');assert.equal(handoff.ok,true);assert.equal(cells,1012);
cells=0;employees[600][2]='BIPS';
let consumed=auth.consumeBeritaAcaraHandoff(handoff.data.handoff);assert.equal(consumed.ok,true);assert.equal(consumed.data.OUTLET,'BIPS');assert.equal(cells,12);
assert.equal(auth.consumeBeritaAcaraHandoff(handoff.data.handoff).ok,false,'handoff remains single use');
handoff=auth.createBeritaAcaraHandoff('main');employees[600][8]='resign';
assert.equal(auth.consumeBeritaAcaraHandoff(handoff.data.handoff).ok,false,'revocation between issue and consumption must reject');
assert.equal(auth.createBeritaAcaraHandoff('main').ok,false);
employees[600][0]='OTHER';employees[800][0]='STAFF';assert.equal(auth.findBeritaAcaraEmployee_('STAFF').row,801,'moved identity invalidates the pointer');

// Approval-access lookup never reads the unrelated EMP_LIST positions directory.
const access={requireBaSession_:()=>({POSITION:'FNB'}),baUserCanApprove_:u=>u.POSITION==='FNB',baCanEditApprovalConfig_:()=>false,
 getBaApprovalSettings:()=>{throw Error('Unexpected settings/positions read');}};
vm.createContext(access);vm.runInContext(between(ba,'function getBaApprovalAccess(','function saveBaApprovalSettings('),access);
assert.equal(access.getBaApprovalAccess({BA_SESSION:'session'}).canApprove,true);
assert.match(outlet,/typeof user\.CAN_BA_APPROVE === 'boolean'/);
// Outlet startup uses the verified flag, with fallback for older user payloads.
let accessRequests=0,tableLoads=0;
const classes=[];
const outletUi={window:{},document:{getElementById:()=>({classList:{remove:v=>classes.push(v),add:v=>classes.push(v)}})},
 setupCategoryToggles(){},reloadTable:()=>tableLoads++,overrideNativeAlert(){},console,
 google:{script:{run:{withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(){return this;},getBaApprovalAccess(){accessRequests++;this.success({canApprove:true});}}}}};
vm.createContext(outletUi);vm.runInContext(between(outlet,'    function initializeDashboard(user)','    // --- MODERN ALERT SYSTEM'),outletUi);
outletUi.initializeDashboard({CAN_BA_APPROVE:false});assert.equal(accessRequests,0);
outletUi.initializeDashboard({CAN_BA_APPROVE:true});assert.equal(accessRequests,0);assert.ok(classes.includes('inline-flex'));
outletUi.initializeDashboard({});assert.equal(accessRequests,1);assert.equal(tableLoads,3);
new vm.Script(ba);
for(const source of [index,outlet]) {
 for(const match of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1].replace(/<\?[!=]?[\s\S]*?\?>/g,'null'));
}
console.log('OK: BA bundles its initial dashboard, preserves authenticated mode selection, avoids settings reads, and validates live employee status on handoff.');
