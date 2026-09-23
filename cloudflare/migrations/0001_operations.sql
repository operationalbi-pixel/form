-- Active operational data. Master codes are validated by the Worker API.
-- No BigQuery rows are copied by this migration.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sales_documents (
  document_id TEXT PRIMARY KEY,
  outlet_code TEXT NOT NULL,
  sale_date TEXT NOT NULL,
  bill_number TEXT,
  source_file TEXT,
  source_object_key TEXT,
  source_hash TEXT,
  upload_job_id TEXT,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_sales_source ON sales_documents(outlet_code, sale_date, source_hash)
  WHERE source_hash IS NOT NULL AND source_hash <> '';
CREATE INDEX IF NOT EXISTS ix_ops_sales_bill ON sales_documents(outlet_code, bill_number, sale_date);

CREATE TABLE IF NOT EXISTS sales_lines (
  sale_line_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  source_row INTEGER,
  product_name TEXT NOT NULL,
  item_code TEXT,
  category TEXT,
  quantity REAL NOT NULL CHECK (quantity >= 0),
  unit TEXT,
  route_type TEXT NOT NULL CHECK (route_type IN ('SHOWCASE', 'DIRECT_STOCK', 'WIP_AUTO_PRODUCE', 'DIRECT_WIP', 'UNRESOLVED')),
  formula_code TEXT,
  showcase_menu_code TEXT,
  processing_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED', 'ERROR')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES sales_documents(document_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_ops_sales_product ON sales_lines(product_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS ix_ops_sales_item ON sales_lines(item_code, processing_status);

CREATE TABLE IF NOT EXISTS stock_lots (
  lot_id TEXT PRIMARY KEY,
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  arrival_date TEXT,
  production_date TEXT,
  expiry_date TEXT,
  source_type TEXT,
  source_id TEXT,
  original_qty REAL NOT NULL DEFAULT 0 CHECK (original_qty >= 0),
  current_qty REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DEPLETED', 'BLOCKED', 'EXPIRED', 'CANCELLED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ops_lots_fefo
  ON stock_lots(outlet_code, location_code, item_code, status, expiry_date, arrival_date, created_at);
CREATE INDEX IF NOT EXISTS ix_ops_lots_source ON stock_lots(source_type, source_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  record_id TEXT PRIMARY KEY,
  logical_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  record_type TEXT NOT NULL DEFAULT 'MOVEMENT',
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  category TEXT,
  item_name TEXT,
  unit TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT', 'NONE')),
  quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  movement_type TEXT NOT NULL,
  info TEXT,
  event_date TEXT NOT NULL,
  arrival_date TEXT,
  production_date TEXT,
  expiry_date TEXT,
  supplier TEXT,
  lot_id TEXT,
  sale_line_id TEXT,
  transfer_id TEXT,
  source_file TEXT,
  source_object_key TEXT,
  source_hash TEXT,
  source_row INTEGER,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lot_id) REFERENCES stock_lots(lot_id) ON DELETE RESTRICT,
  FOREIGN KEY (sale_line_id) REFERENCES sales_lines(sale_line_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_movement_version ON stock_movements(logical_id, version)
  WHERE logical_id IS NOT NULL AND logical_id <> '';
CREATE INDEX IF NOT EXISTS ix_ops_stock_card
  ON stock_movements(outlet_code, location_code, item_code, event_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ops_movement_sale ON stock_movements(sale_line_id);
CREATE INDEX IF NOT EXISTS ix_ops_movement_transfer ON stock_movements(transfer_id);
CREATE INDEX IF NOT EXISTS ix_ops_movement_source ON stock_movements(source_hash, source_row);

CREATE TABLE IF NOT EXISTS stock_lot_allocations (
  allocation_id TEXT PRIMARY KEY,
  movement_id TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  allocation_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (movement_id) REFERENCES stock_movements(record_id) ON DELETE CASCADE,
  FOREIGN KEY (lot_id) REFERENCES stock_lots(lot_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_lot_allocation ON stock_lot_allocations(movement_id, lot_id, allocation_order);
CREATE INDEX IF NOT EXISTS ix_ops_allocation_lot ON stock_lot_allocations(lot_id, created_at);

CREATE TABLE IF NOT EXISTS stock_balances (
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  item_name TEXT,
  current_qty REAL NOT NULL DEFAULT 0,
  unit TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (outlet_code, location_code, item_code)
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  transfer_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SOURCE_POSTED', 'DESTINATION_POSTED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'ERROR')),
  from_outlet TEXT NOT NULL,
  from_location TEXT NOT NULL,
  to_outlet TEXT NOT NULL,
  to_location TEXT NOT NULL,
  delivery_date TEXT,
  receipt_no TEXT,
  note TEXT,
  created_by TEXT NOT NULL,
  created_by_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_by TEXT,
  accepted_by_name TEXT,
  accepted_at TEXT,
  received_at TEXT,
  storage_entered_at TEXT,
  rejected_by TEXT,
  rejected_by_name TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  photo_object_keys_json TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ops_transfer_source ON stock_transfers(from_outlet, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ops_transfer_destination ON stock_transfers(to_outlet, status, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
  transfer_line_id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  category TEXT,
  item_name TEXT,
  unit TEXT NOT NULL,
  requested_qty REAL NOT NULL CHECK (requested_qty > 0),
  received_qty REAL,
  expiry_date TEXT,
  product_temperature REAL,
  source_movement_id TEXT,
  destination_movement_id TEXT,
  note TEXT,
  FOREIGN KEY (transfer_id) REFERENCES stock_transfers(transfer_id) ON DELETE CASCADE,
  FOREIGN KEY (source_movement_id) REFERENCES stock_movements(record_id) ON DELETE RESTRICT,
  FOREIGN KEY (destination_movement_id) REFERENCES stock_movements(record_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_ops_transfer_lines ON stock_transfer_lines(transfer_id, item_code);

CREATE TABLE IF NOT EXISTS showcase_daily_logs (
  log_id TEXT PRIMARY KEY,
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL DEFAULT 'Showcase',
  log_date TEXT NOT NULL,
  menu_code TEXT NOT NULL,
  stock_in REAL NOT NULL DEFAULT 0 CHECK (stock_in >= 0),
  sold_qty REAL NOT NULL DEFAULT 0 CHECK (sold_qty >= 0),
  waste_qty REAL NOT NULL DEFAULT 0 CHECK (waste_qty >= 0),
  closing_qty REAL,
  inbound_movement_id TEXT,
  sold_movement_id TEXT,
  waste_movement_id TEXT,
  created_by TEXT NOT NULL,
  source_file TEXT,
  source_object_key TEXT,
  source_row INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ops_showcase_log ON showcase_daily_logs(outlet_code, log_date DESC, menu_code);

CREATE TABLE IF NOT EXISTS mock_recall_edges (
  edge_id TEXT PRIMARY KEY,
  trace_root_id TEXT NOT NULL,
  parent_type TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  child_type TEXT NOT NULL,
  child_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  event_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_recall_edge
  ON mock_recall_edges(trace_root_id, parent_type, parent_id, child_type, child_id, relation_type);
CREATE INDEX IF NOT EXISTS ix_ops_recall_parent ON mock_recall_edges(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS ix_ops_recall_child ON mock_recall_edges(child_type, child_id);

CREATE TABLE IF NOT EXISTS upload_jobs (
  job_id TEXT PRIMARY KEY,
  upload_type TEXT NOT NULL,
  outlet_code TEXT,
  location_code TEXT,
  event_date TEXT,
  source_file TEXT,
  source_object_key TEXT,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'ERROR', 'CANCELLED')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  checkpoint_row INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  error_message TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (upload_type, source_hash)
);
CREATE INDEX IF NOT EXISTS ix_ops_jobs_status ON upload_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS stock_daily_summary (
  event_date TEXT NOT NULL,
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  opening_qty REAL NOT NULL DEFAULT 0,
  in_qty REAL NOT NULL DEFAULT 0,
  out_qty REAL NOT NULL DEFAULT 0,
  closing_qty REAL NOT NULL DEFAULT 0,
  movement_count INTEGER NOT NULL DEFAULT 0,
  last_movement_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_date, outlet_code, location_code, item_code)
);
CREATE INDEX IF NOT EXISTS ix_ops_daily_scope ON stock_daily_summary(outlet_code, location_code, event_date DESC);

CREATE VIEW IF NOT EXISTS v_stock_card_active AS
WITH ranked AS (
  SELECT m.*,
         ROW_NUMBER() OVER (
           PARTITION BY COALESCE(NULLIF(m.logical_id, ''), m.record_id)
           ORDER BY m.version DESC, m.created_at DESC
         ) AS row_rank
  FROM stock_movements m
)
SELECT * FROM ranked WHERE row_rank = 1;

INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('0001-operations', 'Operational schema for active sales, stock, lots, transfers, uploads, and recall');
UPDATE platform_metadata SET value = 'schema-ready', updated_at = CURRENT_TIMESTAMP WHERE key = 'migration_state';
