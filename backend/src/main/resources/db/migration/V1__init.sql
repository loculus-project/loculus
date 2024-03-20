create sequence accession_sequence start with 1;

create table groups_table (
    group_name varchar(255) primary key,
    institution varchar(255) not null,
    address_line_1 varchar(255) not null,
    address_line_2 varchar(255),
    address_postal_code varchar(255) not null,
    address_city varchar(255) not null,
    address_state varchar(255),
    address_country varchar(255) not null,
    contact_email varchar(255) not null
);

create table sequence_entries (
    accession text not null,
    version bigint not null,
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

create table data_use_terms_table (
    accession text not null,
    change_date timestamp not null,
    data_use_terms_type text not null,
    restricted_until timestamp,
    user_name text not null
);

create index on data_use_terms_table (accession);

create table datasets (
    dataset_id uuid not null,
    dataset_version int8 not null,
    name text not null,
    description text,
    dataset_doi text,
    created_at timestamp not null,
    created_by text not null,

    primary key (dataset_id, dataset_version)
);

create table dataset_records (
    dataset_record_id bigserial,
    accession text not null,
    type text not null,

    primary key (dataset_record_id)
);

create table dataset_to_records (
    dataset_record_id bigserial not null,
    dataset_id uuid not null,
    dataset_version int8 not null,

    primary key (dataset_record_id, dataset_id, dataset_version),
    constraint foreign_key_dataset_record_id
        foreign key(dataset_record_id)
            references dataset_records(dataset_record_id)
            on delete cascade,
    constraint foreign_key_dataset_id
        foreign key(dataset_id, dataset_version)
            references datasets(dataset_id, dataset_version)
            on delete cascade
);
