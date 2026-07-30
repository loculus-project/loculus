ALTER TABLE sequence_entries_preprocessed_data
    ADD COLUMN organism TEXT,
    ADD COLUMN processing_attempt_id UUID,
    ADD COLUMN lease_until TIMESTAMP WITHOUT TIME ZONE,
    ALTER COLUMN started_processing_at DROP NOT NULL;

UPDATE sequence_entries_preprocessed_data sepd
SET organism = se.organism
FROM sequence_entries se
WHERE se.accession = sepd.accession
  AND se.version = sepd.version;

ALTER TABLE sequence_entries_preprocessed_data
    ADD CONSTRAINT sequence_entries_preprocessed_data_status_check
    CHECK (processing_status IN ('UNPROCESSED', 'IN_PROCESSING', 'PROCESSED'))
    NOT VALID;

ALTER TABLE sequence_entries_preprocessed_data
    VALIDATE CONSTRAINT sequence_entries_preprocessed_data_status_check;

CREATE TABLE preprocessing_queue_versions (
    organism TEXT NOT NULL,
    pipeline_version BIGINT NOT NULL,
    initialized_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
        DEFAULT timezone('UTC', CURRENT_TIMESTAMP),
    PRIMARY KEY (organism, pipeline_version)
);

CREATE INDEX sepd_unprocessed_claim_idx
ON sequence_entries_preprocessed_data (organism, pipeline_version, accession, version)
WHERE processing_status = 'UNPROCESSED';

CREATE INDEX sepd_stale_lease_idx
ON sequence_entries_preprocessed_data (lease_until)
WHERE processing_status = 'IN_PROCESSING'
  AND lease_until IS NOT NULL;

CREATE INDEX sepd_processing_attempt_idx
ON sequence_entries_preprocessed_data (processing_attempt_id)
WHERE processing_attempt_id IS NOT NULL;
