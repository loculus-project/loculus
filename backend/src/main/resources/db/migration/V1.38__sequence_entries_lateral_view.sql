-- sequence_entries_view, but with the external metadata aggregated per row (LEFT JOIN LATERAL) instead of in a
-- GROUP BY subquery over the whole external_metadata table. Postgres cannot push an `accession IN (...)` filter into
-- that subquery, so every query of sequence_entries_view for two or more accessions aggregates all of
-- external_metadata (~0.25 s per query at 1M rows). This view costs O(rows returned) for such queries. It is used for
-- accession-filtered reads of the released data (the query engine projector); full scans stay on
-- sequence_entries_view, whose plan is better for them.
-- Must return exactly the rows of sequence_entries_view: keep the two definitions in sync
-- (SequenceEntriesLateralViewTest compares them).
CREATE VIEW sequence_entries_lateral_view AS
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
    se.submitted_data,
    sepd.started_processing_at,
    sepd.finished_processing_at,
    sepd.processed_data,
    CASE
        WHEN se.is_revocation THEN
            jsonb_build_object(
                'metadata', COALESCE(se.submitted_data -> 'metadata', '{}'::jsonb),
                'unalignedNucleotideSequences', '{}'::jsonb,
                'alignedNucleotideSequences', '{}'::jsonb,
                'nucleotideInsertions', '{}'::jsonb,
                'alignedAminoAcidSequences', '{}'::jsonb,
                'aminoAcidInsertions', '{}'::jsonb,
                'files', 'null'::jsonb
            )
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
-- GROUP BY keeps "no external metadata" as no row (NULL), as in sequence_entries_view: jsonb_merge_agg over zero rows
-- returns {} instead
LEFT JOIN LATERAL (
    SELECT jsonb_merge_agg(em.external_metadata) AS external_metadata
    FROM external_metadata em
    WHERE em.accession = se.accession
        AND em.version = se.version
    GROUP BY em.accession, em.version
) aem ON true;
