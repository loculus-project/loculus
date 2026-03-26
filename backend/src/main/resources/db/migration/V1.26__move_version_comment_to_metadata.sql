-- Moves revocation versionComment from the dedicated version_comment column
-- into the original_data JSONB metadata, and updates the view to automatically
-- construct joint_metadata for revocations from original_data.
-- This unifies how versionComment is stored for both revisions and revocations.

-- Step 1: For existing revocations with non-null version_comment and no original_data,
-- create original_data with versionComment in metadata
UPDATE sequence_entries
SET original_data = jsonb_build_object(
    'metadata', jsonb_build_object('versionComment', version_comment),
    'unalignedNucleotideSequences', '{}'::jsonb
)
WHERE is_revocation = true AND version_comment IS NOT NULL AND original_data IS NULL;

-- For revocations that already have original_data (unlikely but safe),
-- merge versionComment into existing metadata
UPDATE sequence_entries
SET original_data = jsonb_set(
    original_data,
    '{metadata}',
    COALESCE(original_data -> 'metadata', '{}'::jsonb) || jsonb_build_object('versionComment', version_comment)
)
WHERE is_revocation = true AND version_comment IS NOT NULL AND original_data IS NOT NULL;

-- Step 2: Drop the view (must be done before dropping the column)
DROP VIEW IF EXISTS sequence_entries_view;

-- Step 3: Drop the version_comment column
ALTER TABLE sequence_entries DROP COLUMN version_comment;

-- Step 4: Recreate the view without version_comment.
-- For revocations, joint_metadata is constructed from original_data
-- so versionComment survives pipeline version changes.
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
    sepd.started_processing_at,
    sepd.finished_processing_at,
    sepd.processed_data,
    CASE
        WHEN se.is_revocation AND se.original_data IS NOT NULL THEN
            jsonb_build_object(
                'metadata', COALESCE(se.original_data -> 'metadata', '{}'::jsonb),
                'unalignedNucleotideSequences', '{}'::jsonb,
                'alignedNucleotideSequences', '{}'::jsonb,
                'nucleotideInsertions', '{}'::jsonb,
                'alignedAminoAcidSequences', '{}'::jsonb,
                'aminoAcidInsertions', '{}'::jsonb,
                'files', 'null'::jsonb
            )
        WHEN se.is_revocation THEN NULL
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
