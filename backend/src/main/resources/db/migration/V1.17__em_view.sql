-- Migration to optimize external_metadata_view by eliminating nested correlated subqueries
-- This fixes the remaining SubPlan that executes thousands of times per query
--
-- BEFORE: Nested correlated subqueries look up organism, then pipeline version for each row
-- AFTER: Direct joins eliminate the correlated lookups

-- Drop the existing view
DROP VIEW IF EXISTS external_metadata_view CASCADE;


-- Create optimized view with proper join order
CREATE VIEW external_metadata_view AS
SELECT
    sepd.accession,
    sepd.version,
    aem.updated_metadata_at,
    CASE
        WHEN aem.external_metadata IS NULL
        THEN jsonb_build_object('metadata', sepd.processed_data -> 'metadata')
        ELSE jsonb_build_object('metadata', (sepd.processed_data -> 'metadata') || aem.external_metadata)
    END AS joint_metadata
FROM sequence_entries_preprocessed_data sepd
-- Join with sequence_entries to get organism (eliminates first nested subquery)
INNER JOIN sequence_entries se
    ON se.accession = sepd.accession
    AND se.version = sepd.version
-- Join with current_processing_pipeline where BOTH organism matches AND version matches
-- This eliminates the second nested subquery and the WHERE filter
INNER JOIN current_processing_pipeline ccp
    ON ccp.organism = se.organism
    AND ccp.version = sepd.pipeline_version
-- Left join with external metadata as before
LEFT JOIN all_external_metadata aem
    ON aem.accession = sepd.accession
    AND aem.version = sepd.version;

-- Add helpful comment
COMMENT ON VIEW external_metadata_view IS
'Optimized view that joins sequence_entries and current_processing_pipeline early to avoid nested correlated subqueries.
This eliminates the double-nested lookup: organism lookup → pipeline version lookup → filter.';

-- Note: Since we dropped with CASCADE, sequence_entries_view was also dropped
-- We need to recreate it (this should match your previous optimization)
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
    se.original_data,
    se.version_comment,
    sepd.started_processing_at,
    sepd.finished_processing_at,
    sepd.processed_data,
    (sepd.processed_data || em.joint_metadata) AS joint_metadata,
    -- Pipeline version calculation
    CASE
        WHEN se.is_revocation THEN ccp.version
        ELSE sepd.pipeline_version
    END AS pipeline_version,
    sepd.errors,
    sepd.warnings,
    -- Status calculation
    CASE
        WHEN (se.released_at IS NOT NULL) THEN 'APPROVED_FOR_RELEASE'::text
        WHEN se.is_revocation THEN 'PROCESSED'::text
        WHEN (sepd.processing_status = 'IN_PROCESSING'::text) THEN 'IN_PROCESSING'::text
        WHEN (sepd.processing_status = 'PROCESSED'::text) THEN 'PROCESSED'::text
        ELSE 'RECEIVED'::text
    END AS status,
    -- Processing result calculation
    CASE
        WHEN (sepd.processing_status = 'IN_PROCESSING'::text) THEN NULL::text
        WHEN ((sepd.errors IS NOT NULL) AND (jsonb_array_length(sepd.errors) > 0)) THEN 'HAS_ERRORS'::text
        WHEN ((sepd.warnings IS NOT NULL) AND (jsonb_array_length(sepd.warnings) > 0)) THEN 'HAS_WARNINGS'::text
        ELSE 'NO_ISSUES'::text
    END AS processing_result
FROM sequence_entries se
-- Join with current_processing_pipeline FIRST
LEFT JOIN current_processing_pipeline ccp
    ON ccp.organism = se.organism
-- Join with preprocessed data using the pipeline version from earlier join
LEFT JOIN sequence_entries_preprocessed_data sepd
    ON se.accession = sepd.accession
    AND se.version = sepd.version
    AND sepd.pipeline_version = ccp.version
-- Join with the now-optimized external metadata view
LEFT JOIN external_metadata_view em
    ON se.accession = em.accession
    AND se.version = em.version;

-- Add comment
COMMENT ON VIEW sequence_entries_view IS
'Optimized view that joins current_processing_pipeline early and uses the optimized external_metadata_view.
Both optimizations eliminate correlated subqueries for better performance.';
