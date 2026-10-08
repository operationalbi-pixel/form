import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const html=fs.readFileSync('docs/showcaselog.html','utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)+a.length));
const storage=new Map(),timers=[];let replies=[],calls=[];
const elements=new Map();function byId(id){if(!elements.has(id))elements.set(id,{value:'2026-10-08',innerHTML:'',textContent:''});return elements.get(id);}
const item={code:'CAKE',totalIn:5,totalSold:2,totalWaste:0};
const ctx={STATE:{token:'token',user:{nik:'N1'},outlet:'BISS',items:[item],drafts:{0:{inQty:'2',inTotal:'7'}},saving:false},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  window:{crypto:{randomUUID}},byId,escapeAttr:String,escapeHtml:String,actorInfoHtml:()=>'',showcaseCacheIdentity:()=> 'session',
  toast(){},renderItems(){},setSaving:v=>ctx.STATE.saving=v,setTimeout:fn=>{timers.push(fn);return 1;},clearTimeout(){},
  BAKERZIN_API:{call:async(name,args)=>{calls.push({name,args});return replies.shift();}}};
vm.createContext(ctx);
vm.runInContext(slice('    function collectEntries(){','    var SHOWCASE_SAVES='),ctx);
vm.runInContext(slice('    var SHOWCASE_SAVES=','    byId(\'eventDate\').value=today()'),ctx);
vm.runInContext(slice('    function inputHtml(', '    function actorInfoHtml('),ctx);
ctx.refreshShowcaseSaves=()=>{};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
// Consolidated #229 behavior: confirmed busy acceptance retries the same request.
replies=Array.from({length:20},()=>({ok:false,error:'Batas waktu penguncian habis: proses lain menahan kunci terlalu lama.'}));
replies.push({ok:true,data:{jobId:'JOB',status:'QUEUED'}});
ctx.save();await tick();const id=calls[0].args[1].requestId;
for(let i=0;i<20;i++){
  assert.equal(ctx.STATE.drafts[0].inQty,'2');assert.equal(ctx.STATE.saving,true);
  assert.match(ctx.inputHtml(0,'inQty'),/value="2".*disabled/);
  assert.match(ctx.totalInputHtml(0,'inTotal',5,''),/value="7".*disabled/);
  timers.shift()();await tick();
}
assert.equal(calls.length,21);assert.ok(calls.every(c=>c.args[1].requestId===id));
assert.equal(ctx.STATE.saving,false);assert.deepEqual(Object.keys(ctx.STATE.drafts),[]);
assert.match(ctx.inputHtml(0,'inQty'),/value="2"/);
assert.match(ctx.totalInputHtml(0,'inTotal',5,''),/value="7"/);
assert.equal(ctx.collectEntries().length,0,'displayed submitted values cannot be submitted twice');
ctx.updateShowcaseVisibleStatuses([{jobId:'JOB',requestId:id,status:'COMPLETE'}]);
assert.match(ctx.inputHtml(0,'inQty'),/value="2"/);
assert.match(ctx.totalInputHtml(0,'inTotal',5,''),/value="7"/,'keep the total during the completion/read gap');
ctx.restoreShowcaseVisibleInputs('2026-10-08',false);
assert.match(ctx.totalInputHtml(0,'inTotal',7,''),/value="7"/);
assert.match(ctx.inputHtml(0,'inQty'),/value="2"/,'last sent quantity survives a fresh server read');
ctx.STATE.drafts={0:{inQty:'3'}};assert.match(ctx.inputHtml(0,'inQty'),/value="3"/);
assert.equal(ctx.collectEntries()[0].inQty,3,'new edits replace display-only history');
ctx.STATE.outlet='OTHER';ctx.restoreShowcaseVisibleInputs('2026-10-08',false);ctx.STATE.drafts={};assert.match(ctx.inputHtml(0,'inQty'),/value=""/);
ctx.STATE.outlet='BISS';ctx.restoreShowcaseVisibleInputs('2026-10-08',true);assert.match(ctx.inputHtml(0,'inQty'),/value="2"/);
ctx.STATE.items=[{code:'OTHER'},item];assert.match(ctx.inputHtml(1,'inQty'),/value="2"/,'visible inputs are keyed by item code, not row position');
ctx.STATE.user={nik:'N2'};ctx.restoreShowcaseVisibleInputs('2026-10-08',false);assert.match(ctx.inputHtml(1,'inQty'),/value=""/);
// Unrelated read failures cannot release an in-flight acceptance lock.
vm.runInContext(slice('    function call(name,','    function escapeHtml('),ctx);
ctx.STATE.saving=true;replies=[{ok:false,error:'read failed'}];ctx.call('read',[],()=>{});await tick();assert.equal(ctx.STATE.saving,true);
// A job completed before the first status poll must still refresh totals.
vm.runInContext(slice('    function refreshShowcaseSaves(){','    function retryShowcaseSave('),ctx);
ctx.STATE.saving=false;ctx.STATE.user={nik:'N1'};ctx.STATE.outlet='BISS';ctx.STATE.items=[item];ctx.STATE.drafts={0:{soldQty:'4'}};
ctx.SHOWCASE_SAVES.jobs=[];let freshReads=0;
ctx.applyShowcaseData=()=>{freshReads++;};ctx.writeShowcaseCache=()=>{};
const completed={jobId:'JOB',requestId:id,type:'SHOWCASE_LOG',status:'COMPLETE',outlet:'BISS',eventDate:'2026-10-08'};
calls=[];replies=[{ok:true,data:{jobs:[completed]}},{ok:true,data:{items:[{code:'OTHER'},item]}}];
ctx.refreshShowcaseSaves();await tick();
assert.equal(freshReads,1,'first observed COMPLETE refreshes authoritative totals');
assert.equal(calls[1].name,'showcaseLogBootstrap');
assert.equal(ctx.STATE.drafts[1].soldQty,'4','fresh totals preserve newer drafts by item code');
replies=[{ok:true,data:{jobs:[completed]}}];ctx.refreshShowcaseSaves();await tick();
assert.equal(freshReads,1,'unchanged completed jobs do not repeatedly reload the form');
console.log('Showcase quantities stay visible through busy retry, acceptance, completion and reload without duplicate submissions or account/outlet leakage.');
