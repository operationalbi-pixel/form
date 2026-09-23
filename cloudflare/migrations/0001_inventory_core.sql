-- Bakerzin Inventory Core on Cloudflare D1
-- Schema only. No BigQuery data is copied by this migration.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outlets (
  outlet_code TEXT PRIMARY KEY,
  outlet_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_locations (
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  location_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (outlet_code, location_code),
  FOREIGN KEY (outlet_code) REFERENCES outlets(outlet_code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_items (
  item_code TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  item_name TEXT NOT NULL,
  default_unit TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_items_name
  ON stock_items(item_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS ix_stock_items_category_active
  ON stock_items(category, active);

CREATE TABLE IF NOT EXISTS stock_item_visibility (
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (outlet_code, location_code, item_code),
  FOREIGN KEY (outlet_code, location_code)
    REFERENCES stock_locations(outlet_code, location_code) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES stock_items(item_code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_unit_conversions (
  item_code TEXT NOT NULL,
  from_unit TEXT NOT NULL,
  to_unit TEXT NOT NULL,
  factor REAL NOT NULL CHECK (factor > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (item_code, from_unit, to_unit),
  FOREIGN KEY (item_code) REFERENCES stock_items(item_code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wip_formulas (
  formula_code TEXT PRIMARY KEY,
  formula_name TEXT NOT NULL,
  finished_unit TEXT NOT NULL,
  sales_usage_mode TEXT NOT NULL DEFAULT 'AUTO_PRODUCE'
    CHECK (sales_usage_mode IN ('AUTO_PRODUCE', 'DIRECT_WIP')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (formula_code) REFERENCES stock_items(item_code) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS wip_recipe_materials (
  formula_code TEXT NOT NULL,
  material_code TEXT NOT NULL,
  material_name TEXT,
  qty_usage REAL NOT NULL CHECK (qty_usage > 0),
  material_unit TEXT NOT NULL,
  sequence_no INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (formula_code, material_code),
  FOREIGN KEY (formula_code) REFERENCES wip_formulas(formula_code) ON DELETE CASCADE,
  FOREIGN KEY (material_code) REFERENCES stock_items(item_code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_wip_material_code
  ON wip_recipe_materials(material_code);

CREATE TABLE IF NOT EXISTS showcase_items (
  menu_code TEXT PRIMARY KEY,
  menu_name TEXT NOT NULL,
  menu_category TEXT,
  menu_category_detail TEXT,
  product_code TEXT NOT NULL,
  product_name TEXT,
  product_category TEXT,
  product_sub_category TEXT,
  product_unit TEXT NOT NULL,
  product_qty REAL NOT NULL CHECK (product_qty > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_code) REFERENCES stock_items(item_code) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_showcase_items_menu_name
  ON showcase_items(menu_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS ix_showcase_items_product
  ON showcase_items(product_code, active);

CREATE TABLE IF NOT EXISTS sales_documents (
  document_id TEXT PRIMARY KEY,
  outlet_code TEXT NOT NULL,
  sale_date TEXT NOT NULL,
  bill_number TEXT,
  source_file TEXT,
  source_hash TEXT,
  upload_job_id TEXT,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_code) REFERENCES outlets(outlet_code) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_document_source
  ON sales_documents(outlet_code, sale_date, source_hash)
  WHERE source_hash IS NOT NULL AND source_hash <> '';
CREATE INDEX IF NOT EXISTS ix_sales_document_bill
  ON sales_documents(outlet_code, bill_number, sale_date);

CREATE TABLE IF NOT EXISTS sales_lines (
  sale_line_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  source_row INTEGER,
  product_name TEXT NOT NULL,
  item_code TEXT,
  category TEXT,
  quantity REAL NOT NULL CHECK (quantity >= 0),
  unit TEXT,
  route_type TEXT NOT NULL
    CHECK (route_type IN ('SHOWCASE', 'DIRECT_STOCK', 'WIP_AUTO_PRODUCE', 'DIRECT_WIP', 'UNRESOLVED')),
  formula_code TEXT,
  showcase_menu_code TEXT,
  processing_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED', 'ERROR')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES sales_documents(document_id) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES stock_items(item_code) ON DELETE RESTRICT,
  FOREIGN KEY (formula_code) REFERENCES wip_formulas(formula_code) ON DELETE RESTRICT,
  FOREIGN KEY (showcase_menu_code) REFERENCES showcase_items(menu_code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_sales_lines_product
  ON sales_lines(product_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS ix_sales_lines_item
  ON sales_lines(item_code, processing_status);

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
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'DEPLETED', 'BLOCKED', 'EXPIRED', 'CANCELLED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_code, location_code)
    REFERENCES stock_locations(outlet_code, location_code) ON DELETE RESTRICT,
  FOREIGN KEY (item_code) REFERENCES stock_items(item_code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_stock_lots_fefo
  ON stock_lots(outlet_code, location_code, item_code, status, expiry_date, arrival_date, created_at);
CREATE INDEX IF NOT EXISTS ix_stock_lots_source
  ON stock_lots(source_type, source_id);

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
  source_hash TEXT,
  source_row INTEGER,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_code, location_code)
    REFERENCES stock_locations(outlet_code, location_code) ON DELETE RESTRICT,
  FOREIGN KEY (item_code) REFERENCES stock_items(item_code) ON DELETE RESTRICT,
  FOREIGN KEY (lot_id) REFERENCES stock_lots(lot_id) ON DELETE RESTRICT,
  FOREIGN KEY (sale_line_id) REFERENCES sales_lines(sale_line_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_movements_logical_version
  ON stock_movements(logical_id, version)
  WHERE logical_id IS NOT NULL AND logical_id <> '';
CREATE INDEX IF NOT EXISTS ix_stock_movements_card
  ON stock_movements(outlet_code, location_code, item_code, event_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_stock_movements_sale
  ON stock_movements(sale_line_id);
CREATE INDEX IF NOT EXISTS ix_stock_movements_transfer
  ON stock_movements(transfer_id);
CREATE INDEX IF NOT EXISTS ix_stock_movements_source
  ON stock_movements(source_hash, source_row);

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

CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_lot_allocation
  ON stock_lot_allocations(movement_id, lot_id, allocation_order);
CREATE INDEX IF NOT EXISTS ix_stock_lot_allocations_lot
  ON stock_lot_allocations(lot_id, created_at);

CREATE TABLE IF NOT EXISTS stock_balances (
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  item_name TEXT,
  current_qty REAL NOT NULL DEFAULT 0,
  unit TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (outlet_code, location_code, item_code),
  FOREIGN KEY (outlet_code, location_code)
    REFERENCES stock_locations(outlet_code, location_code) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES stock_items(item_code) ON DELETE CASCADE
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
  photo_data_json TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_outlet, from_location)
    REFERENCES stock_locations(outlet_code, location_code) ON DELETE RESTRICT,
  FOREIGN KEY (to_outlet, to_location)
    REFERENCES stock_locations(outlet_code, location_code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_stock_transfers_source_status
  ON stock_transfers(from_outlet, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_stock_transfers_destination_status
  ON stock_transfers(to_outlet, status, created_at DESC);

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
  FOREIGN KEY (item_code) REFERENCES stock_items(item_code) ON DELETE RESTRICT,
  FOREIGN KEY (source_movement_id) REFERENCES stock_movements(record_id) ON DELETE RESTRICT,
  FOREIGN KEY (destination_movement_id) REFERENCES stock_movements(record_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_stock_transfer_lines_transfer
  ON stock_transfer_lines(transfer_id, item_code);

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
  source_row INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_code, location_code)
    REFERENCES stock_locations(outlet_code, location_code) ON DELETE RESTRICT,
  FOREIGN KEY (menu_code) REFERENCES showcase_items(menu_code) ON DELETE RESTRICT,
  FOREIGN KEY (inbound_movement_id) REFERENCES stock_movements(record_id) ON DELETE RESTRICT,
  FOREIGN KEY (sold_movement_id) REFERENCES stock_movements(record_id) ON DELETE RESTRICT,
  FOREIGN KEY (waste_movement_id) REFERENCES stock_movements(record_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_showcase_daily_log
  ON showcase_daily_logs(outlet_code, log_date DESC, menu_code);

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

CREATE UNIQUE INDEX IF NOT EXISTS ux_mock_recall_edge
  ON mock_recall_edges(trace_root_id, parent_type, parent_id, child_type, child_id, relation_type);
CREATE INDEX IF NOT EXISTS ix_mock_recall_parent
  ON mock_recall_edges(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS ix_mock_recall_child
  ON mock_recall_edges(child_type, child_id);

CREATE TABLE IF NOT EXISTS upload_jobs (
  job_id TEXT PRIMARY KEY,
  upload_type TEXT NOT NULL,
  outlet_code TEXT,
  location_code TEXT,
  event_date TEXT,
  source_file TEXT,
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

CREATE INDEX IF NOT EXISTS ix_upload_jobs_status
  ON upload_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS stock_daily_summary (
  event_date TEXT NOT NULL,
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  opening_qty REAL NOT NULL DEFAULT 0,
  in_qty REAL NOT NULL DEFAULT 0,
  out_qty REAL NOT NULL DEFAULT 0,
  closing_qty REAL NOT NULL DEFAULT 0,
  upload_type TEXT,
  movement_count INTEGER NOT NULL DEFAULT 0,
  last_movement_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_date, outlet_code, location_code, item_code)
);

CREATE INDEX IF NOT EXISTS ix_stock_daily_summary_scope
  ON stock_daily_summary(outlet_code, location_code, event_date DESC);

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
VALUES ('0001', 'Inventory core schema: stock, WIP, showcase, transfer, upload, and mock recall');
