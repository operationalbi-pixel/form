# Stock Opname V2 — production rollout

**Code status (10 November 2026): implementation and automated tests passed; NOT deployed or enabled in production.**

The legacy SO upload remains the only live path. The new intake is disabled in the
Worker by `SO_V2_ENABLED=0` and in the browser unless
`window.BAKERZIN_SO_V2_ENABLED===true`. Do not activate either flag until
the production reconciliation gates below have passed.

## Implemented

- Verified BIHQ-only short-lived HMAC grant through the existing
  `/v1/stock-direct` gateway; verify, accept, status and cancel actions
- Stream-limited XLSX intake and stable acceptance identity; source stored
  in R2, then staged to D1 in 500-row steps without replaying the workbook
- Dedicated SO Queue, persistent outbox and scheduled dispatch recovery
- One-time cross-shard projection bootstrap and incremental source-ledger change
  feeds: insert/update/delete events refresh only changed logical identities
- Dated checkpoint balances and newer SO detection (a backdated SO leaves
  the current stock unchanged after a newer SO checkpoint)
- Precommit validation of master units, active outlets, duplicate SO dates,
  historical revisions and concurrent writes; new master items are created
  only AFTER all rows have been planned and validated
- 25-row atomic D1 commit with stock balance effects, audit, movement, receipt
  and committed cursor; retries cannot duplicate the same batch
- Progress counts for staged, planned and committed rows; `COMPLETE` requires
  reconciliation of expected audit/movement and durable receipt totals

## Deployment and cutover gates

1. **Production backup:** export/checkpoint operations, master and all history
   D1 databases; preserve recovery instructions, test restore access.
2. **Outlet directory:** master currently marks **BIKK inactive**, although the
   real October SO workbook includes BIKK after reopening. Reconcile the
   authenticated outlet directory and active flags before any acceptance.
   Never bypass inactive-outlet validation silently.
3. **Apply D1 migrations in order** (do not execute them twice):
   - Operations: `0007_so_upload_v2.sql`,
     `0013_so_v2_operations.sql`, `0014_so_v2_workflow.sql`
   - EVERY history D1 shard: `0013_so_v2_history.sql`.
   This installs journal triggers; do not run a full history rebuild for
   every future upload.
4. **Provision Queue/DLQ** `bakerzin-so-uploads` and
   `bakerzin-so-uploads-dlq` before deployment; verify queue consumer and
   R2/D1 bindings and the minute cron. Do NOT reuse the receipt queue.
5. Deploy Worker with **`SO_V2_ENABLED=0`** first. Verify existing
   Stock Card and Goods Receipt are unaffected.
6. Bootstrap the canonical projection once and synchronize the change feed
   through its captured journal watermark. Check SQL revision and D1 journal
   counts across all sources. Keep UI disabled.
7. **Read-only production reconciliation:** compare historical per-item dated
   balances, later SO checkpoints, current balance effects and duplicate SO
   records for the full original October workbook (30,611 rows / 10 outlets).
   Record exceptions rather than changing stock.
8. In controlled nonproduction/canary resources, upload the **entire actual
   workbook** to `COMPLETE`; verify total expected rows, audit rows,
   movements and current balances, and test concurrent changes, replay,
   cancellation, browser disconnect, partial Queue delivery, and rollback.
   Local XLSX parse timing is NOT proof of successful complete upload.
9. Activate Worker flag for limited BIHQ testing, then the browser flag,
   only when all data checks pass. Monitor Queue, outbox, leases, D1 usage,
   failure/latency metrics and opening/closing balance differences.
10. Keep the legacy upload available for rollback. Do not restart any
    previously cancelled job using the same file/source identifier.

## Automated validation

GitHub Actions runs the existing suite, `test:so-v2`, and a Wrangler
Worker bundle dry-run. The replacement tests include an end-to-end synthetic
XLSX upload from R2 intake through `COMPLETE`, exact-once receipts, creation
of new master items, backdated checkpoints, cross-shard corrections and
transaction rollback. These tests do **not** replace the complete real-workbook
reconciliation and real Cloudflare Queue testing.

## Implementation references

- `lib/so-direct.mjs` / `lib/so-intake.mjs`: grant-gated intake and job state
- `lib/so-coordinator.mjs`: staged validation, planning, commits, recovery
- `lib/so-projection.mjs`, `lib/so-projection-feed.mjs`: dated balances and
  incremental history projection
- `lib/so-plan.mjs`: deterministic audit/movement and atomic commit batches
- `test/so-v2.test.mjs`: SQLite and Worker-compatible automated tests

**No automatic production deployment is triggered merely by merging this PR.**
Keep it Draft until the production gates have been documented as passed.
