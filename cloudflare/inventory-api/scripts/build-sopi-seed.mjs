import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(projectRoot, 'data', 'sopi-seed.json');
const outputPath = path.join(projectRoot, 'data', 'sopi-seed.sql');
const payload = JSON.parse(await readFile(inputPath, 'utf8'));

function sql(value) {
  return "'" + String(value ?? '').replaceAll("'", "''") + "'";
}

function searchable(document) {
  return [
    document.title,
    document.category,
    document.categoryDetail,
    document.yieldText,
    document.shelfLife,
    ...(document.ingredients || []).flatMap((item) => [item.name, item.qty, item.uom]),
    ...(document.steps || []).map((step) => step.desc)
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

// Wrangler's remote D1 importer batches statements itself and rejects explicit
// BEGIN/COMMIT statements. Keep the seed idempotent with a scoped table reset.
// Preserve knowledge injected by BIHQ; only replace the Drive JSON snapshot.
const statements = ["DELETE FROM sopi_documents WHERE source_type = 'JSON';"];

for (const document of payload.documents || []) {
  statements.push(`INSERT INTO sopi_documents (
    document_id, title, category, category_detail, effective_date, revision,
    is_legacy, yield_text, shelf_life, ingredients_json, steps_json,
    search_text, source_url, source_type, status, updated_at
  ) VALUES (
    ${sql(document.id)}, ${sql(document.title)}, ${sql(document.category)},
    ${sql(document.categoryDetail)}, ${sql(document.effectiveDate)},
    ${sql(document.revision)}, ${document.isLegacy ? 1 : 0},
    ${sql(document.yieldText)}, ${sql(document.shelfLife)},
    ${sql(JSON.stringify(document.ingredients || []))},
    ${sql(JSON.stringify(document.steps || []))},
    ${sql(searchable(document))}, ${sql(document.sourceUrl)},
    'JSON', ${sql(document.status)}, CURRENT_TIMESTAMP
  ) ON CONFLICT(document_id) DO UPDATE SET
    title = excluded.title,
    category = excluded.category,
    category_detail = excluded.category_detail,
    effective_date = excluded.effective_date,
    revision = excluded.revision,
    is_legacy = excluded.is_legacy,
    yield_text = excluded.yield_text,
    shelf_life = excluded.shelf_life,
    ingredients_json = excluded.ingredients_json,
    steps_json = excluded.steps_json,
    search_text = excluded.search_text,
    source_url = excluded.source_url,
    source_type = excluded.source_type,
    status = excluded.status,
    updated_at = CURRENT_TIMESTAMP;`);
}

await writeFile(outputPath, statements.join('\n\n') + '\n', 'utf8');
console.log(`Built ${outputPath} with ${payload.documents?.length || 0} SOP documents.`);
