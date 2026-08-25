-- Make the update-tracker upserts idempotent within a transaction.
--
-- Every tracker trigger is FOR EACH STATEMENT, but Exposed's batchInsert sends one
-- single-row INSERT statement per row over JDBC, so a 100k-row bulk insert fires the
-- trigger 100k times and upserts the *same* tracker row 100k times inside one
-- transaction. Those row versions cannot be pruned while the transaction is open, so
-- locating the live tuple gets steadily more expensive: the per-statement cost grows
-- linearly and the bulk insert becomes quadratic. Measured on a 100k-sequence
-- submission: 48.9 s, against 1.0 s with this guard.
--
-- timezone('UTC', CURRENT_TIMESTAMP) is transaction start time, so it is constant for
-- every firing within one transaction: after the first upsert the row already holds
-- the value the remaining 99,999 want to write. Skipping those no-op writes leaves the
-- committed state identical.
--
-- The guard also makes the value monotonic across concurrent transactions (max-wins
-- rather than last-writer-wins). That is what the consumers want: the released-data
-- ETag takes the max over tracker rows, and a timestamp that can move backwards would
-- let a client keep a stale cache entry.

CREATE OR REPLACE FUNCTION update_table_tracker()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME != 'table_update_tracker' THEN
        INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated)
        VALUES (TG_TABLE_NAME, NULL, NULL, timezone('UTC', CURRENT_TIMESTAMP))
        ON CONFLICT (table_name, organism, pipeline_version)
        DO UPDATE SET last_time_updated = EXCLUDED.last_time_updated
        WHERE table_update_tracker.last_time_updated < EXCLUDED.last_time_updated;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_preprocessed_data_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated)
    SELECT TG_TABLE_NAME, se.organism, cr.pipeline_version, timezone('UTC', CURRENT_TIMESTAMP)
    FROM changed_rows cr
    JOIN sequence_entries se
      ON se.accession = cr.accession AND se.version = cr.version
    GROUP BY se.organism, cr.pipeline_version
    ON CONFLICT (table_name, organism, pipeline_version)
    DO UPDATE SET last_time_updated = EXCLUDED.last_time_updated
    WHERE table_update_tracker.last_time_updated < EXCLUDED.last_time_updated;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_external_metadata_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated)
    SELECT TG_TABLE_NAME, se.organism, NULL, timezone('UTC', CURRENT_TIMESTAMP)
    FROM changed_rows cr
    JOIN sequence_entries se
      ON se.accession = cr.accession AND se.version = cr.version
    GROUP BY se.organism
    ON CONFLICT (table_name, organism, pipeline_version)
    DO UPDATE SET last_time_updated = EXCLUDED.last_time_updated
    WHERE table_update_tracker.last_time_updated < EXCLUDED.last_time_updated;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_data_use_terms_table_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated)
    SELECT TG_TABLE_NAME, se.organism, NULL, timezone('UTC', CURRENT_TIMESTAMP)
    FROM changed_rows cr
    JOIN sequence_entries se
      ON se.accession = cr.accession
    GROUP BY se.organism
    ON CONFLICT (table_name, organism, pipeline_version)
    DO UPDATE SET last_time_updated = EXCLUDED.last_time_updated
    WHERE table_update_tracker.last_time_updated < EXCLUDED.last_time_updated;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_sequence_entries_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated)
    SELECT TG_TABLE_NAME, cr.organism, NULL, timezone('UTC', CURRENT_TIMESTAMP)
    FROM changed_rows cr
    GROUP BY cr.organism
    ON CONFLICT (table_name, organism, pipeline_version)
    DO UPDATE SET last_time_updated = EXCLUDED.last_time_updated
    WHERE table_update_tracker.last_time_updated < EXCLUDED.last_time_updated;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_current_processing_pipeline_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated)
    SELECT TG_TABLE_NAME, cr.organism, NULL, timezone('UTC', CURRENT_TIMESTAMP)
    FROM changed_rows cr
    GROUP BY cr.organism
    ON CONFLICT (table_name, organism, pipeline_version)
    DO UPDATE SET last_time_updated = EXCLUDED.last_time_updated
    WHERE table_update_tracker.last_time_updated < EXCLUDED.last_time_updated;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
