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
-- The guard skips a write only when the row's current version was created by the
-- *same* transaction (xmin = our xid), which is exactly the redundant storm: after the
-- first upsert every later firing in that transaction would rewrite the value it
-- already holds, since timezone('UTC', CURRENT_TIMESTAMP) is transaction start time
-- and therefore constant across all of them. One version per transaction instead of
-- 100k; committed state identical.
--
-- Deliberately NOT keyed off the timestamp (e.g. `WHERE last_time_updated <
-- EXCLUDED.last_time_updated`). Because the value is transaction *start* time, it does
-- not follow commit order: a transaction that starts earlier can commit later, and a
-- max-wins guard would then drop its write and leave the tracker on a value a client
-- has already cached -- so that client would get a 304 and never see the newer data.
-- Verified: with a max-wins guard the tracker does not change after the late commit;
-- with this xid guard it does, matching the existing last-writer-wins behaviour.
--
-- Both consumers (ReleasedDataModel.getLastDatabaseWrite and
-- SubmissionDatabaseService.useNewerProcessingPipelineIfPossible) compare this value
-- for *equality*, never ordering, so last-writer-wins is safe even though the value can
-- move backwards. Note for future work: transaction start time is not a sound "as of"
-- clock, so this column must never be used with `>` / "changed since T" semantics.

CREATE OR REPLACE FUNCTION update_table_tracker()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME != 'table_update_tracker' THEN
        INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated)
        VALUES (TG_TABLE_NAME, NULL, NULL, timezone('UTC', CURRENT_TIMESTAMP))
        ON CONFLICT (table_name, organism, pipeline_version)
        DO UPDATE SET last_time_updated = EXCLUDED.last_time_updated
        WHERE table_update_tracker.xmin <> pg_current_xact_id()::xid;
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
    WHERE table_update_tracker.xmin <> pg_current_xact_id()::xid;
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
    WHERE table_update_tracker.xmin <> pg_current_xact_id()::xid;
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
    WHERE table_update_tracker.xmin <> pg_current_xact_id()::xid;
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
    WHERE table_update_tracker.xmin <> pg_current_xact_id()::xid;
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
    WHERE table_update_tracker.xmin <> pg_current_xact_id()::xid;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
