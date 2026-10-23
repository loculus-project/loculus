-- Preprocessing work queue, part 1 of 3: columns, constraint and indexes.
-- Every entry gets an UNPROCESSED row up front. A claim is a single UPDATE ... FOR UPDATE SKIP LOCKED.
-- organism is copied onto the row so the claim is served by one partial index without heap fetches.
-- processing_attempt_id and lease_until turn a claim into a lease. A result needs the matching id.
-- The organism backfill runs here, outside the ACCESS EXCLUSIVE lock taken in part 2.

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

-- The partial indexes filter on literal status values. An unknown status would vanish from the queue.
-- A CHECK rather than an enum, so it can be added NOT VALID and changed later.
ALTER TABLE sequence_entries_preprocessed_data
    ADD CONSTRAINT sequence_entries_preprocessed_data_status_check
    CHECK (processing_status IN ('UNPROCESSED', 'IN_PROCESSING', 'PROCESSED'))
    NOT VALID;

ALTER TABLE sequence_entries_preprocessed_data
    VALIDATE CONSTRAINT sequence_entries_preprocessed_data_status_check;

-- Pipeline versions with a queue. New entries are queued for each of them, initialized_at is set once the backfill completes.
CREATE TABLE preprocessing_queue_versions (
    organism TEXT NOT NULL,
    pipeline_version BIGINT NOT NULL,
    initialized_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (organism, pipeline_version)
);

-- Claim: the queue head per organism and pipeline version.
CREATE INDEX sepd_unprocessed_claim_idx
ON sequence_entries_preprocessed_data (organism, pipeline_version, accession, version)
WHERE processing_status = 'UNPROCESSED';

-- Clean-up task: expired leases.
CREATE INDEX sepd_stale_lease_idx
ON sequence_entries_preprocessed_data (lease_until)
WHERE processing_status = 'IN_PROCESSING'
  AND lease_until IS NOT NULL;

-- Streaming a claimed batch back to its worker.
CREATE INDEX sepd_processing_attempt_idx
ON sequence_entries_preprocessed_data (processing_attempt_id)
WHERE processing_attempt_id IS NOT NULL;
