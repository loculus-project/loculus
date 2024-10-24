lock table sequence_entries_view, external_metadata_view in access exclusive mode;

drop view if exists external_metadata_view cascade;

create view external_metadata_view as
select
    sequence_entries_preprocessed_data.accession,
    sequence_entries_preprocessed_data.version,
	sequence_entries_preprocessed_data.pipeline_version,
    all_external_metadata.updated_metadata_at,
    -- || concatenates two JSON objects by generating an object containing the union of their keys
    -- taking the second object's value when there are duplicate keys.
    case 
        when all_external_metadata.external_metadata is null then jsonb_build_object('metadata', (sequence_entries_preprocessed_data.processed_data->'metadata'))
        else jsonb_build_object('metadata', (sequence_entries_preprocessed_data.processed_data->'metadata') || all_external_metadata.external_metadata)
    end as joint_metadata
from
    sequence_entries_preprocessed_data
    left join all_external_metadata  on
        all_external_metadata.accession = sequence_entries_preprocessed_data.accession
        and all_external_metadata.version = sequence_entries_preprocessed_data.version
where
	sequence_entries_preprocessed_data.pipeline_version = (select version from current_processing_pipeline);

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
