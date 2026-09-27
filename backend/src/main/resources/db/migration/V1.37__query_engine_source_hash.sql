-- Query engine projection, follow-up to V1.36.

-- Hash of everything the sequence-derived rows (query_mutation_data, query_sequences) of an entry are computed from
-- (the stored compressed sequences + insertions + projection code version). Lets the projector skip decompression,
-- mutation extraction and rewriting of those rows when an accession is marked dirty but its sequences did not change.
alter table query_entries add column source_hash bigint;

-- timestamps in UTC like the rest of the database (now() would be rendered in the session time zone)
alter table query_changelog alter column created_at set default timezone('UTC', now());
alter table query_engine_state alter column updated_at set default timezone('UTC', now());

-- only a changed group name affects the released data (groupName); ignore other group updates
drop trigger query_dirty_trigger_upd on groups_table;
drop function query_mark_dirty_from_groups();

create function query_mark_dirty_from_group_rename()
returns trigger as $$
begin
    insert into query_dirty_accessions (organism, accession)
    select distinct se.organism, se.accession
    from sequence_entries se
    where se.group_id = new.group_id and se.released_at is not null
    on conflict do nothing;
    return null;
end;
$$ language plpgsql;

create trigger query_dirty_trigger_upd after update on groups_table
for each row when (old.group_name is distinct from new.group_name)
execute function query_mark_dirty_from_group_rename();
