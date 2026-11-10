-- Apply to EVERY history D1 shard before projecting history.
-- The journal is append-only and feeds changed logical IDs into the shared projection.
CREATE TABLE IF NOT EXISTS so_ledger_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  logical_id TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS so_ledger_changes_id ON so_ledger_changes(logical_id,seq);
CREATE TRIGGER IF NOT EXISTS so_feed_stock_movements_history_insert AFTER INSERT ON stock_movements_history BEGIN
 INSERT INTO so_ledger_changes(logical_id) VALUES(COALESCE(NULLIF(NEW.logical_id,''),NEW.record_id));
END;
CREATE TRIGGER IF NOT EXISTS so_feed_stock_movements_history_delete AFTER DELETE ON stock_movements_history BEGIN
 INSERT INTO so_ledger_changes(logical_id) VALUES(COALESCE(NULLIF(OLD.logical_id,''),OLD.record_id));
END;
CREATE TRIGGER IF NOT EXISTS so_feed_stock_movements_history_update AFTER UPDATE ON stock_movements_history BEGIN
 INSERT INTO so_ledger_changes(logical_id) VALUES(COALESCE(NULLIF(OLD.logical_id,''),OLD.record_id));
 INSERT INTO so_ledger_changes(logical_id)
 SELECT COALESCE(NULLIF(NEW.logical_id,''),NEW.record_id)
 WHERE COALESCE(NULLIF(OLD.logical_id,''),OLD.record_id)<>COALESCE(NULLIF(NEW.logical_id,''),NEW.record_id);
END;
