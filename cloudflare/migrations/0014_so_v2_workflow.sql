-- Incremental planning and durable commit progress for the independent SO workflow.
-- Apply AFTER 0007_so_upload_v2.sql and 0013_so_v2_operations.sql.
ALTER TABLE so_upload_jobs ADD COLUMN planned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE so_upload_jobs ADD COLUMN committed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE so_upload_jobs ADD COLUMN planning_cursor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE so_upload_jobs ADD COLUMN commit_cursor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE so_upload_jobs ADD COLUMN master_cursor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE so_upload_jobs ADD COLUMN projection_id TEXT;
ALTER TABLE so_upload_jobs ADD COLUMN plan_revision TEXT;
CREATE TABLE IF NOT EXISTS so_upload_plans (
 job_id TEXT NOT NULL REFERENCES so_upload_jobs(job_id),
 source_row INTEGER NOT NULL,
 outlet_code TEXT NOT NULL,
 item_code TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 PRIMARY KEY(job_id,source_row),
 UNIQUE(job_id,outlet_code,item_code)
);
CREATE INDEX IF NOT EXISTS so_upload_plan_scope ON so_upload_plans(job_id,outlet_code,source_row);
CREATE TABLE IF NOT EXISTS so_upload_scope_revisions (
 job_id TEXT NOT NULL REFERENCES so_upload_jobs(job_id),
 outlet_code TEXT NOT NULL,
 revision INTEGER NOT NULL,
 PRIMARY KEY(job_id,outlet_code)
);
CREATE INDEX IF NOT EXISTS so_commit_batches_scope ON so_commit_batches(job_id,outlet_code);
