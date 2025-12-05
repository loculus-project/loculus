-- Add partial index for preprocessing pipeline polling query
-- This query runs frequently (~3000+ times during ingest) to find unprocessed entries:
--   SELECT ... FROM sequence_entries WHERE organism = $1 AND NOT is_revocation
--   AND NOT EXISTS (SELECT ... FROM sequence_entries_preprocessed_data WHERE ...)
--   ORDER BY accession LIMIT $2
--
-- The partial index enables Index Only Scan and eliminates runtime filtering
CREATE INDEX IF NOT EXISTS sequence_entries_organism_not_revocation_idx
ON sequence_entries (organism, accession, version)
WHERE NOT is_revocation;
