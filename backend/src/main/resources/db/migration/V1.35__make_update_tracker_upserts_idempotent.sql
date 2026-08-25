-- Stop the update-tracker triggers rewriting the same row once per inserted row.
--
-- Every tracker trigger is FOR EACH STATEMENT, but Exposed's batchInsert sends one
-- single-row INSERT statement per row over JDBC, so a 100k-row bulk insert fires the
-- trigger 100k times and upserts the *same* tracker row 100k times inside one
-- transaction. Those row versions cannot be pruned while the transaction is open, so
-- locating the live tuple gets steadily more expensive: the per-statement cost grows
-- linearly and the bulk insert becomes quadratic. Measured on 100k rows: 48.9 s before,
-- ~1 s after, with the tracker staying on a single 8 kB page instead of bloating to
-- megabytes.
--
-- The guard records which transaction last wrote the row and skips the write when that
-- is us. last_xid holds pg_current_xact_id(), the TOP-LEVEL transaction id.
--
-- Do NOT try to do this with the system column xmin instead. Statements arrive inside
-- per-statement savepoints, so xmin is the *sub*transaction id and never equals the
-- top-level id, and the guard then never fires. That was measured, not guessed: an
-- xmin-based guard skipped correctly in a plain transaction but left the tracker growing
-- in lockstep with the insert on CI, and reproducing it locally with subtransactions
-- grew the tracker to 385 kB after only 5k inserts.
--
-- Do NOT guard on the timestamp either (WHERE last_time_updated < EXCLUDED...).
-- last_time_updated is transaction START time, which does not follow commit order, so a
-- transaction that starts earlier but commits later would have its write dropped,
-- leaving the tracker on a value a client has already cached; that client would get a
-- 304 and never see the newer data.
--
-- The value is additionally made monotonic in COMMIT order. Every writer already
-- serialises on this one tracker row, so the later committer always observes the earlier
-- one's value; GREATEST(existing + 1us, our start time) therefore makes the column
-- strictly increasing in commit order, without track_commit_timestamp (a server GUC plus
-- restart, which also returns NULL once an xid is frozen). It stays a timestamp, so the
-- SILO import format is unchanged. Under sustained concurrent writes the value can drift
-- microseconds ahead of the wall clock; it remains a valid ETag either way. Previously
-- the value could move backwards, so only equality comparisons were safe; now `>` is too.

ALTER TABLE table_update_tracker ADD COLUMN IF NOT EXISTS last_xid xid8;

CREATE OR REPLACE FUNCTION update_table_tracker()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME != 'table_update_tracker' THEN
        INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated, last_xid)
        VALUES (TG_TABLE_NAME, NULL, NULL, timezone('UTC', CURRENT_TIMESTAMP), pg_current_xact_id())
        ON CONFLICT (table_name, organism, pipeline_version) DO UPDATE SET
            last_time_updated = GREATEST(
                table_update_tracker.last_time_updated + interval '1 microsecond',
                EXCLUDED.last_time_updated),
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
        last_time_updated = GREATEST(
            table_update_tracker.last_time_updated + interval '1 microsecond',
            EXCLUDED.last_time_updated),
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
        last_time_updated = GREATEST(
            table_update_tracker.last_time_updated + interval '1 microsecond',
            EXCLUDED.last_time_updated),
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
        last_time_updated = GREATEST(
            table_update_tracker.last_time_updated + interval '1 microsecond',
            EXCLUDED.last_time_updated),
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
        last_time_updated = GREATEST(
            table_update_tracker.last_time_updated + interval '1 microsecond',
            EXCLUDED.last_time_updated),
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
        last_time_updated = GREATEST(
            table_update_tracker.last_time_updated + interval '1 microsecond',
            EXCLUDED.last_time_updated),
        last_xid = EXCLUDED.last_xid
    WHERE table_update_tracker.last_xid IS DISTINCT FROM EXCLUDED.last_xid;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

