# Bakerzin Inventory Platform on Cloudflare

This is the pre-migration Cloudflare layer for the inventory platform. Its
containers and schemas are ready, but it does not move, delete, or modify
business transactions in BigQuery.

## Current scope

- `MASTER_DB` stores outlets, locations, stock items, unit conversions, WIP
  recipes, and showcase mappings.
- `OPERATIONS_DB` stores current sales, stock lots and movements, balances,
  transfers, showcase logs, upload jobs, daily summaries, and mock-recall
  relationships.
- `HISTORY_DB_2026` is the year-partitioned archive schema for 2026.
- R2 is reserved for uploaded files and exports. The jobs queue is bound as a
  producer only; no consumer is enabled during this pre-migration phase.
- The Worker exposes read-only inventory endpoints plus an authenticated,
  idempotent master-data synchronization endpoint.
- Google Apps Script remains the source of truth for master data during this
  phase. BigQuery remains the source of truth for operational transactions.
- All Cloudflare business tables start empty. Data cutover requires a separate,
  verified migration step.
- On 2026-09-22, all 27 business tables were checked and held 0 rows. The live
  health endpoint reported all three schema versions ready, and a request to
  a protected route without an API key returned HTTP 401.

## Migration progress

The copy migration started on 2026-09-23. BigQuery remains untouched and is
still the production source during verification.

- Master/reference data: copied to `MASTER_DB` (10,042 unique primary-key
  rows across the seven master tables).
- Current balances: 29,849 BigQuery rows processed in 40 batches, producing
  29,848 unique `(outlet, location, item_code)` rows in `OPERATIONS_DB`.
- Transaction ledger: resumable, idempotent copying from `stock_card_v2`
  started on 2026-09-23. The source contains 1,624,989 rows. The older
  `stock_card` and backup tables are intentionally excluded because they
  overlap.
- Balance anomalies remain unchanged during copy. Corrections are entered from
  the application so their audit trail is preserved.
- Application cutover: not started.

## Live service

- Worker: `https://bakerzin-inventory-api.operational-bi.workers.dev`
- Health check: `GET /health`
- Protected sync: `POST /v1/sync/master`
- Protected status: `GET /v1/sync/status`
- Protected ledger copy: `POST /v1/migrate/stock-movements`
- Protected ledger-copy status: `GET /v1/migrate/stock-movements/status`

Protected routes require the `x-api-key` header. Never commit the API key.

## Apps Script activation

After the matching `Code.gs` version has been deployed to the correct Apps
Script project, store these Script Properties:

- `CLOUDFLARE_INVENTORY_URL` = the Worker URL above
- `CLOUDFLARE_INVENTORY_API_KEY` = the Worker API key

Then run these functions in order:

1. `previewCloudflareInventoryMasterSync()` to validate the master data and
   review row counts without writing to Cloudflare.
2. `syncCloudflareInventoryMasters()` to perform the first idempotent sync.
3. `getCloudflareInventorySyncStatus()` to verify stored counts and the last
   completed job.
4. `installCloudflareInventoryMasterSyncTrigger()` only after the first sync
   has been checked. This installs a daily sync around 03:00.

The synchronization is upsert-only: it does not delete Cloudflare rows and it
does not write to BigQuery. Repeating the same payload is detected by its source
hash and returns the previous result without duplicating data.

For the ledger copy, add `CloudflareStockCardMigration.gs` to the Apps Script
project and run `startCloudflareStockCardMigration()` once. It creates a
five-minute continuation trigger, uses one cached BigQuery query job per date,
and saves the next result-page checkpoint only after Cloudflare confirms the
batch. Use `getCloudflareStockCardMigrationStatus()` for progress,
`retryCloudflareStockCardMigration()` after a temporary error, and
`stopCloudflareStockCardMigration()` to pause safely.

## Local verification and deployment

From this directory:

```text
pnpm run check
pnpm run deploy
```

Apply future D1 migrations deliberately to the corresponding database before
deploying Worker code that depends on them. Do not run the three SQL files as
one migration set against every D1 database. Keep secrets in Cloudflare
secrets and Apps Script Script Properties, never in source files.

Validate the split schema locally from the repository root:

```text
node scripts/validate-cloudflare-schema.mjs
```
