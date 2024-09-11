-- Create the table_update_tracker table
CREATE TABLE table_update_tracker (
    table_name TEXT PRIMARY KEY,
    last_time_updated TIMESTAMP DEFAULT timezone('UTC', CURRENT_TIMESTAMP)
);

-- Function to update the last_updated timestamp
CREATE OR REPLACE FUNCTION update_table_tracker()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME != 'table_update_tracker' THEN
        INSERT INTO table_update_tracker (table_name, last_time_updated)
        VALUES (TG_TABLE_NAME, timezone('UTC', CURRENT_TIMESTAMP))
        ON CONFLICT (table_name)
        DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to create a trigger for a single table
CREATE OR REPLACE FUNCTION create_update_trigger_for_table(table_name TEXT)
RETURNS VOID AS $$
BEGIN
    IF table_name != 'table_update_tracker' THEN
        EXECUTE format('
            CREATE OR REPLACE TRIGGER update_tracker_trigger
            AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I
            FOR EACH STATEMENT
            EXECUTE FUNCTION update_table_tracker()', table_name);
    END IF;
END;
$$ LANGUAGE plpgsql;

SELECT create_update_trigger_for_table('sequence_entries');
SELECT create_update_trigger_for_table('sequence_entries_preprocessed_data');
SELECT create_update_trigger_for_table('external_metadata');
SELECT create_update_trigger_for_table('groups_table');
SELECT create_update_trigger_for_table('current_processing_pipeline');
SELECT create_update_trigger_for_table('metadata_upload_aux_table');
SELECT create_update_trigger_for_table('sequence_upload_aux_table');
SELECT create_update_trigger_for_table('user_groups_table');