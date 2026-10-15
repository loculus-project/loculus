-- Scope current_processing_pipeline tracker updates by organism.
-- current_processing_pipeline has one row per organism, so changing the current
-- pipeline for one organism should not invalidate released-data ETags for all
-- organisms.


DROP TRIGGER IF EXISTS update_tracker_trigger ON current_processing_pipeline;

CREATE OR REPLACE FUNCTION update_current_processing_pipeline_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated)
    SELECT TG_TABLE_NAME, cr.organism, NULL, timezone('UTC', CURRENT_TIMESTAMP)
    FROM changed_rows cr
    GROUP BY cr.organism
    ON CONFLICT (table_name, organism, pipeline_version)
    DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tracker_trigger_ins
AFTER INSERT ON current_processing_pipeline
REFERENCING NEW TABLE AS changed_rows
FOR EACH STATEMENT EXECUTE FUNCTION update_current_processing_pipeline_tracker();

CREATE TRIGGER update_tracker_trigger_upd
AFTER UPDATE ON current_processing_pipeline
REFERENCING NEW TABLE AS changed_rows
FOR EACH STATEMENT EXECUTE FUNCTION update_current_processing_pipeline_tracker();

CREATE TRIGGER update_tracker_trigger_del
AFTER DELETE ON current_processing_pipeline
REFERENCING OLD TABLE AS changed_rows
FOR EACH STATEMENT EXECUTE FUNCTION update_current_processing_pipeline_tracker();