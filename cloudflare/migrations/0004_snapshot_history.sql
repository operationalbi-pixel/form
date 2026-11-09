CREATE TABLE IF NOT EXISTS stock_snapshot_revisions(outlet_code TEXT NOT NULL,location_code TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(outlet_code,location_code));
CREATE TRIGGER IF NOT EXISTS snapshot_stock_movements_history_INSERT AFTER INSERT ON stock_movements_history BEGIN
INSERT INTO stock_snapshot_revisions VALUES(COALESCE(NEW.outlet_code,''),COALESCE(NEW.location_code,''),1) ON CONFLICT(outlet_code,location_code) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER IF NOT EXISTS snapshot_stock_movements_history_UPDATE AFTER UPDATE ON stock_movements_history BEGIN
INSERT INTO stock_snapshot_revisions VALUES(COALESCE(OLD.outlet_code,''),COALESCE(OLD.location_code,''),1) ON CONFLICT(outlet_code,location_code) DO UPDATE SET revision=revision+1;
INSERT INTO stock_snapshot_revisions VALUES(COALESCE(NEW.outlet_code,''),COALESCE(NEW.location_code,''),1) ON CONFLICT(outlet_code,location_code) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER IF NOT EXISTS snapshot_stock_movements_history_DELETE AFTER DELETE ON stock_movements_history BEGIN
INSERT INTO stock_snapshot_revisions VALUES(COALESCE(OLD.outlet_code,''),COALESCE(OLD.location_code,''),1) ON CONFLICT(outlet_code,location_code) DO UPDATE SET revision=revision+1;
END;
