-- Year-partitioned immutable history. No BigQuery rows are copied by this migration.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sales_documents_history (
  document_id TEXT PRIMARY KEY,
  outlet_code TEXT NOT NULL,
  sale_date TEXT NOT NULL,
  bill_number TEXT,
  source_file TEXT,
  source_object_key TEXT,
  source_hash TEXT,
  upload_job_id TEXT,
  uploaded_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_hist_sales_bill ON sales_documents_history(outlet_code, bill_number, sale_date);

CREATE TABLE IF NOT EXISTS sales_lines_history (
  sale_line_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  source_row INTEGER,
  product_name TEXT NOT NULL,
  item_code TEXT,
  category TEXT,
  quantity REAL NOT NULL,
  unit TEXT,
  route_type TEXT NOT NULL,
  formula_code TEXT,
  showcase_menu_code TEXT,
  processing_status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES sales_documents_history(document_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_hist_sales_item ON sales_lines_history(item_code, created_at);

CREATE TABLE IF NOT EXISTS stock_movements_history (
  record_id TEXT PRIMARY KEY,
  logical_id TEXT,
  version INTEGER NOT NULL,
  record_type TEXT NOT NULL,
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  category TEXT,
  item_name TEXT,
  unit TEXT NOT NULL,
  direction TEXT NOT NULL,
  quantity REAL NOT NULL,
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
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_hist_stock_card
  ON stock_movements_history(outlet_code, location_code, item_code, event_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_hist_movement_sale ON stock_movements_history(sale_line_id);
CREATE INDEX IF NOT EXISTS ix_hist_movement_lot ON stock_movements_history(lot_id, event_date);

CREATE TABLE IF NOT EXISTS stock_lot_allocations_history (
  allocation_id TEXT PRIMARY KEY,
  movement_id TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  allocation_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (movement_id) REFERENCES stock_movements_history(record_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_hist_alloc_lot ON stock_lot_allocations_history(lot_id, created_at);

CREATE TABLE IF NOT EXISTS showcase_daily_logs_history (
  log_id TEXT PRIMARY KEY,
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  log_date TEXT NOT NULL,
  menu_code TEXT NOT NULL,
  stock_in REAL NOT NULL,
  sold_qty REAL NOT NULL,
  waste_qty REAL NOT NULL,
  closing_qty REAL,
  created_by TEXT NOT NULL,
  source_file TEXT,
  source_object_key TEXT,
  source_row INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_hist_showcase ON showcase_daily_logs_history(outlet_code, log_date DESC, menu_code);

CREATE TABLE IF NOT EXISTS mock_recall_edges_history (
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
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_hist_recall_root ON mock_recall_edges_history(trace_root_id, created_at);
CREATE INDEX IF NOT EXISTS ix_hist_recall_parent ON mock_recall_edges_history(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS ix_hist_recall_child ON mock_recall_edges_history(child_type, child_id);

CREATE TABLE IF NOT EXISTS stock_daily_summary_history (
  event_date TEXT NOT NULL,
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  opening_qty REAL NOT NULL,
  in_qty REAL NOT NULL,
  out_qty REAL NOT NULL,
  closing_qty REAL NOT NULL,
  movement_count INTEGER NOT NULL,
  last_movement_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_date, outlet_code, location_code, item_code)
);
CREATE INDEX IF NOT EXISTS ix_hist_daily_scope
  ON stock_daily_summary_history(outlet_code, location_code, event_date DESC);

INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('0001-history', 'Year-partitioned history schema for sales, stock, showcase, summaries, and recall');
UPDATE platform_metadata SET value = 'schema-ready', updated_at = CURRENT_TIMESTAMP WHERE key = 'migration_state';
