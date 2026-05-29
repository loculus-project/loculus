-- Add a nullable organism column to table_update_tracker.
-- Rows for organism-specific tables carry the organism name;
-- rows for tables without an organism column have organism = NULL.

ALTER TABLE table_update_tracker ADD COLUMN organism TEXT;
ALTER TABLE table_update_tracker DROP CONSTRAINT table_update_tracker_pkey;

-- Two partial unique indexes replace the old single-column primary key.
-- ON CONFLICT inference in the trigger upserts references these indexes.
CREATE UNIQUE INDEX table_update_tracker_no_organism_idx
    ON table_update_tracker (table_name)
    WHERE organism IS NULL;

CREATE UNIQUE INDEX table_update_tracker_with_organism_idx
    ON table_update_tracker (table_name, organism)
    WHERE organism IS NOT NULL;

-- Drop the old trigger function (CASCADE removes all dependent triggers).
DROP FUNCTION IF EXISTS update_table_tracker() CASCADE;
DROP FUNCTION IF EXISTS create_update_trigger_for_table(TEXT) CASCADE;

-- Trigger function for tables that do NOT have an organism column.
-- Inserts/updates a row with organism = NULL.
CREATE OR REPLACE FUNCTION update_table_tracker_no_organism()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, last_time_updated)
    VALUES (TG_TABLE_NAME, NULL, timezone('UTC', CURRENT_TIMESTAMP))
    ON CONFLICT (table_name) WHERE organism IS NULL
    DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for INSERT/UPDATE on tables WITH an organism column.
-- The calling trigger must declare: REFERENCING NEW TABLE AS new_rows
CREATE OR REPLACE FUNCTION update_table_tracker_from_new_rows()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, last_time_updated)
    SELECT TG_TABLE_NAME, organism, timezone('UTC', CURRENT_TIMESTAMP)
    FROM (SELECT DISTINCT organism FROM new_rows) t
    ON CONFLICT (table_name, organism) WHERE organism IS NOT NULL
    DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for DELETE on tables WITH an organism column.
-- The calling trigger must declare: REFERENCING OLD TABLE AS old_rows
CREATE OR REPLACE FUNCTION update_table_tracker_from_old_rows()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, last_time_updated)
    SELECT TG_TABLE_NAME, organism, timezone('UTC', CURRENT_TIMESTAMP)
    FROM (SELECT DISTINCT organism FROM old_rows) t
    ON CONFLICT (table_name, organism) WHERE organism IS NOT NULL
    DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for TRUNCATE on tables WITH an organism column.
-- Transition tables are unavailable for TRUNCATE, so we update all existing
-- per-organism entries for the table and add a NULL-organism catch-all.
CREATE OR REPLACE FUNCTION update_table_tracker_on_truncate()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE table_update_tracker
    SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP)
    WHERE table_name = TG_TABLE_NAME;

    INSERT INTO table_update_tracker (table_name, organism, last_time_updated)
    VALUES (TG_TABLE_NAME, NULL, timezone('UTC', CURRENT_TIMESTAMP))
    ON CONFLICT (table_name) WHERE organism IS NULL
    DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Helper: create organism-aware triggers for a table that has an organism column.
CREATE OR REPLACE FUNCTION create_organism_update_trigger_for_table(p_table_name TEXT)
RETURNS VOID AS $$
BEGIN
    EXECUTE format('
        CREATE OR REPLACE TRIGGER update_tracker_insert_update_trigger
        AFTER INSERT OR UPDATE ON %I
        REFERENCING NEW TABLE AS new_rows
        FOR EACH STATEMENT
        EXECUTE FUNCTION update_table_tracker_from_new_rows()', p_table_name);

    EXECUTE format('
        CREATE OR REPLACE TRIGGER update_tracker_delete_trigger
        AFTER DELETE ON %I
        REFERENCING OLD TABLE AS old_rows
        FOR EACH STATEMENT
        EXECUTE FUNCTION update_table_tracker_from_old_rows()', p_table_name);

    EXECUTE format('
        CREATE OR REPLACE TRIGGER update_tracker_truncate_trigger
        AFTER TRUNCATE ON %I
        FOR EACH STATEMENT
        EXECUTE FUNCTION update_table_tracker_on_truncate()', p_table_name);
END;
$$ LANGUAGE plpgsql;

-- Helper: create a simple statement-level trigger for tables WITHOUT
-- an organism column (inserts with organism = NULL).
CREATE OR REPLACE FUNCTION create_update_trigger_for_table(p_table_name TEXT)
RETURNS VOID AS $$
BEGIN
    IF p_table_name != 'table_update_tracker' THEN
        EXECUTE format('
            CREATE OR REPLACE TRIGGER update_tracker_trigger
            AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I
            FOR EACH STATEMENT
            EXECUTE FUNCTION update_table_tracker_no_organism()', p_table_name);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Tables that have an organism column
SELECT create_organism_update_trigger_for_table('sequence_entries');
SELECT create_organism_update_trigger_for_table('sequence_entries_preprocessed_data');
SELECT create_organism_update_trigger_for_table('external_metadata');
SELECT create_organism_update_trigger_for_table('metadata_upload_aux_table');
SELECT create_organism_update_trigger_for_table('current_processing_pipeline');
SELECT create_organism_update_trigger_for_table('data_use_terms_table');

-- Tables without an organism column
SELECT create_update_trigger_for_table('groups_table');
SELECT create_update_trigger_for_table('user_groups_table');
SELECT create_update_trigger_for_table('sequence_upload_aux_table');
