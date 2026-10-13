-- Partial index backing the "sequences awaiting review" notification bell (GET /my/review-counts),
-- which counts unreleased sequence entries grouped by organism and group.
CREATE INDEX IF NOT EXISTS sequence_entries_unreleased_by_organism_group_idx
    ON sequence_entries (organism, group_id)
    WHERE released_at IS NULL;
