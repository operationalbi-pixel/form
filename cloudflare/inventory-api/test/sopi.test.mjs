import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sopiAcronyms, sopiContentDisposition, sopiConversationFallback, sopiDriveTitle, sopiEditDistance, sopiFallbackAnswer, sopiIsUsableAiAnswer, sopiMarkdownText, sopiSafeFileName, sopiSearchTerms } from '../src/index.js';

const seed = JSON.parse(await readFile(new URL('../data/sopi-seed.json', import.meta.url), 'utf8'));

assert.equal(seed.documents.length, 100, 'seed harus memuat 100 SOP JSON');
assert.ok(seed.documents.every((document) => document.id && document.title && document.sourceUrl), 'setiap SOP wajib memiliki identitas dan sumber');
assert.ok(seed.documents.some((document) => document.category === 'Food'), 'kategori Food harus tersedia');
assert.ok(seed.documents.some((document) => document.category === 'Beverage'), 'kategori Beverage harus tersedia');

assert.deepEqual(
  sopiSearchTerms('Berapa takaran Nasi Goreng Roa?'),
  ['nasi', 'goreng', 'roa']
);
assert.deepEqual(sopiSearchTerms('IK Hot Fiery Ribs'), ['hot', 'fiery', 'ribs']);
assert.deepEqual(sopiSearchTerms('Internal Memo Hot Fiery Ribs'), ['hot', 'fiery', 'ribs']);
assert.deepEqual(sopiSearchTerms('Standar Operasional Prosedur Hot Fiery Ribs'), ['hot', 'fiery', 'ribs']);
assert.deepEqual(sopiSearchTerms('Intruksi Kerja Hot Fiery Ribs'), ['hot', 'fiery', 'ribs']);
assert.deepEqual(sopiSearchTerms('Maaf typo, salmonnya pada The B.B.S berapa gram?'), ['salmon']);
assert.deepEqual(sopiAcronyms('salmon pada The B.B.S'), ['bbs']);
assert.deepEqual(sopiAcronyms('The B.O.S'), ['bos']);
assert.equal(sopiEditDistance('bbs', 'bos'), 1);
assert.equal(sopiIsUsableAiAnswer('Salmon fillet pada The B.O.S tercantum 70 gram.'), true);
assert.equal(sopiIsUsableAiAnswer("Probably answer: salmon?\nI'm not sure.\nProbably answer: salmon?\nI'm not sure."), false);
assert.equal(sopiIsUsableAiAnswer('Sal Sal Sal Sal Sal Sal Sal'), false);
assert.equal(sopiSafeFileName('../SOP Oxtail Fried Rice (Final).pdf'), 'SOP Oxtail Fried Rice (Final).pdf');
assert.equal(sopiContentDisposition('SOP Oxtail Fried Rice.pdf', true), "inline; filename=\"SOP Oxtail Fried Rice.pdf\"; filename*=UTF-8''SOP%20Oxtail%20Fried%20Rice.pdf");
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
const managementMigration = await readFile(new URL('../../migrations/0009_sopi_knowledge_management.sql', import.meta.url), 'utf8');
assert.match(managementMigration, /ADD COLUMN admin_content/);
const linkSourceMigration = await readFile(new URL('../../migrations/0010_sopi_link_sources.sql', import.meta.url), 'utf8');
assert.match(linkSourceMigration, /ADD COLUMN source_content/);

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
