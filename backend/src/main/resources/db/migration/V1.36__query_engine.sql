-- Query engine: a query-optimised projection of the released data (the same data that
-- get-released-data serves), maintained incrementally by the backend.
-- See backend/src/main/kotlin/org/loculus/backend/query.

create table query_engine_state (
    organism text primary key,
    -- hash of the sequence encoding (segments/genes + references); a mismatch forces a full rebuild
    encoding_hash text not null,
    -- epoch seconds of the last change to the projection of this organism (LAPIS dataVersion)
    data_version bigint not null default 0,
    next_id integer not null default 0,
    needs_full_rebuild boolean not null default true,
    updated_at timestamp not null default now()
);

-- One row per released accessionVersion. `metadata` is the LAPIS record: exactly the fields of the
-- LAPIS/SILO database config, values typed as in LAPIS responses (dates as 'YYYY-MM-DD' strings).
create table query_entries (
    organism text not null,
    id integer not null,
    accession text not null,
    version bigint not null,
    accession_version text not null,
    metadata jsonb not null,
    primary key (organism, id)
);
create unique index query_entries_accession_version_idx on query_entries (organism, accession_version);
create index query_entries_accession_idx on query_entries (organism, accession);

-- Sequence-derived index data per entry (1:1 with query_entries).
--   present_sequences: schema sequence indices (segments and genes) that have a non-null aligned sequence
--   mutations:         MutationCode (seqIndex << 23 | position << 5 | symbolIndex) of every aligned symbol
--                      that is neither the reference symbol nor the missing symbol (N / X)
--   missing:           flattened triples (seqIndex, start, endExclusive) of runs of the missing symbol, 1-based
--   insertions:        '<seqIndex>:<position>:<SYMBOLS>'
create table query_mutation_data (
    organism text not null,
    id integer not null,
    present_sequences integer[] not null,
    mutations integer[] not null,
    missing integer[] not null,
    insertions text[] not null,
    primary key (organism, id)
);

-- Sequences as raw zstd frames (no base64), compressed with the reference as dictionary.
--   kind: 0 = unaligned nucleotide, 1 = aligned nucleotide, 2 = aligned amino acid
--   sequence_index: schema sequence index of the segment (kinds 0, 1) or gene (kind 2)
create table query_sequences (
    organism text not null,
    kind smallint not null,
    sequence_index smallint not null,
    id integer not null,
    compression_dict_id integer,
    data bytea not null,
    primary key (organism, kind, sequence_index, id)
);
alter table query_sequences alter column data set storage external;

-- Append-only change feed: every (re)written or deleted projection row. In-memory indexes of all
-- backend replicas tail this table.
create table query_changelog (
    seq bigserial primary key,
    organism text not null,
    id integer not null,
    created_at timestamp not null default now()
);
create index query_changelog_organism_seq_idx on query_changelog (organism, seq);

-- Work queue for the projector, filled by triggers on the source tables.
create table query_dirty_accessions (
    organism text not null,
    accession text not null,
    primary key (organism, accession)
);

-- ---------------------------------------------------------------------------------------------
-- Triggers marking accessions dirty. Statement level with transition tables, so bulk writes stay cheap.

create or replace function query_mark_dirty_from_sequence_entries()
returns trigger as $$
begin
    insert into query_dirty_accessions (organism, accession)
    select distinct cr.organism, cr.accession
    from changed_rows cr
    where cr.released_at is not null
    on conflict do nothing;
    return null;
end;
$$ language plpgsql;

create trigger query_dirty_trigger_ins after insert on sequence_entries
referencing new table as changed_rows for each statement execute function query_mark_dirty_from_sequence_entries();
create trigger query_dirty_trigger_upd after update on sequence_entries
referencing new table as changed_rows for each statement execute function query_mark_dirty_from_sequence_entries();
create trigger query_dirty_trigger_del after delete on sequence_entries
referencing old table as changed_rows for each statement execute function query_mark_dirty_from_sequence_entries();

-- for tables keyed by (accession, version) or accession only: only released entries matter
create or replace function query_mark_dirty_by_accession()
returns trigger as $$
begin
    insert into query_dirty_accessions (organism, accession)
    select distinct se.organism, se.accession
    from (select distinct accession from changed_rows) cr
    join sequence_entries se on se.accession = cr.accession
    where se.released_at is not null
    on conflict do nothing;
    return null;
end;
$$ language plpgsql;

-- preprocessed data: only rows of the current pipeline version are visible in the released data (a new pipeline
-- version being processed in the background must not mark every released accession dirty)
create or replace function query_mark_dirty_from_preprocessed_data()
returns trigger as $$
begin
    insert into query_dirty_accessions (organism, accession)
    select distinct se.organism, se.accession
    from (select distinct accession, version, pipeline_version from changed_rows) cr
    join sequence_entries se on se.accession = cr.accession and se.version = cr.version
    join current_processing_pipeline cpp on cpp.organism = se.organism and cpp.version = cr.pipeline_version
    where se.released_at is not null
    on conflict do nothing;
    return null;
end;
$$ language plpgsql;

create trigger query_dirty_trigger_ins after insert on sequence_entries_preprocessed_data
referencing new table as changed_rows for each statement execute function query_mark_dirty_from_preprocessed_data();
create trigger query_dirty_trigger_upd after update on sequence_entries_preprocessed_data
referencing new table as changed_rows for each statement execute function query_mark_dirty_from_preprocessed_data();

create trigger query_dirty_trigger_ins after insert on external_metadata
referencing new table as changed_rows for each statement execute function query_mark_dirty_by_accession();
create trigger query_dirty_trigger_upd after update on external_metadata
referencing new table as changed_rows for each statement execute function query_mark_dirty_by_accession();
create trigger query_dirty_trigger_del after delete on external_metadata
referencing old table as changed_rows for each statement execute function query_mark_dirty_by_accession();

create trigger query_dirty_trigger_ins after insert on data_use_terms_table
referencing new table as changed_rows for each statement execute function query_mark_dirty_by_accession();
create trigger query_dirty_trigger_upd after update on data_use_terms_table
referencing new table as changed_rows for each statement execute function query_mark_dirty_by_accession();

create or replace function query_mark_dirty_from_groups()
returns trigger as $$
begin
    insert into query_dirty_accessions (organism, accession)
    select distinct se.organism, se.accession
    from changed_rows cr
    join sequence_entries se on se.group_id = cr.group_id
    where se.released_at is not null
    on conflict do nothing;
    return null;
end;
$$ language plpgsql;

create trigger query_dirty_trigger_upd after update on groups_table
referencing new table as changed_rows for each statement execute function query_mark_dirty_from_groups();

-- a new processing pipeline version changes every entry of the organism
create or replace function query_mark_rebuild_from_pipeline()
returns trigger as $$
begin
    update query_engine_state s set needs_full_rebuild = true
    from changed_rows cr
    where s.organism = cr.organism;
    return null;
end;
$$ language plpgsql;

create trigger query_rebuild_trigger_ins after insert on current_processing_pipeline
referencing new table as changed_rows for each statement execute function query_mark_rebuild_from_pipeline();
create trigger query_rebuild_trigger_upd after update on current_processing_pipeline
referencing new table as changed_rows for each statement execute function query_mark_rebuild_from_pipeline();
