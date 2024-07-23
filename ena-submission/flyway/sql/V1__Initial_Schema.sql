CREATE TABLE submission_table (
    accession text not null,
    version bigint not null,
    organism text not null,
    groupId bigint not null,
    errors jsonb,
    warnings jsonb,
    status_all text not null,
    started_at timestamp not null,
    finished_at timestamp,
    external_metadata jsonb,
    primary key (accession, version)
);

CREATE TABLE project_table (
    groupId bigint not null,
    organism text not null,
    errors jsonb,
    warnings jsonb,
    status text not null,
    started_at timestamp not null,
    finished_at timestamp,
    project_metadata jsonb,
    primary key (groupId, organism)
);

CREATE TABLE sample_table (
    accession text not null,
    version bigint not null,
    errors jsonb,
    warnings jsonb,
    status text not null,
    started_at timestamp not null,
    finished_at timestamp,
    sample_metadata jsonb,
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
    assembly_metadata jsonb,
    primary key (accession, version)
);