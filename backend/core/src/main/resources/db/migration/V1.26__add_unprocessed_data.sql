-- Add unprocessed_data column to sequence_entries.
-- In future original_data will be immutable (the raw submission),
-- while unprocessed_data is the data that gets sent to preprocessing
-- and made available via endpoints. For existing rows, seed it from original_data.

ALTER TABLE sequence_entries ADD COLUMN unprocessed_data jsonb;

UPDATE sequence_entries SET unprocessed_data = original_data;

-- Recreate the view to expose unprocessed_data.
DROP VIEW IF EXISTS sequence_entries_view CASCADE;

CREATE VIEW sequence_entries_view AS
SELECT
    se.accession,
    se.version,
    se.organism,
    se.submission_id,
    se.submitter,
    se.approver,
    se.group_id,
    se.submitted_at,
    se.released_at,
    se.is_revocation,
    se.unprocessed_data,
    se.version_comment,
    sepd.started_processing_at,
    sepd.finished_processing_at,
    sepd.processed_data,
    -- Build joint_metadata inline using subquery join
    CASE
        WHEN aem.external_metadata IS NULL THEN sepd.processed_data
        ELSE sepd.processed_data ||
            jsonb_build_object('metadata', (sepd.processed_data -> 'metadata') || aem.external_metadata)
    END AS joint_metadata,
    CASE
        WHEN se.is_revocation THEN cpp.version
        ELSE sepd.pipeline_version
    END AS pipeline_version,
    sepd.errors,
    sepd.warnings,
    CASE
        WHEN se.released_at IS NOT NULL THEN 'APPROVED_FOR_RELEASE'
        WHEN se.is_revocation THEN 'PROCESSED'
        WHEN sepd.processing_status = 'IN_PROCESSING' THEN 'IN_PROCESSING'
        WHEN sepd.processing_status = 'PROCESSED' THEN 'PROCESSED'
        ELSE 'RECEIVED'
    END AS status,
    CASE
        WHEN sepd.processing_status = 'IN_PROCESSING' THEN NULL
        WHEN sepd.errors IS NOT NULL AND jsonb_array_length(sepd.errors) > 0 THEN 'HAS_ERRORS'
        WHEN sepd.warnings IS NOT NULL AND jsonb_array_length(sepd.warnings) > 0 THEN 'HAS_WARNINGS'
        ELSE 'NO_ISSUES'
    END AS processing_result
FROM sequence_entries se
LEFT JOIN current_processing_pipeline cpp
    ON se.organism = cpp.organism
LEFT JOIN sequence_entries_preprocessed_data sepd
    ON se.accession = sepd.accession
    AND se.version = sepd.version
    AND sepd.pipeline_version = cpp.version
LEFT JOIN (
    SELECT
        em.accession,
        em.version,
        jsonb_merge_agg(em.external_metadata) AS external_metadata
    FROM external_metadata em
    GROUP BY em.accession, em.version
) aem
    ON aem.accession = se.accession
    AND aem.version = se.version;
