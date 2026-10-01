import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sopiConversationFallback, sopiDriveTitle, sopiFallbackAnswer, sopiMarkdownText, sopiSafeFileName, sopiSearchTerms } from '../src/index.js';

const seed = JSON.parse(await readFile(new URL('../data/sopi-seed.json', import.meta.url), 'utf8'));

assert.equal(seed.documents.length, 100, 'seed harus memuat 100 SOP JSON');
assert.ok(seed.documents.every((document) => document.id && document.title && document.sourceUrl), 'setiap SOP wajib memiliki identitas dan sumber');
assert.ok(seed.documents.some((document) => document.category === 'Food'), 'kategori Food harus tersedia');
assert.ok(seed.documents.some((document) => document.category === 'Beverage'), 'kategori Beverage harus tersedia');

assert.deepEqual(
  sopiSearchTerms('Berapa takaran Nasi Goreng Roa?'),
  ['nasi', 'goreng', 'roa']
);
assert.equal(sopiSafeFileName('../SOP Oxtail Fried Rice (Final).pdf'), 'SOP Oxtail Fried Rice (Final).pdf');
assert.equal(sopiDriveTitle('6. Hot Fiery Ribs.pdf'), 'Hot Fiery Ribs');
assert.equal(sopiMarkdownText({ results: [{ data: '# SOP\n\nIsi dokumen.' }] }), '# SOP\n\nIsi dokumen.');
assert.match(sopiConversationFallback('hallo SOPi'), /Halo!/);
assert.match(sopiConversationFallback('hallo SOPi', 'DARA ZAINAL ANWAR'), /Halo, Dara!/);
assert.match(sopiConversationFallback('siapa kamu?'), /asisten pengetahuan Bakerzin/i);

const migration = await readFile(new URL('../../migrations/0007_sopi_knowledge_center.sql', import.meta.url), 'utf8');
assert.match(migration, /CREATE TABLE IF NOT EXISTS sopi_unanswered/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS sopi_attachments/);
const imageMigration = await readFile(new URL('../../migrations/0008_sopi_images.sql', import.meta.url), 'utf8');
assert.match(imageMigration, /CREATE TABLE IF NOT EXISTS sopi_images/);
assert.match(imageMigration, /UNIQUE \(document_id, image_kind, step_index\)/);

const answer = sopiFallbackAnswer({
  title: 'Menu Test',
  yieldText: '1 porsi',
  shelfLife: '',
  ingredients: [{ name: 'Air', qty: '100', uom: 'ML' }],
  steps: [{ desc: 'Campurkan seluruh bahan.' }],
  isLegacy: false
});
assert.match(answer, /Menu Test/);
assert.match(answer, /Air/);
assert.match(answer, /Campurkan seluruh bahan/);

console.log('SOPi worker tests passed.');
