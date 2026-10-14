drop view if exists external_metadata_view cascade;

create view external_metadata_view as
select sepd.accession,
       sepd.version,
       aem.updated_metadata_at,
       case
           when aem.external_metadata is null
           then jsonb_build_object('metadata', sepd.processed_data -> 'metadata')
           else jsonb_build_object('metadata', sepd.processed_data -> 'metadata' ||
                aem.external_metadata)
       end as joint_metadata
from sequence_entries_preprocessed_data sepd
join sequence_entries se
    on se.accession = sepd.accession
    and se.version = sepd.version
join current_processing_pipeline cpp
    on cpp.organism = se.organism
    and cpp.version = sepd.pipeline_version
left join all_external_metadata aem
    on aem.accession = sepd.accession
    and aem.version = sepd.version;

drop view if exists sequence_entries_view;

create view sequence_entries_view as
select
    se.*,
    sepd.started_processing_at,
    sepd.finished_processing_at,
    sepd.processed_data as processed_data,
    sepd.processed_data || em.joint_metadata as joint_metadata,
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
    left join external_metadata_view em on
        se.accession = em.accession
        and se.version = em.version;
