import { copyFile, mkdir } from 'node:fs/promises';

const copies = [
  ['docs/Code.gs', 'gas/Code.gs']
];

await mkdir('gas', { recursive: true });
for (const [source, target] of copies) {
  await copyFile(source, target);
  console.log(`synced ${source} -> ${target}`);
}
