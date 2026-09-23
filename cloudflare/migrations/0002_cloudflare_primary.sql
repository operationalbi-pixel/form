-- Compatibility event ledger used during the Cloudflare-only cutover.
-- It preserves the existing append-only transfer audit model while BigQuery is disabled.
CREATE TABLE IF NOT EXISTS stock_transfer_events (
  event_id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  from_outlet TEXT,
  from_location TEXT,
  to_outlet TEXT,
  to_location TEXT,
  item_code TEXT,
  category TEXT,
  item_name TEXT,
  unit TEXT,
  qty REAL,
  received_qty REAL,
  note TEXT,
  expiry_date TEXT,
  delivery_date TEXT,
  created_by TEXT,
  created_by_name TEXT,
  created_at TEXT NOT NULL,
  accepted_by TEXT,
  accepted_by_name TEXT,
  accepted_at TEXT,
  received_at TEXT,
  storage_entered_at TEXT,
  product_temperature REAL,
  rejected_by TEXT,
  rejected_by_name TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  receipt_no TEXT,
  photo_file_ids TEXT,
  photo_count INTEGER,
  photo_data_json TEXT
);
CREATE INDEX IF NOT EXISTS ix_transfer_events_transfer ON stock_transfer_events(transfer_id, created_at);
CREATE INDEX IF NOT EXISTS ix_transfer_events_destination ON stock_transfer_events(to_outlet, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_transfer_events_source ON stock_transfer_events(from_outlet, status, created_at DESC);

INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('0002-cloudflare-primary', 'Cloudflare-only transfer event ledger and compatibility layer');
UPDATE platform_metadata SET value = 'cloudflare-primary', updated_at = CURRENT_TIMESTAMP WHERE key = 'migration_state';
