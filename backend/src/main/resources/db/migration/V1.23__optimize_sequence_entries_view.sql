-- Optimizes sequence_entries_view by using LATERAL join for external metadata
-- instead of joining through external_metadata_view -> all_external_metadata.
-- This avoids the GROUP BY in all_external_metadata forcing early materialization
-- which breaks PostgreSQL query optimization when views are stacked.

drop view if exists sequence_entries_view cascade;
drop view if exists external_metadata_view cascade;

create view sequence_entries_view as
select
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
    sepd.processed_data as processed_data,
    case
        when aem.external_metadata is null then sepd.processed_data
        else sepd.processed_data ||
             jsonb_build_object('metadata', (sepd.processed_data -> 'metadata') || aem.external_metadata)
    end as joint_metadata,
    case
        when se.is_revocation then cpp.version
        else sepd.pipeline_version
    end as pipeline_version,
    sepd.errors,
    sepd.warnings,
    case
        when se.released_at is not null then 'APPROVED_FOR_RELEASE'
        when se.is_revocation then 'PROCESSED'
        when sepd.processing_status = 'IN_PROCESSING' then 'IN_PROCESSING'
        when sepd.processing_status = 'PROCESSED' then 'PROCESSED'
        else 'RECEIVED'
    end as status,
    case
        when sepd.processing_status = 'IN_PROCESSING' then null
        when sepd.errors is not null and jsonb_array_length(sepd.errors) > 0 then 'HAS_ERRORS'
        when sepd.warnings is not null and jsonb_array_length(sepd.warnings) > 0 then 'HAS_WARNINGS'
        else 'NO_ISSUES'
    end as processing_result
from
    sequence_entries se
    left join current_processing_pipeline cpp on
        se.organism = cpp.organism
    left join sequence_entries_preprocessed_data sepd on
        se.accession = sepd.accession
        and se.version = sepd.version
        and sepd.pipeline_version = cpp.version
    left join lateral (
        select
            jsonb_merge_agg(em.external_metadata) as external_metadata
        from external_metadata em
        where em.accession = se.accession
          and em.version = se.version
    ) aem on true;
