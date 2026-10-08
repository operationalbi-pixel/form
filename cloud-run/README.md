# Stock Card Read API

Cloud Run service for the fast Stock Card read path. The health endpoint is
public. Stock history and cache invalidation endpoints require the internal API
key supplied through Secret Manager.

Stock history is served from Firestore for two minutes. A cache miss reads the current balance and recent movements from the authenticated
Cloudflare inventory API, then
stores the compact result in Firestore.

## Local verification

```sh
npm test
npm start
```

## Runtime configuration

- Region: `asia-southeast2`
- Runtime service account: `stock-card-api@berita-acara-digital.iam.gserviceaccount.com`
- Request-based billing
- Minimum instances: `0`
- Maximum instances: `2`
- Secret: `INTERNAL_API_KEY`
- Cloudflare configuration: `CLOUDFLARE_INVENTORY_API_URL`, `CLOUDFLARE_INVENTORY_API_KEY`
- Cloudflare authentication: `x-api-key`; no BigQuery client, query, or fallback
- Cache collection: `stock_read_models_cloudflare_v1` to exclude legacy cached responses
