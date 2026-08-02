-- The tracker function from V1.28 joined sequence_entries to find the organism. The rows carry it now.
-- The triggers are unchanged.

CREATE OR REPLACE FUNCTION update_preprocessed_data_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated)
    SELECT TG_TABLE_NAME, cr.organism, cr.pipeline_version, timezone('UTC', CURRENT_TIMESTAMP)
    FROM changed_rows cr
    GROUP BY cr.organism, cr.pipeline_version
    ON CONFLICT (table_name, organism, pipeline_version)
    DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
