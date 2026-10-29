# Repo-wide UrlFetch removal

Target: no production or maintenance operation in this repository depends on Apps Script UrlFetch. Apps Script may retain identity, Sheet and Drive operations. Network work belongs in Cloudflare or a browser using scoped grants. Do not replace a confirmed write with an unacknowledged queued write without changing and validating that operation's contract.

## Verified baseline and progress

The baseline contained 16 direct UrlFetch/fetchAll call sites in deployed GAS sources, including maintenance scripts. A call-site count is not a count of completed features: the inventory gateway alone serves many operations.

- Goods Receipt verification and durable writes already run directly on Cloudflare (#252/#253). Stock Card can expose authenticated outlet context if inventory loading hits quota, with unavailable balances marked explicitly.
- Firebase chat ticks and FCM delivery now use a private Sheet/Drive outbox and Cloudflare delivery. OAuth exchange happens in Cloudflare; GAS signs short-lived assertions without sending HTTP. The obsolete network call in `authorizeProjectServices` is removed. This removes five of the sixteen baseline call sites.
- Remaining work: the inventory gateway and preload fanout; optional Cloud Run history/cache calls; authenticated stock/task movement reads; two XLSX templates and an unused legacy exporter; external SOPI source retrieval; stock-history/staff-performance migration scripts. These are not yet quota-free.

## Outbox contract

`CF_APP_OUTBOX` stores an immutable payload file ID, state, creation time, delivery lease, attempt count and a bounded error. Payload files remain private. Enqueue does not claim delivery. API responses can carry a five-minute signed event-ID hint; `api-client.js` asynchronously submits it to Cloudflare. A one-minute Cloudflare cron recovers pending events without an open browser.

The GAS service bridge accepts only HMAC-signed, time-bounded, non-replayed envelopes from the Worker. It exposes fixed pending/prepare/finish operations, never an arbitrary URL or method proxy. Private RSA keys remain in Script Properties; only short-lived, fixed-scope OAuth assertions cross to the Worker. The browser never receives these assertions or service credentials.

The Worker exchanges OAuth assertions, sends FCM and conditionally updates RTDB using ETags. Confirmed/invalid-device deliveries are checkpointed by event and device hash. After a partial failure, only unconfirmed recipients are attempted again. FCM cannot provide an atomic transaction with D1: an ambiguous external acknowledgement can still cause duplicate delivery. Event identity remains stable. Older realtime timestamps do not overwrite newer ones.

A completed event is durable before its payload file is trashed. A failed event retains its file. Temporary failures are retried; terminal failures stay visible in the outbox and can be retried through the BIHQ-only `appOutboundRetry` action. `appOutboundStatus` exposes metadata, not payloads or recipient tokens. Registered push tokens are rechecked before dispatch.

## Outbox deployment and checks

Preserve all existing Worker bindings/runtime settings. Add `APP_OUTBOUND_QUEUE` pointing to `bakerzin-app-outbound`, `APP_GAS_URL` pointing to the existing production GAS `/exec` URL, a dedicated consumer and dead-letter queue, and the one-minute cron. Preserve the existing Receipt consumer. Deploy the Worker before GAS. All GAS files, including `CloudflareOutbox.gs` and `FirebaseRtdb.gs`, must be included.

Run `TZ=UTC npm test`. Outbox tests use fake Google/Firebase providers and send no live messages. They cover signed service access and replay rejection, private payloads, quota-free enqueue/signing, deduplicated hints, partial FCM recovery, completed-event replay, stale ticks, browser kicks and poll health. Verify production deployment and read `application_records` / `app_outbound_health:last_poll`; do not trigger test notifications to real recipients.
