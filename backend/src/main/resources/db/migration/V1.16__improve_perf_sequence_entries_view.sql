-- Migration to optimize sequence_entries_view by eliminating correlated subqueries
-- This fixes the performance issue where current_processing_pipeline lookup was happening
-- 467,010 times per query instead of once per organism

-- Drop the existing view
DROP VIEW IF EXISTS sequence_entries_view;

-- Create optimized view with proper join order
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
    -- Optimized pipeline_version calculation
    CASE
        WHEN se.is_revocation THEN ccp.version
        ELSE sepd.pipeline_version
    END AS pipeline_version,
    sepd.errors,
    sepd.warnings,
    -- Status calculation (unchanged)
    CASE
        WHEN (se.released_at IS NOT NULL) THEN 'APPROVED_FOR_RELEASE'::text
        WHEN se.is_revocation THEN 'PROCESSED'::text
        WHEN (sepd.processing_status = 'IN_PROCESSING'::text) THEN 'IN_PROCESSING'::text
        WHEN (sepd.processing_status = 'PROCESSED'::text) THEN 'PROCESSED'::text
        ELSE 'RECEIVED'::text
    END AS status,
    -- Processing result calculation (unchanged)
    CASE
        WHEN (sepd.processing_status = 'IN_PROCESSING'::text) THEN NULL::text
        WHEN ((sepd.errors IS NOT NULL) AND (jsonb_array_length(sepd.errors) > 0)) THEN 'HAS_ERRORS'::text
        WHEN ((sepd.warnings IS NOT NULL) AND (jsonb_array_length(sepd.warnings) > 0)) THEN 'HAS_WARNINGS'::text
        ELSE 'NO_ISSUES'::text
    END AS processing_result
FROM sequence_entries se
-- Join with current_processing_pipeline FIRST - this is the key optimization
-- This join happens once per organism instead of once per row
LEFT JOIN current_processing_pipeline ccp 
    ON ccp.organism = se.organism
-- Now join with preprocessed data using the pipeline version from the earlier join
LEFT JOIN sequence_entries_preprocessed_data sepd 
    ON se.accession = sepd.accession 
    AND se.version = sepd.version 
    AND sepd.pipeline_version = ccp.version
-- Finally join with external metadata
LEFT JOIN external_metadata_view em 
    ON se.accession = em.accession 
    AND se.version = em.version;

-- Add helpful comment
COMMENT ON VIEW sequence_entries_view IS 
'Optimized view that joins current_processing_pipeline early to avoid correlated subqueries. 
This reduces the number of pipeline lookups from O(n) to O(organisms).';

-- Create indexes to further optimize common query patterns
-- Index for status queries (most common according to the logs)
CREATE INDEX IF NOT EXISTS idx_se_organism_released_at 
    ON sequence_entries(organism, released_at) 
    WHERE released_at IS NOT NULL;

-- Index for non-released entries
CREATE INDEX IF NOT EXISTS idx_se_organism_not_released 
    ON sequence_entries(organism, submitter) 
    WHERE released_at IS NULL AND NOT is_revocation;

-- Index for the preprocessed data join
CREATE INDEX IF NOT EXISTS idx_sepd_lookup 
    ON sequence_entries_preprocessed_data(accession, version, pipeline_version);

-- Composite index for common WHERE clause patterns from the logs
CREATE INDEX IF NOT EXISTS idx_se_organism_submitter 
    ON sequence_entries(organism, submitter);

-- Index for group_id queries (appears in both slow queries)
CREATE INDEX IF NOT EXISTS idx_se_group_organism 
    ON sequence_entries(group_id, organism);

-- Add statistics comment
COMMENT ON INDEX idx_se_organism_released_at IS 
'Optimizes COUNT(*) queries filtering by status=APPROVED_FOR_RELEASE and organism';

COMMENT ON INDEX idx_sepd_lookup IS 
'Optimizes the JOIN between sequence_entries and sequence_entries_preprocessed_data';