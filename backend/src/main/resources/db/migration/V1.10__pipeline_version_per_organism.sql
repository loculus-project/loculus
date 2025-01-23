-- Adds the new organism column to the table, and adds an entry for each organism.

ALTER TABLE current_processing_pipeline
ADD COLUMN organism text;

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

DELETE FROM current_processing_pipeline
WHERE organism IS NULL;

-- Now, enforce the NOT NULL constraint
ALTER TABLE current_processing_pipeline
ALTER COLUMN organism SET NOT NULL;

