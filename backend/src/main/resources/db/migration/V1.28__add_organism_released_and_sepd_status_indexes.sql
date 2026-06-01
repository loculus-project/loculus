-- Partial index for all three ETag queries that filter on organism + released_at IS NOT NULL:
CREATE INDEX IF NOT EXISTS sequence_entries_organism_released_idx
    ON sequence_entries (organism)
    WHERE released_at IS NOT NULL;

-- Partial index for getLatestFinishedProcessingAtForReleasedData which filters sep on
-- pipeline_version = ? AND processing_status = 'FINISHED'.
CREATE INDEX IF NOT EXISTS sequence_entries_preprocessed_data_pipeline_status_idx
    ON sequence_entries_preprocessed_data (pipeline_version)
    WHERE processing_status = 'FINISHED';
