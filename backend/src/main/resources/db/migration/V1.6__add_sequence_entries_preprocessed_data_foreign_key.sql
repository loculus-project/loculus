delete from sequence_entries_preprocessed_data sepd
where
    not exists(
        select
        from sequence_entries se
        where
            se.accession = sepd.accession
            and se.version = sepd.version
    );

alter table sequence_entries_preprocessed_data
add constraint sequence_entries_preprocessed_data_accession_version_fkey foreign key (accession, version)
    references sequence_entries on update cascade on delete cascade;
