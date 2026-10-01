-- UseNewerProcessingPipelineVersionTask (findNewPreprocessingPipelineVersion) first looks for processed data of a
-- pipeline version above the organism's current one, every 10 s per organism. Without an index on
-- pipeline_version that is a sequential scan of sequence_entries_preprocessed_data joined with a scan of
-- sequence_entries (~1 s per check for 2M SARS-CoV-2 entries); with it, a range scan over the few newer rows.
-- CONCURRENTLY does not block preprocessing while the index is built; Flyway runs this script outside a transaction.
-- An interrupted build leaves an INVALID index that IF NOT EXISTS then skips: drop it by hand and restart.
CREATE INDEX CONCURRENTLY IF NOT EXISTS sequence_entries_preprocessed_data_pipeline_version_idx
ON sequence_entries_preprocessed_data (pipeline_version);
