# Showcase Log autosave

- Edit a row, then leave the row or press Enter to send it. Moving between fields in the same row only updates the preview and local draft.
- **Simpan** remains available to send every ready row. Invalid rows keep their drafts; other rows can proceed.
- Input is the contribution from the current row edit: changing 2 to 3 adds only 1. Reducing it to 1 reverses 2. Editing Total sets the day total and resets that activity's Input contribution to zero.
- Row status distinguishes unsent, saving, confirmed, and rejected changes. Only a server `COMPLETE` confirms persistence. Timing still depends on network, stock locks, and the background worker.
- Drafts and immutable outbox requests are private to the employee, outlet, date, and item on the device. Reconnecting or reopening the page retries uncertain delivery with the same request ID. Unsent device-only data cannot reach the server while the page is closed or offline.
- Later edits wait for the preceding revision to complete and for fresh totals before being sent. A response lost after acceptance cannot create another request. Conflicting edits from two tabs use the same revision identity and are rejected rather than added twice.
- Rejected validation can be corrected and resubmitted. A partially written failed job must first continue its saved plan with **Coba lagi**; it cannot be replaced by a new payload. Existing manual jobs remain available through Status Simpan.

## Deployment

Merge the frontend, backend copies, and tests together. Main GAS and Pages deploy through the existing workflows. The frontend enables autosave only after a fresh bootstrap advertises `autosaveVersion: 1`, so Pages may safely arrive before GAS. No Worker deployment or SQL migration is needed: immutable revision checkpoints use the existing authenticated `application_records` endpoint under `showcase_row_edits`.

The worker records the revision checkpoint only after every stock movement has been acknowledged, before marking the job complete. Retry keeps the saved plan and movement IDs. Checkpoints are append-only per revision and remain usable when older background job metadata expires.

## Validation

Run `TZ=UTC npm test`. Autosave tests cover row boundaries, manual Save, 2-to-3 corrections, reverse corrections, other users' intervening totals, uncertain acknowledgements, offline/reload retry, conflicting tab identities, explicit total corrections, and rejection recovery. Tests use simulated storage and services; production transactions are not modified during verification.
