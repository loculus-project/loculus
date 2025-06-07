alter table files
add column multipart_initiated boolean default false not null,
add column multipart_completed boolean default false not null,
add column multipart_upload_id text;
