create table files (
    id uuid primary key,
    upload_requested_at timestamp not null,
    uploader text not null,
    group_id integer not null references groups_table(group_id),
    released_at timestamp
);

alter table metadata_upload_aux_table
add column files jsonb;
