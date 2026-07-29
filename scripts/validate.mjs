import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const pairs = [
  ['docs/index.html', 'index.html'],
  ['docs/stock-card.html', 'stock-card.html'],
  ['docs/config.js', 'config.js'],
  ['docs/api-client.js', 'api-client.js'],
  ['docs/ui-modern.css', 'ui-modern.css'],
  ['docs/Code.gs', 'gas/Code.gs']
];

const failures = [];
const contents = new Map();

async function text(path) {
  if (!contents.has(path)) contents.set(path, await readFile(path, 'utf8'));
  return contents.get(path);
}

for (const [source, copy] of pairs) {
  if (await text(source) !== await text(copy)) failures.push(`${copy} tidak sinkron dengan ${source}`);
}

for (const path of ['docs/config.js', 'docs/api-client.js', 'docs/Code.gs']) {
  try {
    new vm.Script(await text(path), { filename: path });
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  }
}

for (const path of ['docs/index.html', 'docs/stock-card.html']) {
  const html = await text(path);
  if (!html.includes('ui-modern.css')) failures.push(`${path} belum memuat ui-modern.css`);
  if (!html.includes('name="viewport"')) failures.push(`${path} tidak memiliki viewport responsif`);
  const staticHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  const ids = [...staticHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) failures.push(`${path} memiliki ID duplikat: ${duplicateIds.join(', ')}`);
  let inlineIndex = 0;
  const functionNames = [];
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    inlineIndex += 1;
    for (const functionMatch of match[1].matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) functionNames.push(functionMatch[1]);
    try {
      new vm.Script(match[1], { filename: `${path}#inline-${inlineIndex}` });
    } catch (error) {
      failures.push(`${path} inline script ${inlineIndex}: ${error.message}`);
    }
  }
  const duplicateFunctions = [...new Set(functionNames.filter((name, index) => functionNames.indexOf(name) !== index))];
  if (duplicateFunctions.length) failures.push(`${path} memiliki fungsi duplikat: ${duplicateFunctions.join(', ')}`);
}

const css = await text('docs/ui-modern.css');
if (!/@media\s*\(max-width:\s*760px\)/.test(css)) failures.push('Breakpoint tablet/mobile belum tersedia');
if (!/prefers-reduced-motion/.test(css)) failures.push('Dukungan reduced motion belum tersedia');
if (!/:focus-visible/.test(css)) failures.push('Focus keyboard belum tersedia');

const backend = await text('docs/Code.gs');
const actionBlock = backend.match(/function apiActions_\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
const allowedActions = new Set([...actionBlock.matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map(match => match[1]));
const clientActions = new Set();
for (const path of ['docs/index.html', 'docs/stock-card.html']) {
  for (const match of (await text(path)).matchAll(/(?:server|call)\(\s*['"]([^'"]+)['"]/g)) clientActions.add(match[1]);
}
for (const action of clientActions) {
  if (!allowedActions.has(action)) failures.push(`Aksi frontend '${action}' belum tersedia di apiActions_`);
}

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`OK: ${pairs.length} pasangan file sinkron, sintaks valid, kontrak API cocok, dan UI responsif terdeteksi.`);
