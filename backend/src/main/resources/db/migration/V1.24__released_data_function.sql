-- Optimized function for released data
-- Uses CTEs which materialize properly in functions, avoiding nested loop issues
-- ~80x faster than using sequence_entries_view (2.6s vs 210s)

CREATE OR REPLACE FUNCTION get_released_submissions(p_organism text)
RETURNS TABLE (
    accession text,
    version bigint,
    is_revocation boolean,
    version_comment text,
    joint_metadata jsonb,
    submitter text,
    group_id integer,
    submitted_at timestamp,
    released_at timestamp,
    submission_id text,
    pipeline_version bigint,
    data_use_terms_type text,
    restricted_until date
) AS $$
WITH
-- First identify the released entries for this organism
released_entries AS (
    SELECT se.accession, se.version
    FROM sequence_entries se
    WHERE se.released_at IS NOT NULL
      AND se.organism = p_organism
),
-- Pre-aggregate external metadata ONLY for the entries we need
aem AS (
    SELECT
        em.accession,
        em.version,
        jsonb_merge_agg(em.external_metadata) AS external_metadata
    FROM external_metadata em
    WHERE EXISTS (
        SELECT 1 FROM released_entries re
        WHERE re.accession = em.accession AND re.version = em.version
    )
    GROUP BY em.accession, em.version
),
-- Pre-compute newest data use terms ONLY for the entries we need
newest_dut AS (
    SELECT DISTINCT ON (dut.accession)
        dut.accession,
        dut.data_use_terms_type,
        dut.restricted_until
    FROM data_use_terms_table dut
    WHERE EXISTS (
        SELECT 1 FROM released_entries re
        WHERE re.accession = dut.accession
    )
    ORDER BY dut.accession, dut.change_date DESC
)
SELECT
    se.accession,
    se.version,
    se.is_revocation,
    se.version_comment,
    -- Build joint_metadata: processed_data merged with external metadata
    sepd.processed_data ||
    CASE
        WHEN aem.external_metadata IS NULL
        THEN jsonb_build_object('metadata', sepd.processed_data -> 'metadata')
        ELSE jsonb_build_object('metadata', (sepd.processed_data -> 'metadata') || aem.external_metadata)
    END AS joint_metadata,
    se.submitter,
    se.group_id,
    se.submitted_at,
    se.released_at,
    se.submission_id,
    COALESCE(sepd.pipeline_version, cpp.version) AS pipeline_version,
    dut.data_use_terms_type,
    dut.restricted_until
FROM sequence_entries se
JOIN current_processing_pipeline cpp
    ON cpp.organism = se.organism
LEFT JOIN sequence_entries_preprocessed_data sepd
    ON se.accession = sepd.accession
    AND se.version = sepd.version
    AND sepd.pipeline_version = cpp.version
LEFT JOIN aem
    ON aem.accession = se.accession
    AND aem.version = se.version
LEFT JOIN newest_dut dut
    ON dut.accession = se.accession
WHERE se.released_at IS NOT NULL
  AND se.organism = p_organism
ORDER BY se.accession, se.version;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_released_submissions(text) IS
'Optimized function for streaming released submissions.
Uses CTEs to pre-filter and aggregate external metadata and data use terms only for
entries matching the given organism. ~80x faster than sequence_entries_view approach.
Expected runtime: ~2-3s per organism vs ~200s with the view.';
