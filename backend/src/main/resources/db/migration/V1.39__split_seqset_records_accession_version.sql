-- seqset_records.accession used to hold either a bare accession ("LOC_123", meaning the latest version)
-- or an accession version ("LOC_123.2"). Split it into separate accession and version columns,
-- where a null version means "latest version".

alter table seqset_records add column version bigint;

-- Versioned values were validated with AccessionVersion.fromString on submission
-- (no '.' in the accession part, numeric version >= 1), so this split is safe.
update seqset_records
set
    version = split_part(accession, '.', 2)::bigint,
    accession = split_part(accession, '.', 1)
where accession ~ '^[^.]+\.[0-9]+$';

-- Accessions never contain '.', it is the accession/version separator. This also fails the migration
-- if any value above could not be split, and rejects writes in the old combined format, e.g. from
-- old backend pods still running during a rolling update.
alter table seqset_records
    add constraint seqset_records_accession_has_no_version
        check (position('.' in accession) = 0);

create index seqset_records_accession_idx on seqset_records (accession);
