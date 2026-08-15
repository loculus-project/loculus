DROP TRIGGER IF EXISTS update_tracker_trigger_ins
ON sequence_entries_preprocessed_data;

DROP TRIGGER IF EXISTS update_tracker_trigger_upd
ON sequence_entries_preprocessed_data;

CREATE OR REPLACE FUNCTION update_preprocessed_data_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (
        table_name,
        organism,
        pipeline_version,
        last_time_updated
    )
    SELECT
        TG_TABLE_NAME,
        changed_rows.organism,
        changed_rows.pipeline_version,
        timezone('UTC', CURRENT_TIMESTAMP)
    FROM changed_rows
    WHERE changed_rows.processing_status = 'PROCESSED'
    GROUP BY changed_rows.organism, changed_rows.pipeline_version
    ON CONFLICT (table_name, organism, pipeline_version)
    DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
