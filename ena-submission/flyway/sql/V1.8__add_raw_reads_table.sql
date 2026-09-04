ALTER TABLE submission_table ADD submit_raw_reads boolean DEFAULT false;
ALTER TABLE submission_table ALTER COLUMN submit_raw_reads SET NOT NULL;

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

-- Create raw-reads records for entries with an insdcRawReadsAccession in the metadata, and mark them as submitted
UPDATE submission_table
SET submit_raw_reads = true
WHERE metadata->>'insdcRawReadsAccession' IS NOT NULL AND metadata->>'insdcRawReadsAccession' <> '';

INSERT INTO raw_reads_table (
    accession,
    version,
    status,
    started_at,
    result
)
SELECT
    accession,
    version,
    'SUBMITTED',
    NOW(),
    jsonb_build_object(
        'err_accession',
        metadata->>'insdcRawReadsAccession'
    )
FROM submission_table
WHERE metadata->>'insdcRawReadsAccession' IS NOT NULL AND metadata->>'insdcRawReadsAccession' <> '';