# Replacement Stock Opname pipeline

Status: implementation in progress; no production route or UI cutover yet.
The existing failed SO job was cancelled separately. Do not resume it alongside
this pipeline or describe a READY staging job as stock successfully saved.

## Implemented and tested

- XLSX ingestion without a worksheet XML DOM; structured validation errors.
- R2 source and parsed staging, deterministic acceptance, durable outbox.
- Fenced staging leases, cancellation during parsing, bounded 500-row staging.
- Canonical projection with global version resolution before scope filtering.
- D1 aggregation using latest SO checkpoint and subsequent movements.
- Strict unit validation, deterministic audit/movement IDs independent of owner.
- Atomic 25-item commits: balance adjustment, audit, movement and batch receipt.
- Retry receipts, stale revision rejection, transaction rollback on ledger failure.

The original October workbook contains 30,611 source rows in 10 outlets. Its
bytes and parsed business data stay outside the repository. Local parser timing
is not an upload performance guarantee. Production D1 master currently marks
BIKK inactive, whereas the file includes it: source the outlet authorization
directory from the same authenticated account flow as the existing application.

## Required before production cutover

1. Finish the coordinator: authenticated BIHQ grant, directory snapshot, Queue
   dispatch and outbox recovery, complete unit/duplicate validation, persist all
   plan chunks, scoped commits, IMPORT markers, completion and owner status.
2. Use an incremental projection feed for ongoing ledger changes. The current
   full keyset copier is bootstrap machinery, not a per-upload operation. It
   must not repeatedly rebuild all history when another outlet writes.
3. Validate source revision fencing across operations and history databases;
   initialize missing master items only after validation and recheck units.
   Reject a changed plan before committing, and retain already committed batch
   receipts for reconciliation. Never silently restart with new movement IDs.
4. Reconcile the real workbook's dated balances and current-balance effects,
   including later SO checkpoints, against production records in read-only mode.
5. Install schema and a dedicated SO queue/DLQ; deploy the Worker before enabling
   the browser route. Do not share the old receipt/GAS worker lock.
6. Verify the full workbook through COMPLETE with audit/movement counts and
   correct stock. Verify browser disconnect, duplicate delivery and concurrent
   transaction behavior. Only then enable the replacement path for users.

`so-projection.mjs` and `so-plan.mjs` export their DDL for isolated tests; a final
ordered migration must include those tables before coordinator deployment.
`test/so-parse-worker.mjs` is a local parsing harness, not a production endpoint.
