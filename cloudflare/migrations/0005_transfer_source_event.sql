-- Preserve the source transfer line for corrections and receipt reconciliation.
ALTER TABLE stock_transfer_events ADD COLUMN source_event_id TEXT;

CREATE INDEX IF NOT EXISTS ix_transfer_events_source_event
  ON stock_transfer_events(source_event_id);

INSERT OR IGNORE INTO schema_migrations(version, description)
VALUES ('0005-transfer-source-event', 'Link corrections and receipt rows to their originating transfer line');
