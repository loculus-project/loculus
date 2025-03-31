create table files (
    id uuid primary key,
    requested_at timestamp not null,
    uploader text not null,
    group_id integer not null references groups_table(group_id)
);
