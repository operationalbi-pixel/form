-- Apply to each inventory history database.
CREATE INDEX IF NOT EXISTS ix_hist_source_scope
ON stock_movements_history(source_hash, outlet_code, location_code, event_date DESC, created_at DESC, record_id DESC);
