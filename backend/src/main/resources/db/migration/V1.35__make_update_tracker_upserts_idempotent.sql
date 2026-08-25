-- Skip the tracker upsert when this transaction already wrote the row.
--
-- Exposed's batchInsert sends one single-row INSERT per row, so these FOR EACH STATEMENT
-- triggers fire once per row and rewrite the same tracker row 100k times in one
-- transaction. Those versions cannot be pruned while it is open, so the insert goes
-- quadratic: 48.9 s for 100k rows, against ~1 s here.
--
-- Two guards that look right and are not: xmin instead of a stored id (xmin is the
-- SUBtransaction id, so the guard never fires -- it silently did nothing on CI), and
-- `last_time_updated < EXCLUDED...` (that column is transaction START time, so a
-- transaction starting earlier but committing later would have its write dropped and
-- readers holding the cached value would never refetch).
--
-- last_time_updated keeps its existing last-writer-wins behaviour, including that it can
-- move backwards, so it stays safe to compare only for equality.

ALTER TABLE table_update_tracker ADD COLUMN IF NOT EXISTS last_xid xid8;

CREATE OR REPLACE FUNCTION update_table_tracker()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME != 'table_update_tracker' THEN
        INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated, last_xid)
        VALUES (TG_TABLE_NAME, NULL, NULL, timezone('UTC', CURRENT_TIMESTAMP), pg_current_xact_id())
        ON CONFLICT (table_name, organism, pipeline_version) DO UPDATE SET
            last_time_updated = EXCLUDED.last_time_updated,
            last_xid = EXCLUDED.last_xid
        WHERE table_update_tracker.last_xid IS DISTINCT FROM EXCLUDED.last_xid;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_preprocessed_data_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated, last_xid)
    SELECT TG_TABLE_NAME, se.organism, cr.pipeline_version, timezone('UTC', CURRENT_TIMESTAMP), pg_current_xact_id()
    FROM changed_rows cr
    JOIN sequence_entries se ON se.accession = cr.accession AND se.version = cr.version
    GROUP BY se.organism, cr.pipeline_version
    ON CONFLICT (table_name, organism, pipeline_version) DO UPDATE SET
        last_time_updated = EXCLUDED.last_time_updated,
        last_xid = EXCLUDED.last_xid
    WHERE table_update_tracker.last_xid IS DISTINCT FROM EXCLUDED.last_xid;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_external_metadata_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated, last_xid)
    SELECT TG_TABLE_NAME, se.organism, NULL, timezone('UTC', CURRENT_TIMESTAMP), pg_current_xact_id()
    FROM changed_rows cr
    JOIN sequence_entries se ON se.accession = cr.accession AND se.version = cr.version
    GROUP BY se.organism
    ON CONFLICT (table_name, organism, pipeline_version) DO UPDATE SET
        last_time_updated = EXCLUDED.last_time_updated,
        last_xid = EXCLUDED.last_xid
    WHERE table_update_tracker.last_xid IS DISTINCT FROM EXCLUDED.last_xid;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_data_use_terms_table_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated, last_xid)
    SELECT TG_TABLE_NAME, se.organism, NULL, timezone('UTC', CURRENT_TIMESTAMP), pg_current_xact_id()
    FROM changed_rows cr
    JOIN sequence_entries se ON se.accession = cr.accession
    GROUP BY se.organism
    ON CONFLICT (table_name, organism, pipeline_version) DO UPDATE SET
        last_time_updated = EXCLUDED.last_time_updated,
        last_xid = EXCLUDED.last_xid
    WHERE table_update_tracker.last_xid IS DISTINCT FROM EXCLUDED.last_xid;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_sequence_entries_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated, last_xid)
    SELECT TG_TABLE_NAME, cr.organism, NULL, timezone('UTC', CURRENT_TIMESTAMP), pg_current_xact_id()
    FROM changed_rows cr
    GROUP BY cr.organism
    ON CONFLICT (table_name, organism, pipeline_version) DO UPDATE SET
        last_time_updated = EXCLUDED.last_time_updated,
        last_xid = EXCLUDED.last_xid
    WHERE table_update_tracker.last_xid IS DISTINCT FROM EXCLUDED.last_xid;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_current_processing_pipeline_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated, last_xid)
    SELECT TG_TABLE_NAME, cr.organism, NULL, timezone('UTC', CURRENT_TIMESTAMP), pg_current_xact_id()
    FROM changed_rows cr
    GROUP BY cr.organism
    ON CONFLICT (table_name, organism, pipeline_version) DO UPDATE SET
        last_time_updated = EXCLUDED.last_time_updated,
        last_xid = EXCLUDED.last_xid
    WHERE table_update_tracker.last_xid IS DISTINCT FROM EXCLUDED.last_xid;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

