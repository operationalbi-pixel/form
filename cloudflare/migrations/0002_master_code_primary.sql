-- Item and menu codes are authoritative. Names are lookup fallbacks and may repeat.
DROP INDEX IF EXISTS ux_master_item_name;
DROP INDEX IF EXISTS ux_master_showcase_name;
CREATE INDEX IF NOT EXISTS ix_master_item_name ON stock_items(item_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS ix_master_showcase_name ON showcase_items(menu_name COLLATE NOCASE);

INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('0002-master-code-primary', 'Allow duplicate fallback names; keep codes as primary identity');
