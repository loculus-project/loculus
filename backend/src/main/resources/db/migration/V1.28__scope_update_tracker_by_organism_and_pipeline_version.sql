-- Scope the update tracker (used for the released-data ETag) by organism and pipeline version.
--
-- Previously table_update_tracker held a single row per table. Any write to
-- sequence_entries_preprocessed_data -- e.g. a reprocessing run for a single
-- organism, or a background run of a not-yet-current pipeline version -- bumped
-- the one shared timestamp and therefore invalidated the released-data ETag for
-- *every* organism. We add organism and pipeline_version dimensions so that
-- preprocessed-data writes only invalidate the ETag of the affected organism and
-- pipeline version.
--
-- All other tables keep writing table-wide rows using the '' (organism) and 0
-- (pipeline_version) sentinels. The ETag query then unions the sentinel rows
-- with the organism/pipeline-specific rows (organism IN ('', :organism) AND
-- pipeline_version IN (0, :currentPipelineVersion)), so correctness is preserved
-- while preprocessing churn no longer crosses organism boundaries.

ALTER TABLE table_update_tracker ADD COLUMN organism TEXT NOT NULL DEFAULT '';
ALTER TABLE table_update_tracker ADD COLUMN pipeline_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE table_update_tracker DROP CONSTRAINT table_update_tracker_pkey;
ALTER TABLE table_update_tracker ADD PRIMARY KEY (table_name, organism, pipeline_version);

-- The generic tracker function still writes table-wide rows, but its ON CONFLICT
-- target must now match the new composite primary key (the previous
-- ON CONFLICT (table_name) is no longer backed by a unique constraint).
CREATE OR REPLACE FUNCTION update_table_tracker()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME != 'table_update_tracker' THEN
        INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated)
        VALUES (TG_TABLE_NAME, '', 0, timezone('UTC', CURRENT_TIMESTAMP))
        ON CONFLICT (table_name, organism, pipeline_version)
        DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Replace the generic per-statement trigger on the preprocessed-data table with
-- organism/pipeline-version aware ones. organism is resolved via the
-- (accession, version) foreign key into sequence_entries; pipeline_version is a
-- native column of the preprocessed-data table.
DROP TRIGGER IF EXISTS update_tracker_trigger ON sequence_entries_preprocessed_data;

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
    DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- One trigger per event, because each must name its transition table
-- `changed_rows`, and Postgres forbids transition tables on triggers that cover
-- more than one event. NEW TABLE exists for INSERT/UPDATE, OLD TABLE for DELETE.
-- Cascading deletes from sequence_entries are still covered by sequence_entries'
-- own table-wide trigger, so the ETag changes even when the parent rows are
-- already gone.
CREATE TRIGGER update_tracker_trigger_ins
AFTER INSERT ON sequence_entries_preprocessed_data
REFERENCING NEW TABLE AS changed_rows
FOR EACH STATEMENT EXECUTE FUNCTION update_preprocessed_data_tracker();

CREATE TRIGGER update_tracker_trigger_upd
AFTER UPDATE ON sequence_entries_preprocessed_data
REFERENCING NEW TABLE AS changed_rows
FOR EACH STATEMENT EXECUTE FUNCTION update_preprocessed_data_tracker();

CREATE TRIGGER update_tracker_trigger_del
AFTER DELETE ON sequence_entries_preprocessed_data
REFERENCING OLD TABLE AS changed_rows
FOR EACH STATEMENT EXECUTE FUNCTION update_preprocessed_data_tracker();
