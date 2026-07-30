import { copyFile, mkdir } from 'node:fs/promises';

const copies = [
  ['docs/index.html', 'index.html'],
  ['docs/stock-card.html', 'stock-card.html'],
  ['docs/showcaselog.html', 'showcaselog.html'],
  ['docs/config.js', 'config.js'],
  ['docs/api-client.js', 'api-client.js'],
  ['docs/ui-modern.css', 'ui-modern.css'],
  ['docs/Code.gs', 'gas/Code.gs']
];

await mkdir('gas', { recursive: true });
for (const [source, target] of copies) {
  await copyFile(source, target);
  console.log(`synced ${source} -> ${target}`);
}
