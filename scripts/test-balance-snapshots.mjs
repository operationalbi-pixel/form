import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {balanceSnapshots} from '../cloudflare/inventory-api/src/balance-snapshots.js';
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE stock_movements(record_id TEXT PRIMARY KEY,outlet_code TEXT,location_code TEXT,event_date TEXT,quantity REAL)');
db.exec(readFileSync('cloudflare/migrations/0004_snapshot_operations.sql','utf8'));
const binding = {
  prepare(sql) { return {bind(...args) {return {
    first: async()=>db.prepare(sql).get(...args),
    all: async()=>({results:db.prepare(sql).all(...args)}),
    run: ()=>db.prepare(sql).run(...args)
  };}}; },
  async batch(statements) {db.exec('BEGIN');try {const r=statements.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
};
const scope={outlet:'A',location:'Store',date:'2026-10-31',codes:['ITEM']};
const call=async body=>(await balanceSnapshots({}, {OPERATIONS_DB:binding},{readJsonWithLimit:async()=>body,historyDatabaseEntries:()=>[]})).json();
let initial=await call(scope);
assert.deepEqual(initial.balances,{});
assert.equal((await call({...scope,action:'save',revision:initial.revision,balances:{ITEM:0}})).saved,true);
assert.equal((await call(scope)).balances.ITEM,0);
db.exec("INSERT INTO stock_movements VALUES('x','A','Store','2026-10-01',5)");
assert.deepEqual((await call(scope)).balances,{});
assert.equal((await call({...scope,action:'save',revision:initial.revision,balances:{ITEM:99}})).saved,false);
const revision=()=>db.prepare("SELECT revision FROM stock_snapshot_revisions WHERE outlet_code='A'").get().revision;
let before=revision();db.exec("UPDATE stock_movements SET quantity=6 WHERE record_id='x'");assert.ok(revision()>before);
before=revision();db.exec("UPDATE stock_movements SET outlet_code='B' WHERE record_id='x'");assert.ok(revision()>before);
const b=db.prepare("SELECT revision FROM stock_snapshot_revisions WHERE outlet_code='B'").get().revision;
db.exec("DELETE FROM stock_movements WHERE record_id='x'");assert.ok(db.prepare("SELECT revision FROM stock_snapshot_revisions WHERE outlet_code='B'").get().revision>b);
console.log('Snapshot zero balances, cache hits, backdated inserts, corrections, outlet moves, deletes and stale saves passed.');
