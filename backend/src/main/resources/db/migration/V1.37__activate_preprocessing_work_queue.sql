-- Preprocessing work queue, part 2 of 3: switch claiming over.
-- The locks wait for open claims of a backend without the queue. Those rows must not change underneath it.
-- Rows still IN_PROCESSING afterwards have no owner and return to the queue. Their late results get a 422.

LOCK TABLE sequence_entries IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE sequence_entries_preprocessed_data IN ACCESS EXCLUSIVE MODE;

UPDATE sequence_entries_preprocessed_data sepd
SET organism = se.organism
FROM sequence_entries se
WHERE se.accession = sepd.accession
  AND se.version = sepd.version
  AND sepd.organism IS NULL;

ALTER TABLE sequence_entries_preprocessed_data
    ALTER COLUMN organism SET NOT NULL;

UPDATE sequence_entries_preprocessed_data
SET processing_status = 'UNPROCESSED',
    processing_attempt_id = NULL,
    lease_until = NULL,
    started_processing_at = NULL,
    finished_processing_at = NULL,
    processed_data = NULL,
    errors = NULL,
    warnings = NULL
WHERE processing_status = 'IN_PROCESSING';

-- A row in processing has an owner and an expiry, any other row has neither. Validated in part 3.
-- Added here so
  claims from old backends without the queue are rejected once the locks are released.
ALTER TABLE sequence_entries_preprocessed_data
    ADD CONSTRAINT sequence_entries_preprocessed_data_ownership_check
    CHECK (
        (
            processing_status = 'IN_PROCESSING'
            AND processing_attempt_id IS NOT NULL
            AND lease_until IS NOT NULL
        )
        OR
        (
            processing_status IN ('UNPROCESSED', 'PROCESSED')
            AND processing_attempt_id IS NULL
            AND lease_until IS NULL
        )
    )
    NOT VALID;
