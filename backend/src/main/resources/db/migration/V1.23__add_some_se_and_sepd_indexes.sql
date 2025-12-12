-- Add index on (accession, version) without pipeline_version for faster lookups
-- This improves query performance on sequence_entries_view which joins on these columns
DROP INDEX IF EXISTS sequence_entries_preprocessed_data_accession_version_idx;

CREATE INDEX IF NOT EXISTS sequence_entries_preprocessed_data_accession_version_idx
ON sequence_entries_preprocessed_data (accession, version);

-- Add partial index for preprocessing pipeline polling query
-- This query runs frequently (~3000+ times during ingest) to find unprocessed entries:
--   SELECT ... FROM sequence_entries WHERE organism = $1 AND NOT is_revocation
--   AND NOT EXISTS (SELECT ... FROM sequence_entries_preprocessed_data WHERE ...)
--   ORDER BY accession LIMIT $2
--
-- The partial index enables Index Only Scan and eliminates runtime filtering
DROP INDEX IF EXISTS sequence_entries_organism_not_revocation_idx;

CREATE INDEX IF NOT EXISTS sequence_entries_organism_not_revocation_idx
ON sequence_entries (organism, accession, version)
WHERE NOT is_revocation;

-- Covering index for DISTINCT organism query used in pipeline version checks
-- The existing sequence_entries_organism_idx works but requires heap fetches
-- for visibility checks until VACUUM runs. This index includes accession to
-- enable pure Index Only Scans regardless of visibility map state.
--
-- This query runs ~140+ times during ingest. Without proper vacuuming,
-- it does 36k+ heap fetches scanning 170k rows to return just 4 organisms.

-- Drop first in case a previous attempt left an invalid index
DROP INDEX IF EXISTS sequence_entries_organism_covering_idx;

CREATE INDEX sequence_entries_organism_covering_idx
ON sequence_entries (organism) INCLUDE (accession);
