CREATE TABLE IF NOT EXISTS application_records (table_name TEXT NOT NULL, record_id TEXT NOT NULL, outlet_code TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(table_name,record_id));
CREATE INDEX IF NOT EXISTS application_records_outlet ON application_records(table_name,outlet_code,record_id);
