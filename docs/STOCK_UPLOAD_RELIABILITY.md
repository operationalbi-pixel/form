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
