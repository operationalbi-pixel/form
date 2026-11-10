-- Independent SO intake. Does not alter the stock ledger or current balances.
CREATE TABLE IF NOT EXISTS so_upload_jobs (
  job_id TEXT PRIMARY KEY,
  owner_nik TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  file_name TEXT NOT NULL,
  source_key TEXT NOT NULL,
  parsed_key TEXT,
  event_date TEXT NOT NULL,
  location_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('RECEIVED','STAGING','READY','PREPARING','PROCESSING','COMPLETE','ACTION_REQUIRED','CANCELLED')),
  total INTEGER NOT NULL DEFAULT 0,
  staged INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_nik,source_hash,event_date,location_code)
);
CREATE INDEX IF NOT EXISTS so_upload_jobs_owner ON so_upload_jobs(owner_nik,created_at);
CREATE TABLE IF NOT EXISTS so_upload_rows (
  job_id TEXT NOT NULL REFERENCES so_upload_jobs(job_id),
  source_row INTEGER NOT NULL,
  outlet_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(job_id,source_row),
  UNIQUE(job_id,outlet_code,item_code)
);
CREATE INDEX IF NOT EXISTS so_upload_rows_scope ON so_upload_rows(job_id,outlet_code,item_code);

-- Queue delivery is only a wake-up signal. This durable outbox is the source
-- of pending work, including a lost send or an exhausted Queue delivery.
CREATE TABLE IF NOT EXISTS so_upload_outbox (
  job_id TEXT PRIMARY KEY REFERENCES so_upload_jobs(job_id),
  available_at INTEGER NOT NULL DEFAULT 0
);
