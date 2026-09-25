-- Daily Staff Performance: runtime source of truth in Cloudflare D1.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS staff_performance_outlets (
  outlet_code TEXT PRIMARY KEY,
  outlet_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'OUTLET',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_performance_staff (
  nik TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  outlet_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_staff_performance_staff_scope
  ON staff_performance_staff(outlet_code, status, position, name);

CREATE TABLE IF NOT EXISTS staff_performance_indicators (
  indicator_id TEXT PRIMARY KEY,
  outlet_code TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  indicator_name TEXT NOT NULL,
  weight_json TEXT NOT NULL DEFAULT '0',
  target TEXT,
  threshold_a TEXT,
  threshold_b TEXT,
  threshold_c TEXT,
  threshold_d TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_staff_performance_indicators_scope
  ON staff_performance_indicators(outlet_code, status, category);

CREATE TABLE IF NOT EXISTS staff_performance_scores (
  transaction_id TEXT PRIMARY KEY,
  score_date TEXT NOT NULL,
  nik TEXT NOT NULL,
  indicator_id TEXT NOT NULL,
  achievement TEXT,
  final_score REAL NOT NULL DEFAULT 0,
  note TEXT,
  migrated_from TEXT NOT NULL DEFAULT 'CLOUDFLARE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(score_date, nik, indicator_id)
);
CREATE INDEX IF NOT EXISTS ix_staff_performance_scores_date
  ON staff_performance_scores(score_date, nik);
CREATE INDEX IF NOT EXISTS ix_staff_performance_scores_nik
  ON staff_performance_scores(nik, score_date DESC);

CREATE TABLE IF NOT EXISTS staff_performance_migration_batches (
  job_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  batch_type TEXT NOT NULL CHECK (batch_type IN ('MASTER', 'SCORES')),
  received_rows INTEGER NOT NULL DEFAULT 0,
  written_rows INTEGER NOT NULL DEFAULT 0,
  checkpoint_row INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(job_id, batch_id)
);
CREATE INDEX IF NOT EXISTS ix_staff_performance_migration_job
  ON staff_performance_migration_batches(job_id, checkpoint_row);

INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('0004-staff-performance', 'Cloudflare-only Daily Staff Performance data and migration tracking');
UPDATE platform_metadata SET value = 'staff-performance-ready', updated_at = CURRENT_TIMESTAMP WHERE key = 'migration_state';
