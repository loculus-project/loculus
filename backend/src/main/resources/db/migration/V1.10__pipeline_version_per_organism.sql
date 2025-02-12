-- Introduced in https://github.com/loculus-project/loculus/pull/3534
-- Adds the new organism column to the current_processing_pipeline table,
-- Adds the organism constraint to external_metadata_view and sequence_entries_view

ALTER TABLE current_processing_pipeline
ADD COLUMN organism text;

-- Update the primary key to include the organism
ALTER TABLE current_processing_pipeline
DROP CONSTRAINT current_processing_pipeline_pkey;
ALTER TABLE current_processing_pipeline
ADD CONSTRAINT current_processing_pipeline_pkey PRIMARY KEY (organism, version);

-- Add current versions for all organisms
WITH distinct_organisms AS (
    SELECT DISTINCT organism
    FROM sequence_entries
),
pipeline_versions AS (
    SELECT version, started_using_at
    FROM current_processing_pipeline
)
INSERT INTO current_processing_pipeline (version, started_using_at, organism)
SELECT pv.version, pv.started_using_at, o.organism
FROM pipeline_versions pv
CROSS JOIN distinct_organisms o;

-- delete old null rows
DELETE FROM current_processing_pipeline
WHERE organism IS NULL;

-- Now, enforce the NOT NULL constraint
ALTER TABLE current_processing_pipeline
ALTER COLUMN organism SET NOT NULL;


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
        select sepd.*
        from
            sequence_entries_preprocessed_data sepd
            join sequence_entries se
                on sepd.accession = se.accession and sepd.version = se.version
            join current_processing_pipeline cpp
                on se.organism = cpp.organism and sepd.pipeline_version = cpp.version
    ) cpd
    left join all_external_metadata on
        all_external_metadata.accession = cpd.accession
        and all_external_metadata.version = cpd.version;

drop view if exists sequence_entries_view;

create view sequence_entries_view as
select
    se.*,
    sepd.started_processing_at,
    sepd.finished_processing_at,
    sepd.processed_data as processed_data,
    sepd.processed_data || em.joint_metadata as joint_metadata,
    case
        when se.is_revocation then (select version from current_processing_pipeline
                                    where organism = se.organism)
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
    left join sequence_entries_preprocessed_data sepd on
        se.accession = sepd.accession
        and se.version = sepd.version
    left join current_processing_pipeline ccp on  -- join or left join?
        se.organism = ccp.organism
        and sepd.pipeline_version = ccp.version
    left join external_metadata_view em on
        se.accession = em.accession
        and se.version = em.version;

update sequence_entries_preprocessed_data
set processing_status = 'PROCESSED'
where processing_status in ('HAS_ERRORS', 'FINISHED');
