ALTER TABLE sopi_documents ADD COLUMN content_text TEXT NOT NULL DEFAULT '';
ALTER TABLE sopi_documents ADD COLUMN attachment_id TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS sopi_unanswered (
  question_id TEXT PRIMARY KEY,
  normalized_question TEXT NOT NULL UNIQUE,
  question TEXT NOT NULL,
  ask_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ANSWERED')),
  answer TEXT NOT NULL DEFAULT '',
  answered_by TEXT NOT NULL DEFAULT '',
  first_asked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_asked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  answered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sopi_unanswered_status
  ON sopi_unanswered(status, last_asked_at DESC);

CREATE TABLE IF NOT EXISTS sopi_attachments (
  attachment_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL UNIQUE,
  uploaded_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES sopi_documents(document_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sopi_attachments_document
  ON sopi_attachments(document_id);
