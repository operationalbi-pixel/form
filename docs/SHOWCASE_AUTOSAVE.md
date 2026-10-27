# Showcase Log: direct confirmed saves

A row is sent when the user leaves it or presses Enter. **Simpan** remains available to send every ready row. Calculations and private device drafts update while typing. Invalid rows keep their input and display the reason; other rows are independent.

## Write path

Browser → scoped Cloudflare Worker endpoint → one atomic D1 batch → confirmed response.

New row saves do not use `queueShowcaseRow`, Drive request files, GAS triggers, job workers, or status polling. `COMPLETE` is returned only after the receipt, movements, balance changes, progress LOG markers and revision checkpoint commit together. A failure rolls the whole batch back. A lost acknowledgement is recovered using the same receipt and immutable request identity. The browser cannot guarantee delivery while offline or closed; device drafts remain available for retry.

Changing Input from 2 to 3 adds only 1. Reducing it reverses only the difference. Total is an explicit absolute correction and resets that activity’s Input contribution. Current balances, unit conversion and FIFO/FEFO metadata are checked in the Worker. Optimistic SQL guards detect concurrent changes and retry within the request; insufficient stock or invalid corrections return a clear error rather than creating a queued job. Conflicting tabs can review the confirmed values and use the next revision.

The existing GAS login/bootstrap still checks employee access and issues an expiring, signed capability restricted to the employee, outlet and individual Showcase item. The browser never receives the inventory API key. Capabilities are kept in memory, excluded from the page data cache, expire after five minutes and are renewed when needed. Only configured application origins can call the direct endpoint. The default allowed origin is the repository owner’s GitHub Pages origin; additional legitimate origins require `SHOWCASE_ALLOWED_ORIGINS` in the Worker.

## Existing requests

Already accepted legacy jobs are never replayed into a second write path or silently deleted. A direct write is fenced while accepted/partially written Showcase jobs for its outlet remain active. Unaccepted or rejected legacy requests can be retired under their original acceptance lock, backed up, and recovered as deterministic direct row edits. A late old-tab acceptance then sees the retirement record and cannot enqueue another stock write. Existing partially written jobs must finish their saved plan. Periodic job polling runs only while legacy jobs still need it.

## Rollout

1. Deploy the Worker first, preserving all existing bindings, secrets and dashboard-set variables. No SQL migration or new queue is required; receipts and immutable checkpoints use the existing operations `application_records` table.
2. Merge/publish the synchronized GAS and frontend changes through the existing workflows. Frontend autosave enables only after a fresh bootstrap advertises version 2 and scoped grants. There is no fallback from failed direct saving into a new background job.
3. Verify access and a small authorized transaction in the live application. Production write latency has not been measured by the automated tests.

## Validation

`TZ=UTC npm test` covers real SQLite transactions, rollback, lost acknowledgements, concurrent sales, signed scope/CORS checks, lot metadata, unit conversion, revision correction, offline/reload retry, grant renewal, tab conflicts and legacy recovery. `wrangler deploy --dry-run` checks bundling and bindings. Tests use local storage and simulated services; production stock is not modified during testing.
