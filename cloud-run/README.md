# Stock Card Read API

Cloud Run service for the fast Stock Card read path. The initial version only
exposes a health endpoint so deployment, region, scaling, and runtime identity
can be verified before any Stock Card data is connected.

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
