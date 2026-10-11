-- Apply to every history D1 shard before deploying receipt resolve_scope reads.
CREATE INDEX IF NOT EXISTS ix_hist_movement_logical_lookup
  ON stock_movements_history(logical_id);
