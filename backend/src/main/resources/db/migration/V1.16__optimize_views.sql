drop view if exists external_metadata_view cascade;

create view external_metadata_view as
select cpd.accession,
       cpd.version,
       all_external_metadata.updated_metadata_at,
       case
           when all_external_metadata.external_metadata is null
           then jsonb_build_object('metadata', cpd.processed_data -> 'metadata')
           else jsonb_build_object('metadata', cpd.processed_data -> 'metadata' ||
                all_external_metadata.external_metadata)
       end as joint_metadata
from sequence_entries_preprocessed_data cpd
join sequence_entries se
    on se.accession = cpd.accession
    and se.version = cpd.version
join current_processing_pipeline cpp
    on cpp.organism = se.organism
left join all_external_metadata
    on all_external_metadata.accession = cpd.accession
    and all_external_metadata.version = cpd.version
where cpd.pipeline_version = cpp.version;

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
    left join current_processing_pipeline ccp on
        se.organism = ccp.organism
    left join sequence_entries_preprocessed_data sepd on
        se.accession = sepd.accession
        and se.version = sepd.version
        and sepd.pipeline_version = ccp.version
    left join external_metadata_view em on
        se.accession = em.accession
        and se.version = em.version;
