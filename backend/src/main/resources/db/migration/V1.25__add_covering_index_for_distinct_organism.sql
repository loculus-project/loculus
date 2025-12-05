-- Covering index for DISTINCT organism query used in pipeline version checks
-- The existing sequence_entries_organism_idx works but requires heap fetches
-- for visibility checks until VACUUM runs. This index includes accession to
-- enable pure Index Only Scans regardless of visibility map state.
--
-- This query runs ~140+ times during ingest. Without proper vacuuming,
-- it does 36k+ heap fetches scanning 170k rows to return just 4 organisms.
--
-- NOTE: Consider removing this index if the application is updated to get
-- organisms from configuration instead of querying the database.

-- Drop first in case a previous attempt left an invalid index
DROP INDEX IF EXISTS sequence_entries_organism_covering_idx;

CREATE INDEX sequence_entries_organism_covering_idx
ON sequence_entries (organism) INCLUDE (accession);
