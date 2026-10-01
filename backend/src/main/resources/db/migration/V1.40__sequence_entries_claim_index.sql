-- Candidate step of the preprocessing claim (SubmissionDatabaseService.claimUnprocessedEntries): an index only scan
-- in (accession, version) order within one organism, so the claim no longer reads the heap row (with submitted_data)
-- of every already processed entry before reaching the unprocessed ones.
-- CONCURRENTLY does not block submissions while the index is built; Flyway runs this script outside a transaction.
-- An interrupted build leaves an INVALID index that IF NOT EXISTS then skips: drop it by hand and restart.
CREATE INDEX CONCURRENTLY IF NOT EXISTS sequence_entries_claim_idx
ON sequence_entries (organism, accession, version)
WHERE NOT is_revocation;
