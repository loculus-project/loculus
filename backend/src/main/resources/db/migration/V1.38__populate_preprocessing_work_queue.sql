-- Preprocessing work queue, part 3 of 3: populate it.
-- Registers the current version of every organism and any newer version that already has results,
-- then queues every entry that has no row for them. Existing rows are kept.

INSERT INTO preprocessing_queue_versions (organism, pipeline_version, initialized_at)
SELECT organism, version, timezone('UTC', CURRENT_TIMESTAMP)
FROM current_processing_pipeline
UNION
SELECT DISTINCT sepd.organism, sepd.pipeline_version, timezone('UTC', CURRENT_TIMESTAMP)
FROM sequence_entries_preprocessed_data sepd
JOIN current_processing_pipeline cpp
  ON cpp.organism = sepd.organism
WHERE sepd.pipeline_version > cpp.version
ON CONFLICT (organism, pipeline_version) DO NOTHING;

INSERT INTO sequence_entries_preprocessed_data (
    accession,
    version,
    pipeline_version,
    organism,
    processing_status
)
SELECT
    se.accession,
    se.version,
    qv.pipeline_version,
    se.organism,
    'UNPROCESSED'
FROM sequence_entries se
JOIN preprocessing_queue_versions qv
  ON qv.organism = se.organism
WHERE NOT se.is_revocation
ON CONFLICT (accession, version, pipeline_version) DO NOTHING;

ALTER TABLE sequence_entries_preprocessed_data
    VALIDATE CONSTRAINT sequence_entries_preprocessed_data_ownership_check;
