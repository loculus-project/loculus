ALTER TABLE submission_table ADD submit_raw_reads boolean DEFAULT false;

CREATE TABLE raw_reads_table (
    accession text not null,
    version bigint not null,
    errors jsonb,
    warnings jsonb,
    status text not null,
    started_at timestamp not null,
    finished_at timestamp,
    result jsonb,
    ena_run_first_publicly_visible timestamp with time zone,
    ncbi_run_first_publicly_visible timestamp with time zone,
    ena_experiment_first_publicly_visible timestamp with time zone,
    ncbi_experiment_first_publicly_visible timestamp with time zone,
    primary key (accession, version)
);