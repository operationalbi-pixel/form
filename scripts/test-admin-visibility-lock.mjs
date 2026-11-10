import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const source=readFileSync(new URL('../gas/Code.gs',import.meta.url),'utf8');
const published=readFileSync(new URL('../docs/Code.gs',import.meta.url),'utf8');
assert.equal(published,source,'Published GAS mirror must stay in sync.');
const from=source.indexOf('function acquireAdminVisibilityLock_()');
const to=source.indexOf('/** Generic save endpoint',from);
assert(from>0&&to>from,'Dedicated admin visibility backend missing.');
const code=source.slice(from,to);
assert(!code.includes('acquireStockWriteLock_()'),'Admin must not hold the stock write lock.');
assert(code.includes("acquireStockScopeLock_('ADMIN_SUBPAGE_VISIBILITY_V1'"),'Admin must hold its own scoped lease.');
const client=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert(client.includes("revision:version"),'Browser must submit the revision it actually loaded.');
assert(client.includes("if(button.disabled)return;"),'Duplicate Save clicks must be blocked.');
assert(client.includes('function finish(){button.disabled=false'),'Failed Save must re-enable controls.');

let rows=[
 ['task-a','CASHIER',true,'old','OLD'],
 ['task-a','MANAGER',false,'old','OLD'],
 ['task-b','CASHIER',false,'old','OLD'],
 ['task-b','MANAGER',true,'old','OLD']
];
const original=()=>rows.map(r=>r.slice());
let throwAfterWrite=false,flushes=0,activeLock=null;
const leases=[],writes=[];
const sheet={
 getLastRow(){let count=rows.length;while(count&&rows[count-1].every(x=>x===''))count--;return count+1;},
 getRange(first,col,size,width){
  assert.equal(first,2);assert.equal(col,1);
  return {
   getDisplayValues(){return rows.slice(0,size).map(r=>r.slice(0,width).map(x=>String(x??'')));},
   getValues(){return rows.slice(0,size).map(r=>r.slice(0,width));},
   setValues(values){
    assert.equal(activeLock,'ADMIN_SUBPAGE_VISIBILITY_V1','Sheet write must be protected by admin lease.');
    assert.equal(values.length,size);
    writes.push(values.length);
    rows=values.map(v=>v.slice());
    if(throwAfterWrite){throwAfterWrite=false;throw Error('simulated Sheets failure after write');}
   }
  };
 }
};
const context={
 console,
 Date,
 Array,
 JSON,
 String,
 Boolean,
 RegExp,
 Error,
 Object,
 Math,
 SpreadsheetApp:{flush(){flushes++;}},
 acquireStockScopeLock_(scope){
  assert.equal(activeLock,null,'Nested or overlapping admin lease');
  activeLock=scope;leases.push(scope);
  return {releaseLock(){assert.equal(activeLock,scope);activeLock=null;}};
 },
 digest_(v){return createHash('sha256').update(v).digest('hex');},
 safe_(fn){try{return {ok:true,data:fn()};}catch(error){return {ok:false,error:error.message};}},
 requireAdmin_(token){assert(token);return {nik:String(token)};},
 readAllActiveTasks_(){return [{id:'task-a'},{id:'task-b'}];},
 readEmployeePositions_(){return [{position:'CASHIER'},{position:'MANAGER'}];},
 readSubpageVisibilityState_(){
  const state={configured:{},allowed:{}};
  for(const [id,position,enabled] of rows){
    if(!id)continue;
    state.configured[id]=true;
    if(enabled)state.allowed[id+'|'+position]=true;
  }
  return state;
 },
 normalizeEmployeePosition_(v){return String(v).trim().toUpperCase();},
 ensureSubpageVisibilitySheet_(){return sheet;}
};
vm.createContext(context);
vm.runInContext(code,context);
const {getAdminPageVisibility:getPage,saveAdminPageVisibility:savePage}=context;

const sessionA=getPage('ADMIN_A');assert(sessionA.ok);
const version=sessionA.data.revision;assert.equal(typeof version,'string');
const selection={'task-a':['MANAGER'],'task-b':['CASHIER']};
const first=savePage('ADMIN_A',{revision:version,selected:selection});
assert(first.ok,first.error);
assert.equal(rows[0][2],false);
assert.equal(rows[1][2],true);
assert.equal(rows[2][2],true);
assert.equal(rows[3][2],false);
assert.notEqual(first.data.revision,version);
assert.equal(activeLock,null,'Admin lease released on success');

const afterFirst=original();
const stale=savePage('ADMIN_B',{revision:version,selected:{}});
assert.equal(stale.ok,false,'Stale admin must not overwrite newer changes');
assert.match(stale.error,/admin lain/i);
assert.deepEqual(rows,afterFirst,'Stale save must not alter sheet');
assert.equal(activeLock,null,'Admin lease released on conflict');
assert.equal(writes.length,1,'Revision conflict must not write');

const missingRevision=savePage('ADMIN_B',{selected:{}});
assert.equal(missingRevision.ok,false);
assert.match(missingRevision.error,/Muat ulang/i);
assert.equal(writes.length,1);

const refreshed=getPage('ADMIN_B');
assert(refreshed.ok);
const beforeFailure=original();
throwAfterWrite=true;
const failed=savePage('ADMIN_B',{revision:refreshed.data.revision,selected:{}});
assert.equal(failed.ok,false);
assert.match(failed.error,/gagal/i);
assert.deepEqual(rows,beforeFailure,'Failed Sheets write must restore existing configuration');
assert.equal(activeLock,null,'Admin lease released after write error');
assert(writes.length>=3,'Failed write must attempt a safe restore');

assert(leases.every(x=>x==='ADMIN_SUBPAGE_VISIBILITY_V1'));
assert(flushes>=2);
console.log('OK: admin permission save uses separate scoped lease, optimistic revision, duplicate-click guard and rollback.');
