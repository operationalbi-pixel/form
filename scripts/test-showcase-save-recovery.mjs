import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
const html=fs.readFileSync('docs/showcaselog.html','utf8');
const source=html.slice(html.indexOf('    var STATE='),html.indexOf("    byId('eventDate').value=today()"));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const storage=new Map([['bakerzin_session','token'],['bakerzin_selected_outlet','BISS']]),nodes=new Map(),requests=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='eventDate'?'2026-10-26':'',textContent:'',innerHTML:'',disabled:false});return nodes.get(id)};
  const c={console,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{crypto:{randomUUID}},document:{getElementById:node,querySelectorAll:()=>[]},BAKERZIN_API:{call:(name,args)=>new Promise((resolve,reject)=>requests.push({name,args,resolve,reject}))},setTimeout:()=>1,clearTimeout(){}};
  vm.createContext(c);vm.runInContext(source,c);
  for(const name of ['renderHeader','renderShowcaseAdminFilters','setShowcaseOutletSelectionState','renderItems','renderProgress','loadShowcaseAging','loadShowcaseMonitoring','restoreShowcasePending','toast'])c[name]=()=>{};
  c.STATE.user={nik:'N1'};
  return {c,node,storage,requests};
}
const a={code:'A',name:'Cake A',balance:10,totalIn:5,totalSold:2,totalWaste:0},b={...a,code:'B',name:'Cake B'};
const data=items=>({selectedOutlet:'BISS',items,user:{nik:'N1'},progress:{}});
// The newer date wins even if an older request completes last.
{
  const {c,node,requests}=fixture();c.load();assert.equal(node('saveButton').disabled,true);
  node('eventDate').value='2026-10-27';c.load();
  requests[1].resolve({ok:true,data:data([b])});await tick();requests[0].resolve({ok:true,data:data([a])});await tick();
  assert.equal(c.STATE.items[0].code,'B');assert.equal(c.STATE.loading,false);
  assert.equal(node('eventDate').value,'2026-10-27');
}
// Cached rendering remains editable, but server refreshes preserve item identity and durable drafts.
{
  const {c,node}=fixture();c.applyShowcaseData(data([a,b]),'2026-10-26',true);
  c.STATE.drafts={0:{soldQty:'3'}};assert.equal(c.persistShowcaseDrafts(),true);
  c.applyShowcaseData(data([b,a]),'2026-10-26',false);
  assert.equal(c.STATE.drafts[1].soldQty,'3');assert.equal(c.STATE.drafts[0],undefined);
  c.STATE.drafts={};c.applyShowcaseData(data([a,b]),'2026-10-26',false);assert.equal(c.STATE.drafts[0].soldQty,'3');
  c.STATE.drafts={};c.restoreShowcaseDrafts('2026-10-25',{});assert.equal(Object.keys(c.STATE.drafts).length,0);
  c.STATE.outlet='OTHER';c.restoreShowcaseDrafts('2026-10-26',{});assert.equal(Object.keys(c.STATE.drafts).length,0);
  c.STATE.outlet='BISS';c.STATE.token='other-account';c.restoreShowcaseDrafts('2026-10-26',{});assert.equal(Object.keys(c.STATE.drafts).length,0);
}
// Total corrections override additive input, exactly as on the server. Invalid balances never enqueue.
{
  const {c,requests,node}=fixture();c.STATE.items=[a];c.STATE.drafts={0:{inQty:'2',inTotal:'7',soldQty:'1'}};
  assert.equal(c.projectedBalance(0,a),11);
  c.STATE.drafts={0:{soldQty:'11'}};c.save();assert.equal(requests.length,0);assert.match(node('showcaseSaveStatus').textContent,/melebihi/);
  c.STATE.drafts={0:{soldQty:'-1'}};c.save();assert.equal(requests.length,0);
  c.STATE.drafts={0:{soldQty:'1'}};c.STATE.loading=true;c.save();assert.equal(requests.length,0);
}
// Acceptance promptly starts the existing authenticated worker without waiting for the worker response.
{
  const {c,requests,storage}=fixture();c.STATE.items=[a];c.STATE.drafts={0:{soldQty:'1'}};c.persistShowcaseDrafts();
  c.refreshShowcaseSaves=()=>{};c.save();const id=requests[0].args[1].requestId;
  requests[0].reject(new Error('network timeout'));await tick();assert.equal(c.SHOWCASE_SAVES.pending.requestId,id);
  c.save();assert.equal(requests[1].args[1].requestId,id);
  const job={jobId:'J',status:'QUEUED',type:'SHOWCASE_LOG',outlet:'BISS',eventDate:'2026-10-26'};
  requests[1].resolve({ok:true,data:job});await tick();assert.equal(c.STATE.saving,false);
  assert.equal(requests[2].name,'startStockUploadWorker');assert.equal(requests[2].args[1],'J');
  assert.equal(Object.keys(c.STATE.drafts).length,0);assert.equal(storage.get(c.showcaseDraftKey('BISS','2026-10-26')),'{}');
  for(let i=0;i<5;i++)c.startShowcaseWorkers([job]);await tick();assert.equal(requests.length,3);
  requests[2].reject(new Error('lost worker response'));await tick();assert.equal(c.SHOWCASE_SAVES.pending,null);
  assert.equal(c.collectEntries().length,0,'the accepted display-only quantity cannot be queued again');
}
// Acknowledging an uncertain earlier request consumes only its unchanged fields.
{
  const {c}=fixture();c.STATE.items=[a,b];c.STATE.drafts={0:{inQty:'1.0',soldQty:'3'},1:{wasteQty:'1'}};
  c.acknowledgeShowcaseDrafts({outlet:'BISS',eventDate:'2026-10-26',entries:[{itemCode:'A',inQty:1,hasInInput:true,soldQty:2,hasSoldInput:true}]});
  assert.equal(c.STATE.drafts[0].inQty,undefined);assert.equal(c.STATE.drafts[0].soldQty,'3');assert.equal(c.STATE.drafts[1].wasteQty,'1');
}
// A failed totals refresh after COMPLETE is retried next poll, with newer drafts preserved.
{
  const {c,requests,node}=fixture();c.STATE.items=[a,b];c.STATE.drafts={0:{soldQty:'2'}};
  const job={jobId:'DONE',type:'SHOWCASE_LOG',status:'COMPLETE',outlet:'BISS',eventDate:'2026-10-26'};
  c.refreshShowcaseSaves();requests[0].resolve({ok:true,data:{jobs:[job]}});await tick();requests[1].reject(new Error('temporary read failure'));await tick();
  assert.equal(c.SHOWCASE_SAVES.refreshed.DONE,undefined);
  c.refreshShowcaseSaves();requests[2].resolve({ok:true,data:{jobs:[job]}});await tick();requests[3].resolve({ok:true,data:data([b,a])});await tick();
  assert.equal(c.SHOWCASE_SAVES.refreshed.DONE,true);assert.equal(c.STATE.drafts[1].soldQty,'2');
  c.refreshShowcaseSaves();requests[4].resolve({ok:true,data:{jobs:[job,{...job,jobId:'REJECTED',status:'ACTION_REQUIRED',error:'Sold exceeds balance'}]}});await tick();
  assert.match(node('showcaseSaveStatus').textContent,/Sold exceeds balance/);assert.equal(node('showcaseSaveDetails').open,true);
}
console.log('Showcase stale responses, durable item-scoped drafts, balance validation, worker startup and completion recovery passed.');
