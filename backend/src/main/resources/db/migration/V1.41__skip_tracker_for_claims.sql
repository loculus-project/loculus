-- Claims (INSERTs of IN_PROCESSING rows) no longer bump table_update_tracker.
--
-- The tracker holds one row per (table, organism, pipeline_version), and the claim transaction stays open until its
-- response has been streamed. Upserting that row from every claim therefore made the claims of one organism wait
-- for each other. No ETag needs to see a claim:
-- - extract-unprocessed-data: a claim only removes claimable entries. Entries become claimable again through a
--   DELETE of their preprocessed row (stale-claim clean-up, edits), which still bumps the tracker.
-- - get-released-data: released data reads processed rows of the current pipeline version, and a released entry
--   already has one, so it is never claimed for that version.
-- - the pipeline-version switch: it needs processed results, which are written by UPDATE.
--
-- Only the function changes, so the migration takes no lock on sequence_entries_preprocessed_data.
CREATE OR REPLACE FUNCTION update_preprocessed_data_tracker()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO table_update_tracker (table_name, organism, pipeline_version, last_time_updated)
    SELECT TG_TABLE_NAME, se.organism, cr.pipeline_version, timezone('UTC', CURRENT_TIMESTAMP)
    FROM changed_rows cr
    JOIN sequence_entries se
      ON se.accession = cr.accession AND se.version = cr.version
    WHERE TG_OP <> 'INSERT' OR cr.processing_status IS DISTINCT FROM 'IN_PROCESSING'
    GROUP BY se.organism, cr.pipeline_version
    ON CONFLICT (table_name, organism, pipeline_version)
    DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
