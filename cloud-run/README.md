# Stock Card Read API

Cloud Run service for the fast Stock Card read path. The health endpoint is
public. Stock history and cache invalidation endpoints require the internal API
key supplied through Secret Manager.

Stock history is served from Firestore for two minutes. A cache miss runs one
parameterized BigQuery query for the current balance and recent movements, then
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
- BigQuery maximum bytes per history cache miss: 1 GB
