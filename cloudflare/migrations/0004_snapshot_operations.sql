CREATE TABLE IF NOT EXISTS stock_snapshot_revisions(outlet_code TEXT NOT NULL,location_code TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(outlet_code,location_code));
CREATE TRIGGER IF NOT EXISTS snapshot_stock_movements_INSERT AFTER INSERT ON stock_movements BEGIN
INSERT INTO stock_snapshot_revisions VALUES(COALESCE(NEW.outlet_code,''),COALESCE(NEW.location_code,''),1) ON CONFLICT(outlet_code,location_code) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER IF NOT EXISTS snapshot_stock_movements_UPDATE AFTER UPDATE ON stock_movements BEGIN
INSERT INTO stock_snapshot_revisions VALUES(COALESCE(OLD.outlet_code,''),COALESCE(OLD.location_code,''),1) ON CONFLICT(outlet_code,location_code) DO UPDATE SET revision=revision+1;
INSERT INTO stock_snapshot_revisions VALUES(COALESCE(NEW.outlet_code,''),COALESCE(NEW.location_code,''),1) ON CONFLICT(outlet_code,location_code) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER IF NOT EXISTS snapshot_stock_movements_DELETE AFTER DELETE ON stock_movements BEGIN
INSERT INTO stock_snapshot_revisions VALUES(COALESCE(OLD.outlet_code,''),COALESCE(OLD.location_code,''),1) ON CONFLICT(outlet_code,location_code) DO UPDATE SET revision=revision+1;
END;
CREATE TABLE IF NOT EXISTS stock_balance_snapshots(outlet_code TEXT NOT NULL,location_code TEXT NOT NULL,event_date TEXT NOT NULL,item_code TEXT NOT NULL,quantity REAL NOT NULL,source_revision TEXT NOT NULL,PRIMARY KEY(outlet_code,location_code,event_date,item_code));