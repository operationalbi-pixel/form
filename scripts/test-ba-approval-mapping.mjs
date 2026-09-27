import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const backend = await readFile('berita-acara-gas/Code.gs', 'utf8');
const dashboard = await readFile('berita-acara-gas/ApprovalDashboard.html', 'utf8');
const outletDashboard = await readFile('berita-acara-gas/OutletDashboard.html', 'utf8');
const pdfGenerator = await readFile('berita-acara-gas/PDFGenerator.html', 'utf8');
const worker = await readFile('cloudflare/inventory-api/src/index.js', 'utf8');
const manifest = JSON.parse(await readFile('berita-acara-gas/appsscript.json', 'utf8'));

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

state = context.baResolveApprovalState_({
  ...base,
  am_approved_date: '2026-09-20T08:00:00Z',
  am_approved_by: 'Area Manager Lama'
}, { Test: { approval1: 'AREA MANAGER', approval2: '' } });
assert.equal(state.currentStatus, 'Approved');
assert.equal(state.timeline[1].status, 'APPROVED');
assert.equal(state.timeline[1].name, 'Area Manager Lama');

assert.match(worker, /CREATE TABLE IF NOT EXISTS ba_approval_config/);
assert.match(worker, /\/v1\/ba\/approval-config/);
assert.match(backend, /getRange\(2, 5, lastRow - 1, 1\)/);
assert.match(dashboard, /Pemetaan Approval/);
assert.match(dashboard, /fas fa-cog/);
assert.match(dashboard, /h-8 w-\[1px\][\s\S]*openApprovalSettings\(\)/);
assert.match(outletDashboard, /ba-user-toolbar/);
assert.match(outletDashboard, /ba-user-filters/);
assert.match(outletDashboard, /ba-user-history-table/);
assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
assert.match(dashboard, /function renderApprovalTimeline\(/);
assert.match(outletDashboard, /function renderApprovalTimeline\(/);
assert.match(pdfGenerator, /item\.Approval_1_Position/);
assert.match(pdfGenerator, /item\.Approval_2_Position/);
assert.doesNotMatch(pdfGenerator, /const isFnbFlow/);

const authCalls = [];
const authContext = {
  BI_SPACE_API_URL: 'https://example.test/exec',
  ScriptApp: { getOAuthToken: () => 'owner-token' },
  console: { error() {} },
  UrlFetchApp: {
    fetch(url, options) {
      authCalls.push({ url, options });
      return {
        getResponseCode: () => 200,
        getContentText: () => '<!DOCTYPE html><title>Sign in</title>',
        getHeaders: () => ({ 'Content-Type': 'text/html' })
      };
    }
  }
};
vm.createContext(authContext);
vm.runInContext(extractFunction(backend, 'consumeBiSpaceHandoff_'), authContext);
assert.throws(
  () => authContext.consumeBiSpaceHandoff_('a'.repeat(64)),
  /Validasi sesi BI-Space sedang tidak tersedia/
);
assert.equal(authCalls[0].options.headers.Authorization, 'Bearer owner-token');

const cachedValues = new Map();
const fallbackContext = {
  BA_FORM_TYPES: ['Test'],
  BA_FNB_FIRST_TYPES: [],
  console: { warn() {} },
  CacheService: {
    getScriptCache: () => ({
      get: key => cachedValues.get(key) || null,
      put: (key, value, ttl) => cachedValues.set(key, `${value}|${ttl}`)
    })
  },
  baCloudflareRequest_: () => {
    throw new Error('Cloudflare BA Error (404): Endpoint tidak ditemukan.');
  }
};
vm.createContext(fallbackContext);
vm.runInContext(extractFunction(backend, 'baDefaultApprovalConfig_'), fallbackContext);
vm.runInContext(extractFunction(backend, 'baApprovalConfigRows_'), fallbackContext);
const fallbackRows = fallbackContext.baApprovalConfigRows_(true);
assert.equal(fallbackRows.length, 1);
assert.equal(fallbackRows[0].approval1, 'AREA MANAGER');
assert.match(cachedValues.get('ba-approval-config-v1'), /\|30$/);

console.log('OK: dynamic BA approval mapping, safe Cloudflare fallback, protected BI-Space handoff, skipped steps, EMP_LIST positions, and timeline are configured.');
