-- Midtrans-backed asset sale payments for Berita Acara.
-- MIDTRANS_SERVER_KEY and MIDTRANS_CLIENT_KEY are Worker secrets, never migration data.
CREATE TABLE IF NOT EXISTS ba_asset_payments (
  order_id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED')),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  outlet TEXT,
  nik TEXT,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  snap_token TEXT,
  redirect_url TEXT,
  midtrans_transaction_id TEXT,
  transaction_status TEXT,
  fraud_status TEXT,
  payment_type TEXT,
  paid_at TEXT,
  consumed_by_submission TEXT,
  consumed_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ba_asset_payments_status
  ON ba_asset_payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ba_asset_payments_customer
  ON ba_asset_payments(outlet, nik, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ba_asset_payment_submission
  ON ba_asset_payments(consumed_by_submission)
  WHERE consumed_by_submission IS NOT NULL;

INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('0003-ba-asset-payments', 'Verified Midtrans payments for Penjualan Asset BA');
UPDATE platform_metadata SET value = 'ba-asset-payments-ready', updated_at = CURRENT_TIMESTAMP WHERE key = 'migration_state';
