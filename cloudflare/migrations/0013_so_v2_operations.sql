-- Install only after 0007_so_upload_v2.sql and 0004_snapshot_operations.sql.
CREATE TABLE IF NOT EXISTS so_ledger_changes (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 logical_id TEXT NOT NULL,
 changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS so_ledger_changes_id ON so_ledger_changes(logical_id,seq);
CREATE TRIGGER IF NOT EXISTS so_feed_stock_movements_insert AFTER INSERT ON stock_movements BEGIN
 INSERT INTO so_ledger_changes(logical_id) VALUES(COALESCE(NULLIF(NEW.logical_id,''),NEW.record_id));
END;
CREATE TRIGGER IF NOT EXISTS so_feed_stock_movements_delete AFTER DELETE ON stock_movements BEGIN
 INSERT INTO so_ledger_changes(logical_id) VALUES(COALESCE(NULLIF(OLD.logical_id,''),OLD.record_id));
END;
CREATE TRIGGER IF NOT EXISTS so_feed_stock_movements_update AFTER UPDATE ON stock_movements BEGIN
 INSERT INTO so_ledger_changes(logical_id) VALUES(COALESCE(NULLIF(OLD.logical_id,''),OLD.record_id));
 INSERT INTO so_ledger_changes(logical_id)
 SELECT COALESCE(NULLIF(NEW.logical_id,''),NEW.record_id)
 WHERE COALESCE(NULLIF(OLD.logical_id,''),OLD.record_id)<>COALESCE(NULLIF(NEW.logical_id,''),NEW.record_id);
END;
CREATE TABLE IF NOT EXISTS so_projection_runs (
 projection_id TEXT PRIMARY KEY, revision TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('BUILDING','READY','STALE')),
 source_count INTEGER NOT NULL, source_index INTEGER NOT NULL DEFAULT 0,
 cursor TEXT NOT NULL DEFAULT '', scanned INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS so_projection_rows (
 projection_id TEXT NOT NULL, logical_id TEXT NOT NULL, record_id TEXT NOT NULL,
 version INTEGER NOT NULL, created_at TEXT NOT NULL, created_ms REAL NOT NULL,
 record_type TEXT NOT NULL, outlet_code TEXT NOT NULL, location_code TEXT NOT NULL,
 item_code TEXT NOT NULL, event_date TEXT NOT NULL, direction TEXT NOT NULL,
 quantity REAL NOT NULL, movement_type TEXT NOT NULL,
 source_hash TEXT NOT NULL, source_row INTEGER NOT NULL,
 opname_qty REAL, opname_date TEXT NOT NULL,
 PRIMARY KEY(projection_id,logical_id)
);
CREATE INDEX IF NOT EXISTS so_projection_scope ON so_projection_rows(projection_id,outlet_code,location_code,item_code);
CREATE INDEX IF NOT EXISTS so_projection_audit ON so_projection_rows(projection_id,source_hash,source_row);
CREATE TABLE IF NOT EXISTS so_projection_watermarks (
 projection_id TEXT NOT NULL, source_key TEXT NOT NULL,
 sequence_no INTEGER NOT NULL,
 PRIMARY KEY(projection_id,source_key)
);
CREATE TABLE IF NOT EXISTS so_commit_batches (
 batch_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, outlet_code TEXT NOT NULL,
 digest TEXT NOT NULL, row_count INTEGER NOT NULL, committed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS so_commit_guard (
 id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1)
);
