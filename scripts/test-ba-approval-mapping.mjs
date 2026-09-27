import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const backend = await readFile('berita-acara-gas/Code.gs', 'utf8');
const dashboard = await readFile('berita-acara-gas/ApprovalDashboard.html', 'utf8');
const outletDashboard = await readFile('berita-acara-gas/OutletDashboard.html', 'utf8');
const pdfGenerator = await readFile('berita-acara-gas/PDFGenerator.html', 'utf8');
const worker = await readFile('cloudflare/inventory-api/src/index.js', 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} tidak ditemukan`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} tidak lengkap`);
}

const context = {};
vm.createContext(context);
vm.runInContext(extractFunction(backend, 'baResolveApprovalState_'), context);

const config = {
  Test: { approval1: 'FNB', approval2: 'AREA MANAGER' }
};
const base = { ba_type: 'Test', name: 'Pembuat', timestamp: 1_798_000_000 };

let state = context.baResolveApprovalState_(base, config);
assert.equal(state.currentApprovalStep, 1);
assert.equal(state.currentApprovalPosition, 'FNB');

state = context.baResolveApprovalState_({ ...base, fnb_approved_date: '2026-09-27T10:00:00Z', fnb_approved_by: 'FNB User' }, config);
assert.equal(state.currentApprovalStep, 2);
assert.equal(state.currentApprovalPosition, 'AREA MANAGER');

state = context.baResolveApprovalState_({ ...base, fnb_approved_date: '2026-09-27T10:00:00Z', am_approved_date: '2026-09-27T11:00:00Z' }, config);
assert.equal(state.currentStatus, 'Approved');

state = context.baResolveApprovalState_(base, { Test: { approval1: '', approval2: 'AREA MANAGER' } });
assert.equal(state.timeline[1].status, 'SKIPPED');
assert.equal(state.currentApprovalStep, 2);

state = context.baResolveApprovalState_(base, { Test: { approval1: '', approval2: '' } });
assert.equal(state.currentStatus, 'Approved');
assert.equal(state.timeline[1].status, 'SKIPPED');
assert.equal(state.timeline[2].status, 'SKIPPED');

assert.match(worker, /CREATE TABLE IF NOT EXISTS ba_approval_config/);
assert.match(worker, /\/v1\/ba\/approval-config/);
assert.match(backend, /getRange\(2, 5, lastRow - 1, 1\)/);
assert.match(dashboard, /Pemetaan Approval/);
assert.match(dashboard, /function renderApprovalTimeline\(/);
assert.match(outletDashboard, /function renderApprovalTimeline\(/);
assert.match(pdfGenerator, /item\.Approval_1_Position/);
assert.match(pdfGenerator, /item\.Approval_2_Position/);
assert.doesNotMatch(pdfGenerator, /const isFnbFlow/);

console.log('OK: dynamic BA approval mapping, skipped steps, EMP_LIST positions, and timeline are configured.');
