alter table files add column submitted_at timestamp;
update files set submitted_at = upload_requested_at;
