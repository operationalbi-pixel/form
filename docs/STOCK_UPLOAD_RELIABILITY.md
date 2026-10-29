# Stock upload reliability

## Write and recovery contract

- Movement identity, version ordering and balance effects are checked within the same D1 transaction. Concurrent replay of a record ID applies its stock effect once. History remains append only; archived versions participate in correction baselines.
- Goods and Usage persist complete write plans before mutations. Usage retries replay the original IDs and FIFO allocations after an ambiguous acknowledgement. A pending cursor is persisted before deleting its plan.
- Stock Posisi and Expired Date preserve their existing deterministic IDs. Failed jobs retain recovery files until metadata retention expires. The authenticated owner can retry available plans; current employee/outlet access is checked again.
- Completion is persisted before best effort temporary-file cleanup. Cleanup errors cannot turn committed stock into a failed upload.

## Execution and reads

- Goods leases no longer block unrelated outlets. Inventory scopes are acquired in deterministic order; Showcase claims both Store and Showcase. Lock leases cover the execution budget.
- Goods adapts batches between 50 and 400 rows using observed duration. Stock Posisi and Expired Date use the remaining execution budget across preload windows instead of yielding after a fixed small item count.
- Permanent HTTP errors and daily URL Fetch quota failures are not retried. Temporary transport/service failures retain bounded retries.
- Resolved FIFO history reads use at most ten item codes per query. Source-hash lookups are pushed into SQL and split into bounded URL-sized groups, avoiding full-outlet scans. Pagination overflow still fails explicitly rather than silently truncating inventory history.
- Status polls continue while active jobs exist, including with the panel closed. Newly observed completion invalidates stock caches once. Responses from an old account or stock scope cannot overwrite the current view.

## Validation and rollout

Run `TZ=UTC npm test`. Regression coverage includes real SQLite concurrent replay/rollback, ordered corrections and archived baselines; lost acknowledgements and durable Usage plans; error retry policy; disjoint Goods leases; budget-driven Position progress; access revocation; scoped history reads; and closed-panel completion refresh. Mock timings are regression scenarios, not a production latency guarantee.

Deploy the inventory Worker first, preserving all bindings and runtime settings. Then merge the GAS/frontend changes and verify Apps Script and Pages deployment. No schema migration or historical stock rewrite is required. Keep the previous Worker version available for rollback. Existing failed uploads are reviewed individually through Status Upload; do not bulk replay or change historical balances automatically.

## Direct Goods Receipt (29 October 2026)

Goods Receipt verification and stock writes use `/v1/receipt-direct`, avoiding Apps Script UrlFetch. A five-minute HMAC capability is issued after current Sheet-backed employee, outlet and location checks. The API key never enters the browser. CORS and server-side claim checks restrict requests. Unit conversion settings are mirrored through the existing Sheet-only save action and saved to the Cloudflare master database before verification continues.

The Worker reads XLSX with bounded ZIP expansion, preserves ESB Authorized/origin/date/expiry rules, resolves current movement versions for duplicate checks, and computes FEFO warnings. Acceptance stores the original request in private R2 and D1 metadata before awaiting durable Queue acknowledgement. If that acknowledgement fails, resend the same request ID; changing the file/decisions requires a new request ID. No stock is written by acceptance.

The dedicated `bakerzin-receipt-uploads` consumer must have **max concurrency 1**. It owns an outlet/location lease through completion, rechecks duplicates before persisting an immutable R2 plan, then processes 200 movements per message with stable IDs. A lost write acknowledgement replays that plan. Completed jobs release their own lease even when a completion message is replayed. Failed plans retain the lease until retried to protect later receipts from ambiguous duplicate checks. Failures before a plan exists release the lease and require re-verification. Source/plan objects are retained for recovery; no automatic deletion policy is added by this change.

Native and legacy upload statuses remain visible. Native Queue jobs never invoke the GAS worker starter. Other upload types and unrelated Stock Card reads still use their existing routes; this cutover specifically removes the Goods Receipt verification/upload dependency on UrlFetch. Existing ambiguous legacy Goods Receipt jobs must be reviewed before a new native plan can write into that outlet.

Build the committed module with `pnpm --dir cloudflare/inventory-api install --frozen-lockfile` and `pnpm --dir cloudflare/inventory-api build:receipt`. Deploy the Worker with the existing settings/bindings plus `RECEIPT_UPLOAD_QUEUE`, configure the dedicated consumer and DLQ, then merge GAS/frontend. Validate `node scripts/test-receipt-direct.mjs` and `TZ=UTC npm test`. Tests cover real XLSX parsing, access boundaries, conversion conflicts, 201-row chunking, duplicate choices, lost acknowledgements, quota-free grant issuance and browser routing.
