CREATE TABLE submission_table (
    accession text not null,
    version bigint not null,
    organism text not null,
    group_id bigint not null,
    errors jsonb,
    warnings jsonb,
    status_all text not null,
    started_at timestamp not null,
    finished_at timestamp,
    metadata jsonb,
    aligned_nucleotide_sequences jsonb,
    external_metadata jsonb,
    primary key (accession, version)
);

CREATE TABLE project_table (
    group_id bigint not null,
    organism text not null,
    errors jsonb,
    warnings jsonb,
    status text not null,
    started_at timestamp not null,
    finished_at timestamp,
    result jsonb,
    primary key (group_id, organism)
);

CREATE TABLE sample_table (
    accession text not null,
    version bigint not null,
    errors jsonb,
    warnings jsonb,
    status text not null,
    started_at timestamp not null,
    finished_at timestamp,
    result jsonb,
    primary key (accession, version)
);

CREATE TABLE assembly_table (
    accession text not null,
    version bigint not null,
    errors jsonb,
    warnings jsonb,
    status text not null,
    started_at timestamp not null,
    finished_at timestamp,
    result jsonb,
    primary key (accession, version)
);