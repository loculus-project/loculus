create sequence accession_sequence start with 1;

create table groups_table (
    group_id serial primary key,
    group_name varchar(255),
    institution varchar(255) not null,
    address_line_1 varchar(255) not null,
    address_line_2 varchar(255),
    address_postal_code varchar(255) not null,
    address_city varchar(255) not null,
    address_state varchar(255),
    address_country varchar(255) not null,
    contact_email varchar(255) not null
);

create table current_processing_pipeline (
    version bigint primary key,
    started_using_at timestamp not null
);

insert into current_processing_pipeline (version, started_using_at)
values (1, now());

create table sequence_entries (
    accession text not null,
    version bigint not null,
    organism text not null,
    submission_id text not null,
    submitter text not null,
    approver text,
    group_id integer not null,
    submitted_at timestamp not null,
    released_at timestamp,
    is_revocation boolean not null default false,
    original_data jsonb,
    primary key (accession, version),
    foreign key (group_id) references groups_table(group_id)
);

create index on sequence_entries (submitter);

create table sequence_entries_preprocessed_data (
    accession text not null,
    version bigint not null,
    pipeline_version bigint not null,
    processed_data jsonb,
    errors jsonb,
    warnings jsonb,
    processing_status text not null,
    started_processing_at timestamp not null,
    finished_processing_at timestamp,
    primary key (accession, version, pipeline_version)
);

create view sequence_entries_view as
select
    se.*,
    sepd.started_processing_at,
    sepd.finished_processing_at,
    sepd.processed_data,
    sepd.errors,
    sepd.warnings,
    case
        when se.released_at is not null then 'APPROVED_FOR_RELEASE'
        when se.is_revocation then 'AWAITING_APPROVAL'
        when sepd.processing_status = 'IN_PROCESSING' then 'IN_PROCESSING'
        when sepd.processing_status = 'HAS_ERRORS' then 'HAS_ERRORS'
        when sepd.processing_status = 'FINISHED' then 'AWAITING_APPROVAL'
        else 'RECEIVED'
    end as status
from
    sequence_entries se
    left join sequence_entries_preprocessed_data sepd on
        se.accession = sepd.accession
        and se.version = sepd.version
        and sepd.pipeline_version = (select version from current_processing_pipeline);

create table metadata_upload_aux_table (
    accession text,
    version bigint,
    upload_id text not null,
    organism text not null,
    submission_id text not null,
    submitter text not null,
    group_id integer,
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
    id serial primary key,
    user_name text not null,
    group_id integer not null,
    unique (user_name, group_id),
    foreign key (group_id) references groups_table(group_id)
);
create index on user_groups_table (user_name);

create table data_use_terms_table (
    accession text not null,
    change_date timestamp not null,
    data_use_terms_type text not null,
    restricted_until timestamp,
    user_name text not null
);

create index on data_use_terms_table (accession);

create table seqsets (
    seqset_id uuid not null,
    seqset_version int8 not null,
    name text not null,
    description text,
    seqset_doi text,
    created_at timestamp not null,
    created_by text not null,

    primary key (seqset_id, seqset_version)
);

create table seqset_to_records (
    seqset_id uuid not null,
    seqset_version int8 not null,
    sequence_accession text not null, -- At the moment, this may but doesn't need to contain the version.
    is_focal boolean not null,

    primary key (seqset_id, seqset_version, sequence_accession),
    constraint foreign_key_seqset_id
        foreign key(seqset_id, seqset_version)
            references seqsets(seqset_id, seqset_version)
            on delete cascade
);

create table audit_log (
    id bigserial primary key,
    username text,
    timestamp timestamp not null default now(),
    description text not null
);
