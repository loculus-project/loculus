create sequence accession_sequence start with 1;

create table groups_table (
    group_name varchar(255) primary key
);

create table sequence_entries (
    accession text not null,
    version bigint not null default 1,
    organism text not null,
    submission_id text not null,
    submitter text not null,
    group_name text not null,
    submitted_at timestamp not null,
    started_processing_at timestamp,
    finished_processing_at timestamp,
    released_at timestamp,
    status text not null,
    is_revocation boolean not null default false,
    original_data jsonb,
    processed_data jsonb,
    errors jsonb,
    warnings jsonb,
    primary key (accession, version),
    foreign key (group_name) references groups_table(group_name)
);

create index on sequence_entries (submitter);
create index on sequence_entries (status);

create table metadata_upload_aux_table (
    accession text,
    version bigint,
    upload_id text not null,
    organism text not null,
    submission_id text not null,
    submitter text not null,
    group_name text,
    uploaded_at timestamp not null,
    metadata jsonb not null,
    primary key (upload_id,submission_id)
);

create table sequence_upload_aux_table (
    upload_id text not null,
    submission_id text not null,
    segment_name text not null,
    compressed_sequence_data text not null,
    primary key (upload_id,submission_id,segment_name)
);

create table user_groups_table (
     user_name text not null,
     group_name text not null,
     primary key (user_name, group_name),
     foreign key (group_name) references groups_table(group_name)
);

create table licenses_table (
    accession text not null,
    change_date timestamp not null,
    license_type text not null,
    restricted_until timestamp,
    submitter text not null,
    primary key (accession, change_date)
);
