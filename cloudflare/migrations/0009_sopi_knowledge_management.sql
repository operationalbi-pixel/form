ALTER TABLE sopi_documents ADD COLUMN admin_content TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sopi_documents_source_updated
  ON sopi_documents(source_type, updated_at DESC);
