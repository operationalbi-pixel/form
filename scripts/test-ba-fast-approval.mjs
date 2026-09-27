import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { baReusableObjectKey } from '../cloudflare/inventory-api/src/index.js';

const backend = await readFile('berita-acara-gas/Code.gs', 'utf8');
const dashboard = await readFile('berita-acara-gas/ApprovalDashboard.html', 'utf8');
const worker = await readFile('cloudflare/inventory-api/src/index.js', 'utf8');

assert.equal(
  baReusableObjectKey('berita-acara/submissions/BA-123.json'),
  'berita-acara/submissions/BA-123.json'
);
assert.throws(() => baReusableObjectKey('../outside.json'), /INVALID_BA_OBJECT_KEY/);

assert.match(worker, /metadata_only/);
assert.match(worker, /metadataOnly \? null : dataJson/);
assert.match(worker, /row\.data_object_key \?\? row\.dataObjectKey/);
assert.match(backend, /getRawLatestRow\(\s*submissionId,\s*true\s*\)/);
assert.match(backend, /function notifyCommittedBaEvent\(/);
assert.match(backend, /Notifikasi ditolak karena keputusan belum terverifikasi/);
assert.doesNotMatch(
  backend.slice(backend.indexOf('function approveBa('), backend.indexOf('// ==========================================\n// REJECT')),
  /delete newRow\.data_object_key/
);
assert.match(dashboard, /function sendCommittedNotification\(/);
assert.match(dashboard, /sendCommittedNotification\(item\.Submission_ID, 'APPROVED'\)/);
assert.match(dashboard, /\.withFailureHandler\(error =>/);

console.log('OK: approval uses metadata-only D1/R2 references and defers verified notification delivery.');
