CREATE OR REPLACE VIEW released_entries_view AS
SELECT
    se.accession,
    se.version,
    se.submission_id,
    se.submitter,
    se.approver,
    se.group_id,
    se.submitted_at,
    se.released_at,
    se.is_revocation,
    se.version_comment,
    CASE
        WHEN aem.external_metadata IS NULL THEN sepd.processed_data
        ELSE sepd.processed_data || jsonb_build_object(
            'metadata',
            (sepd.processed_data -> 'metadata') || aem.external_metadata
        )
    END AS processed_data_with_external_metadata,
    newest_dut.data_use_terms_type,
    newest_dut.restricted_until
    gt.group_name
FROM
    public.sequence_entries se
    INNER JOIN public.sequence_entries_preprocessed_data sepd ON se.accession = sepd.accession
    AND se.version = sepd.version
    INNER JOIN (
        SELECT
            DISTINCT ON (dut.accession) dut.accession,
            dut.data_use_terms_type,
            dut.restricted_until
        FROM
            public.data_use_terms_table dut
        ORDER BY
            dut.accession,
            dut.change_date DESC
    ) newest_dut ON newest_dut.accession = se.accession
    LEFT JOIN (
        SELECT
            em.accession,
            em.version,
            jsonb_merge_agg(em.external_metadata) AS external_metadata
        FROM
            public.external_metadata em
        GROUP BY
            em.accession,
            em.version
    ) aem ON aem.accession = se.accession
    AND aem.version = se.version
    INNER JOIN public.groups_table gt ON se.group_id = gt.group_id
WHERE
    se.released_at IS NOT NULL;


-- Quick filter by pipeline version for preprocessed data
create index if not exists sepd_pipeline_idx
    on sequence_entries_preprocessed_data (pipeline_version);

-- Quickly get external metadata for an accession and version
create index if not exists external_metadata_accession_version_idx
    on external_metadata (accession, version);

-- Quickly get the latest data use terms for an accession including relevant fields
create index if not exists dut_acc_changedata_include_duttype_restricted_idx
    on data_use_terms_table (accession, change_date desc)
    include (data_use_terms_type, restricted_until);

-- Quickly get the latest revoked version for an accession
create index if not exists se_released_revoked_organism_acc_version_desc_idx
    on sequence_entries (organism, accession, version desc)
    where released_at is not null and is_revocation = true;

-- Quickly get the latest released version for an accession
create index if not exists se_released_organism_acc_version_desc_idx
    on sequence_entries (organism, accession, version desc)
    where released_at is not null;
