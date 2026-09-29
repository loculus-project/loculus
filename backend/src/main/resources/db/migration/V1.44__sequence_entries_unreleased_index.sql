-- approveProcessedData (autoapprove calls it every ~70 s per organism) selects PROCESSED entries from
-- sequence_entries_view. It also filters on released_at IS NULL, which every unreleased entry satisfies, so this
-- index lets Postgres start from the organism's unreleased entries instead of joining all of them with
-- sequence_entries_preprocessed_data (6.45 s per call for 3.8M SARS-CoV-2 entries with nothing to approve).
-- The index holds only unreleased entries, so its size follows the backlog, not the table.
-- CONCURRENTLY does not block submissions while the index is built; Flyway runs this script outside a transaction.
-- An interrupted build leaves an INVALID index that IF NOT EXISTS then skips: drop it by hand and restart.
CREATE INDEX CONCURRENTLY IF NOT EXISTS sequence_entries_unreleased_idx
ON sequence_entries (organism) WHERE released_at IS NULL;
