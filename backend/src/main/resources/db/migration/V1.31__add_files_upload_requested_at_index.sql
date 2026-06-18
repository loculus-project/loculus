CREATE INDEX IF NOT EXISTS files_upload_requested_at_idx ON files (upload_requested_at);

ALTER TABLE files ADD COLUMN marked_for_deletion_at TIMESTAMP;
