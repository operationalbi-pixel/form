-- Master/reference data only. No BigQuery rows are copied by this migration.
PRAGMA foreign_keys = ON;

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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
CREATE INDEX IF NOT EXISTS ix_master_item_name ON stock_items(item_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS ix_master_item_category ON stock_items(category, active);

CREATE TABLE IF NOT EXISTS stock_item_visibility (
  outlet_code TEXT NOT NULL,
  location_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (outlet_code, location_code, item_code),
  FOREIGN KEY (outlet_code, location_code) REFERENCES stock_locations(outlet_code, location_code) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS ix_master_recipe_material ON wip_recipe_materials(material_code);

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
CREATE INDEX IF NOT EXISTS ix_master_showcase_name ON showcase_items(menu_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS ix_master_showcase_product ON showcase_items(product_code, active);

INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('0001-master', 'Master schema for outlets, items, conversions, WIP recipes, and showcase mapping');
UPDATE platform_metadata SET value = 'schema-ready', updated_at = CURRENT_TIMESTAMP WHERE key = 'migration_state';
