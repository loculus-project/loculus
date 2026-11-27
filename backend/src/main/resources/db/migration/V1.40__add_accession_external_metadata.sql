-- Adds accession-scoped external metadata, i.e. external metadata that applies to all versions of an accession.
-- The joint metadata is now built as an overlay of:
--   processed metadata <- accession-scoped external metadata <- accession-version-scoped external metadata
-- i.e. if a field exists in both, the accession-version-scoped value takes precedence.

-- Rename the existing (accession-version-scoped) table so that both tables state their scope explicitly.
ALTER TABLE external_metadata RENAME TO accession_version_external_metadata;
ALTER TABLE accession_version_external_metadata
    RENAME CONSTRAINT external_metadata_pkey TO accession_version_external_metadata_pkey;
ALTER FUNCTION update_external_metadata_tracker() RENAME TO update_accession_version_external_metadata_tracker;
-- The tracker triggers record TG_TABLE_NAME, so carry over existing tracker rows to the new name.
UPDATE table_update_tracker
SET table_name = 'accession_version_external_metadata'
WHERE table_name = 'external_metadata';

CREATE TABLE accession_external_metadata (
    accession text NOT NULL,
    external_metadata_updater text NOT NULL,
    external_metadata jsonb,
    updated_metadata_at timestamp NOT NULL,
    PRIMARY KEY (accession, external_metadata_updater)
);

CREATE OR REPLACE FUNCTION update_accession_external_metadata_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated)
    SELECT TG_TABLE_NAME, se.organism, NULL, timezone('UTC', CURRENT_TIMESTAMP)
    FROM changed_rows cr
    JOIN sequence_entries se
      ON se.accession = cr.accession
    GROUP BY se.organism
    ON CONFLICT (table_name, organism, pipeline_version)
    DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tracker_trigger_ins
AFTER INSERT ON accession_external_metadata
REFERENCING NEW TABLE AS changed_rows
FOR EACH STATEMENT EXECUTE FUNCTION update_accession_external_metadata_tracker();

CREATE TRIGGER update_tracker_trigger_upd
AFTER UPDATE ON accession_external_metadata
REFERENCING NEW TABLE AS changed_rows
FOR EACH STATEMENT EXECUTE FUNCTION update_accession_external_metadata_tracker();

CREATE TRIGGER update_tracker_trigger_del
AFTER DELETE ON accession_external_metadata
REFERENCING OLD TABLE AS changed_rows
FOR EACH STATEMENT EXECUTE FUNCTION update_accession_external_metadata_tracker();

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
        WHEN aem.external_metadata IS NULL AND accession_aem.external_metadata IS NULL THEN sepd.processed_data
        ELSE sepd.processed_data ||
            jsonb_build_object(
                'metadata',
                (sepd.processed_data -> 'metadata')
                    || COALESCE(accession_aem.external_metadata, '{}'::jsonb)
                    || COALESCE(aem.external_metadata, '{}'::jsonb)
            )
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
    FROM accession_version_external_metadata em
    GROUP BY em.accession, em.version
) aem
    ON aem.accession = se.accession
    AND aem.version = se.version
LEFT JOIN (
    SELECT
        aemt.accession,
        jsonb_merge_agg(aemt.external_metadata) AS external_metadata
    FROM accession_external_metadata aemt
    GROUP BY aemt.accession
) accession_aem
    ON accession_aem.accession = se.accession;
