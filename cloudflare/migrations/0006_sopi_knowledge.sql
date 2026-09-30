CREATE TABLE IF NOT EXISTS sopi_documents (
  document_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  category_detail TEXT NOT NULL DEFAULT '',
  effective_date TEXT NOT NULL DEFAULT '',
  revision TEXT NOT NULL DEFAULT '',
  is_legacy INTEGER NOT NULL DEFAULT 0 CHECK (is_legacy IN (0, 1)),
  yield_text TEXT NOT NULL DEFAULT '',
  shelf_life TEXT NOT NULL DEFAULT '',
  ingredients_json TEXT NOT NULL DEFAULT '[]',
  steps_json TEXT NOT NULL DEFAULT '[]',
  search_text TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'JSON',
  status TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sopi_documents_title
  ON sopi_documents(title COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_sopi_documents_category
  ON sopi_documents(category, category_detail);

CREATE INDEX IF NOT EXISTS idx_sopi_documents_effective_date
  ON sopi_documents(effective_date DESC);
