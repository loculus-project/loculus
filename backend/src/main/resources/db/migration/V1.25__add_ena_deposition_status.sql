-- Adds a ena_deposition_status for each accessionVersion:
-- If accessionVersion was submitted by the InsdcIngestGroupId=1 set status to INGESTED (in INSDC)
-- If accessionVersion was deposited by the ENA deposition pod (there exists external metadata for that accessionVersion)
-- set status to DEPOSITED (in INSDC)
-- Else set status to READY - the deposition pod will revisions, revocations etc.

-- Note the accessionVersion might have been sent to the ENA deposition pod and might even be deposited
-- but until the ENA deposition pod updates the external metadata the state will stay in READY.

drop view if exists sequence_entries_view cascade;

CREATE VIEW public.sequence_entries_view AS
 SELECT se.accession,
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
        CASE
            WHEN (aem.has_ena_updater) THEN 'DEPOSITED'::text
            WHEN (se.group_id = 1) THEN 'INGESTED'::text
            ELSE 'READY'::text
        END AS ena_deposition_status,
    sepd.processed_data,
        CASE
            WHEN (aem.external_metadata IS NULL) THEN sepd.processed_data
            ELSE (sepd.processed_data || jsonb_build_object('metadata', ((sepd.processed_data -> 'metadata'::text) || aem.external_metadata)))
        END AS joint_metadata,
        CASE
            WHEN se.is_revocation THEN cpp.version
            ELSE sepd.pipeline_version
        END AS pipeline_version,
    sepd.errors,
    sepd.warnings,
        CASE
            WHEN (se.released_at IS NOT NULL) THEN 'APPROVED_FOR_RELEASE'::text
            WHEN se.is_revocation THEN 'PROCESSED'::text
            WHEN (sepd.processing_status = 'IN_PROCESSING'::text) THEN 'IN_PROCESSING'::text
            WHEN (sepd.processing_status = 'PROCESSED'::text) THEN 'PROCESSED'::text
            ELSE 'RECEIVED'::text
        END AS status,
        CASE
            WHEN (sepd.processing_status = 'IN_PROCESSING'::text) THEN NULL::text
            WHEN ((sepd.errors IS NOT NULL) AND (jsonb_array_length(sepd.errors) > 0)) THEN 'HAS_ERRORS'::text
            WHEN ((sepd.warnings IS NOT NULL) AND (jsonb_array_length(sepd.warnings) > 0)) THEN 'HAS_WARNINGS'::text
            ELSE 'NO_ISSUES'::text
        END AS processing_result
   FROM (((public.sequence_entries se
     LEFT JOIN public.current_processing_pipeline cpp ON ((se.organism = cpp.organism)))
     LEFT JOIN public.sequence_entries_preprocessed_data sepd ON (((se.accession = sepd.accession) AND (se.version = sepd.version) AND (sepd.pipeline_version = cpp.version))))
     LEFT JOIN ( SELECT em.accession,
            em.version,
            public.jsonb_merge_agg(em.external_metadata) AS external_metadata,
            BOOL_OR(em.external_metadata_updater = 'ena') AS has_ena_updater
           FROM public.external_metadata em
          GROUP BY em.accession, em.version) aem ON (((aem.accession = se.accession) AND (aem.version = se.version))));
