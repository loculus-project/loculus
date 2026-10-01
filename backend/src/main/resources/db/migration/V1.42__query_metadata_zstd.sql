-- Query engine: metadata records stored as zstd frames with a trained dictionary (~150-250 bytes per SARS-CoV-2
-- entry instead of ~1.8-4 kB of jsonb). See backend/src/main/kotlin/org/loculus/backend/query/store/StoredMetadata.kt.
--
-- The projector rewrites every row on its next full rebuild (the metadata part of the projection encoding changes):
-- it sets metadata_zstd and metadata_dict_id and clears metadata. Until then rows keep their jsonb, and readers
-- accept both forms, so the change is additive and backends running older code keep working.

alter table query_entries alter column metadata drop not null;
-- the frame of the record's JSON text, compressed with compression_dictionaries row metadata_dict_id (null: none)
alter table query_entries add column metadata_zstd bytea;
alter table query_entries add column metadata_dict_id integer;
-- frames are already compressed: no TOAST compression attempts
alter table query_entries alter column metadata_zstd set storage external;
-- dataUseTerms = RESTRICTED: the daily check for lapsed restrictions needs it without reading the records
alter table query_entries add column data_use_terms_restricted boolean not null default false;
create index query_entries_restricted_idx on query_entries (organism) where data_use_terms_restricted;

-- the dictionary new rows of the organism are compressed with (null: none yet), and next_id when it was trained (the
-- projector retrains once the organism has grown by half)
alter table query_engine_state add column metadata_dict_id integer;
alter table query_engine_state add column metadata_dict_entries integer;
