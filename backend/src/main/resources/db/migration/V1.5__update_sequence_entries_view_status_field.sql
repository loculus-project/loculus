drop view if exists sequence_entries_view;

create view sequence_entries_view as
select
    se.*,
    sepd.started_processing_at,
    sepd.finished_processing_at,
    sepd.processed_data as processed_data,
    sepd.processed_data || em.joint_metadata as joint_metadata,
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
    left join sequence_entries_preprocessed_data sepd on
        se.accession = sepd.accession
        and se.version = sepd.version
        and sepd.pipeline_version = (select version from current_processing_pipeline)
    left join external_metadata_view em on
        se.accession = em.accession
        and se.version = em.version;

update sequence_entries_preprocessed_data
set processing_status = 'PROCESSED'
where processing_status in ('HAS_ERRORS', 'FINISHED');
