-- Per-organism changelog seqs: ProjectionWriter assigns seq = max(seq of the organism) + n while holding the
-- organism's query_engine_state row lock, so seqs of an organism become visible in commit order and without holes
-- (a global bigserial is assigned before commit: replicas tailing the changelog could skip a late-committing seq).
-- The bigserial default stays so that backends running older code keep working during a rolling update.
alter table query_changelog drop constraint query_changelog_pkey;
alter table query_changelog add primary key (organism, seq);
drop index query_changelog_organism_seq_idx;
