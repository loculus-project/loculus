-- Queries for released data (SILO polling, approval scope resolution, released
-- downloads) used to filter on sequence_entries_view.status, which is a CASE
-- expression computed per row — Postgres cannot serve it from an index, so every
-- such query paid a full scan of sequence_entries even when nothing was released
-- yet. The backend now filters those queries on released_at IS NOT NULL directly
-- (equivalent by the view definition: released_at IS NOT NULL is the first,
-- unconditional branch of the status CASE), which this partial index serves.
CREATE INDEX sequence_entries_released_idx
    ON sequence_entries (organism, accession, version)
    WHERE released_at IS NOT NULL;
