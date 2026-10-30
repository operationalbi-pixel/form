import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(fs.readFileSync(new URL('../../migrations/0000_container_metadata.sql',import.meta.url),'utf8'));
 db.exec(fs.readFileSync(new URL('../../migrations/0001_operations.sql',import.meta.url),'utf8'));
 let readCount=0,release,concurrent=false,failAt=0;const writeBatchSizes=[];
 const api={prepare(sql){return{bind(...args){return{sql,args}}}},async batch(statements){
  if(statements.every(s=>/^SELECT/i.test(s.sql))){const snapshot=statements.map(s=>({results:db.prepare(s.sql).all(...s.args)}));if(concurrent){readCount++;if(readCount===1)await new Promise(resolve=>release=resolve);else release();}return snapshot;}
  writeBatchSizes.push(statements.length);db.exec('BEGIN');try{const result=statements.map((s,i)=>{if(i===failAt-1){failAt=0;throw Error('injected transaction failure');}return{meta:{changes:Number(db.prepare(s.sql).run(...s.args).changes)}}});db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}
 }};
 return{db,env:{API_KEY:'test',OPERATIONS_DB:api},writeBatchSizes,race(){concurrent=true;},fail(index){failAt=index;}};
}
const base={record_id:'R1',logical_id:'L1',version:1,record_type:'MOVEMENT',outlet:'BISS',location:'Store',item_code:'P1',item_name:'Product',unit:'PCS',direction:'IN',qty:5,movement_type:'Goods Receipt',event_date:'2026-10-29',created_at:'2026-10-29T00:00:00Z'};
const send=async(f,rows)=>{const r=await worker.fetch(new Request('https://test/v1/stock-movements',{method:'POST',headers:{'x-api-key':'test','content-type':'application/json'},body:JSON.stringify({rows})}),f.env);return{status:r.status,...await r.json()};};
const qty=f=>f.db.prepare('SELECT current_qty FROM stock_balances').get()?.current_qty||0;
let f=fixture();f.race();const replies=await Promise.all([send(f,[base]),send(f,[base])]);assert.ok(replies.every(r=>r.ok));assert.equal(qty(f),5);assert.equal(replies.reduce((s,r)=>s+r.accepted,0),1);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n,1);
f=fixture();await send(f,[base]);assert.equal((await send(f,[base])).duplicates,1);assert.equal(qty(f),5);
await send(f,[{...base,record_id:'R3',version:3,qty:9}]);await send(f,[{...base,record_id:'R2',version:2,qty:7}]);assert.equal(qty(f),9,'late older corrections cannot change current balance');
await send(f,[{...base,record_id:'R4',version:4,qty:0,direction:'NONE',record_type:'VOID'}]);assert.equal(qty(f),0,'void removes the latest movement effect');
f=fixture();await send(f,[base,{...base,record_id:'R2',version:2,qty:7}]);assert.equal(qty(f),7,'same-batch corrections see the preceding inserted version');
f=fixture();f.fail(2);assert.equal((await send(f,[base])).ok,false);assert.equal(qty(f),0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n,0,'both effect and ledger roll back');
f=fixture();await send(f,[base,base]);assert.equal(qty(f),5,'duplicate IDs inside a batch apply once');
f=fixture();const largeBatch=Array.from({length:21},(_,i)=>({...base,record_id:`R-${i}`,logical_id:`L-${i}`}));const largeReply=await send(f,largeBatch);assert.equal(largeReply.accepted,21);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n,21);assert.equal(qty(f),105,'fresh rows update one aggregate balance per item');assert.ok(f.writeBatchSizes.every(size=>size<=40),'D1 write batches are capped before their CPU limit');assert.equal(f.writeBatchSizes.reduce((sum,size)=>sum+size,0),23,'fresh rows use one balance statement per item rather than per movement');
f=fixture();const distinctItems=Array.from({length:20},(_,i)=>({...base,record_id:`DI-${i}`,logical_id:`DL-${i}`,item_code:`P${i}`}));assert.equal((await send(f,distinctItems)).accepted,20);assert.deepEqual(f.writeBatchSizes,[40],'distinct items stay within the D1 statement limit');assert.equal(f.db.prepare('SELECT SUM(current_qty) AS total FROM stock_balances').get().total,100);
console.log('Atomic stock writes: concurrent replay, corrections, out-of-order delivery, voids, rollback and in-batch duplicates passed.');

f=fixture();await send(f,[base]);const archived=f.db.prepare('SELECT * FROM stock_movements').get();f.db.exec('DELETE FROM stock_movements');f.env.HISTORY_DB_2026={prepare:()=>({bind:()=>({})}),batch:async()=>[{results:[archived]}]};await send(f,[{...base,record_id:'R2',version:2,qty:7,event_date:'2026-11-01'}]);assert.equal(qty(f),7,'a correction moved to another month subtracts its archived baseline');await send(f,[{...base,record_id:'R3',version:3,qty:9,event_date:'2026-11-01'}]);assert.equal(qty(f),9,'current operations supersede the archived baseline');
