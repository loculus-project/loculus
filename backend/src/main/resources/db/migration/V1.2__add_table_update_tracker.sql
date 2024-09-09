-- Create the table_update_tracker table
CREATE TABLE table_update_tracker (
    table_name TEXT PRIMARY KEY,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to update the last_updated timestamp
CREATE OR REPLACE FUNCTION update_table_tracker()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME != 'table_update_tracker' THEN
        INSERT INTO table_update_tracker (table_name, last_updated)
        VALUES (TG_TABLE_NAME, CURRENT_TIMESTAMP)
        ON CONFLICT (table_name)
        DO UPDATE SET last_updated = CURRENT_TIMESTAMP;
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
            CREATE TRIGGER update_tracker_trigger
            AFTER INSERT OR UPDATE OR DELETE ON %I
            FOR EACH STATEMENT
            EXECUTE FUNCTION update_table_tracker()', table_name);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all existing tables
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOR table_name IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          AND table_name != 'table_update_tracker'
    LOOP
        PERFORM create_update_trigger_for_table(table_name);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
