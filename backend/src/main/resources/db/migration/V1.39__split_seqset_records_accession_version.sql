-- Two changes to seqset_records:
--
-- 1. accession used to hold either a bare accession ("LOC_123", meaning the latest version)
--    or an accession version ("LOC_123.2"). Split it into separate accession and version columns,
--    where a null version means "latest version".
--
-- 2. Records used to be linked to seqset versions via seqset_to_records, and updateSeqSet reused
--    existing record rows (createSeqSet did not). Sharing rows bought nothing and caused bugs, so each
--    seqset version now owns its records directly via seqset_id/seqset_version, and seqset_to_records
--    is dropped.
--
-- Rolling update safety: backend pods still running the old code will fail loudly against this schema
-- instead of silently writing or reading wrong data: their reads join seqset_to_records (dropped) and
-- their inserts into seqset_records omit the now NOT NULL seqset_id/seqset_version columns.

alter table seqset_records
    add column version bigint,
    add column seqset_id text,
    add column seqset_version bigint;

-- Versioned values were validated with AccessionVersion.fromString on submission
-- (no '.' in the accession part, numeric version >= 1), so this split is safe.
update seqset_records
set
    version = split_part(accession, '.', 2)::bigint,
    accession = split_part(accession, '.', 1)
where accession ~ '^[^.]+\.[0-9]+$';

-- One record row per (seqset version, record). Rows previously shared between seqset versions are duplicated.
insert into seqset_records (accession, version, type, is_focal, seqset_id, seqset_version)
select r.accession, r.version, r.type, r.is_focal, str.seqset_id, str.seqset_version
from seqset_to_records str
join seqset_records r on r.seqset_record_id = str.seqset_record_id;

-- Removes the old shared rows, as well as rows orphaned by seqset deletions (which never cascaded to seqset_records).
delete from seqset_records where seqset_id is null;

drop table seqset_to_records;

alter table seqset_records
    alter column seqset_id set not null,
    alter column seqset_version set not null,
    add constraint seqset_records_seqset_fkey
        foreign key (seqset_id, seqset_version)
            references seqsets (seqset_id, seqset_version)
            on delete cascade,
    -- Accessions never contain '.', it is the accession/version separator.
    -- This also fails the migration if any value above could not be split.
    add constraint seqset_records_accession_has_no_version
        check (position('.' in accession) = 0);

create index seqset_records_seqset_idx on seqset_records (seqset_id, seqset_version);
create index seqset_records_accession_idx on seqset_records (accession);
