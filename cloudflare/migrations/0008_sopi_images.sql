CREATE TABLE IF NOT EXISTS sopi_images (
  image_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  image_kind TEXT NOT NULL CHECK (image_kind IN ('FINAL', 'STEP')),
  step_index INTEGER NOT NULL DEFAULT -1,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL UNIQUE,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (document_id, image_kind, step_index),
  FOREIGN KEY (document_id) REFERENCES sopi_documents(document_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sopi_images_document
  ON sopi_images(document_id, image_kind, step_index);
