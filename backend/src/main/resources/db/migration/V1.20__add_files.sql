-- TODO Add useful indices


create table file_uploads (
    id uuid primary key,
    uploaded_by text not null,
    upload_initiated_at timestamp not null,
    owner_group_id integer not null references groups_table (group_id),
);


create table files (
    id uuid primary key,
    uploaded_by text not null,
    upload_initiated_at timestamp not null,
    upload_confirmed_at timestamp not null,
    owner_group_id integer not null references groups_table (group_id),
    size_byes bigint not null,
    public boolean not null
);


alter table sequence_entries
    add original_file uuid references files (id);


alter table metadata_upload_aux_table
    add original_file uuid references files (id);


create table sequence_entries_preprocessed_data_files (
    accession text not null,
    version bigint not null,
    pipeline_version bigint not null,
    file_id uuid not null,
    file_name text not null,
    foreign key (accession, version, pipeline_version) references sequence_entries_preprocessed_data (accession, version, pipeline_version),
    foreign key (file_id) references files (id),
    primary key (accession, version, pipeline_version, file_id, file_name)
);


-- TODO Update sequence_entries_view to include the file information
--  (file_id, file_name, and public) -> combined into a JSON?
