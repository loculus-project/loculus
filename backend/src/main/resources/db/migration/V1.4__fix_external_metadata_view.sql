lock table sequence_entries_view, external_metadata_view in access exclusive mode;

drop view if exists external_metadata_view cascade;

create view external_metadata_view as
select
    cpd.accession,
    cpd.version,
    all_external_metadata.updated_metadata_at,
    -- Combines metadata from preprocessed data with any external metadata updates
    -- If there's no external metadata, just use the preprocessed data's metadata
    -- If there is external metadata, merge it with preprocessed data (external takes precedence)
    case 
        when all_external_metadata.external_metadata is null then 
            jsonb_build_object('metadata', (cpd.processed_data->'metadata'))
        else 
            jsonb_build_object(
                'metadata', 
                (cpd.processed_data->'metadata') || all_external_metadata.external_metadata
            )
    end as joint_metadata
from
    (
        -- Get only the preprocessed data for the current pipeline version
        select * from sequence_entries_preprocessed_data 
        where pipeline_version = (select version from current_processing_pipeline)
    ) cpd
    left join all_external_metadata on
        all_external_metadata.accession = cpd.accession
        and all_external_metadata.version = cpd.version;

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
        when se.is_revocation then 'AWAITING_APPROVAL'
        when sepd.processing_status = 'IN_PROCESSING' then 'IN_PROCESSING'
        when sepd.processing_status = 'HAS_ERRORS' then 'HAS_ERRORS'
        when sepd.processing_status = 'FINISHED' then 'AWAITING_APPROVAL'
        else 'RECEIVED'
    end as status
from
    sequence_entries se
    left join sequence_entries_preprocessed_data sepd on
        se.accession = sepd.accession
        and se.version = sepd.version
        and sepd.pipeline_version = (select version from current_processing_pipeline)
    left join external_metadata_view em on
        se.accession = em.accession
        and se.version = em.version;
