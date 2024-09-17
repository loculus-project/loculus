create index on sequence_entries (organism);
create index on sequence_entries (group_id);
create index on sequence_entries (is_revocation);
create index on sequence_entries (released_at);

create index on sequence_entries_preprocessed_data (pipeline_version);
create index on sequence_entries_preprocessed_data (processing_status);
create index on sequence_entries_preprocessed_data (started_processing_at);

create index on external_metadata (accession, version, updated_metadata_at);

create index on data_use_terms_table (data_use_terms_type);
create index on data_use_terms_table (change_date);
