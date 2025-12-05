-- Add index on (accession, version) without pipeline_version for faster lookups
-- This improves query performance on sequence_entries_view which joins on these columns
CREATE INDEX IF NOT EXISTS sequence_entries_preprocessed_data_accession_version_idx
ON sequence_entries_preprocessed_data (accession, version);
