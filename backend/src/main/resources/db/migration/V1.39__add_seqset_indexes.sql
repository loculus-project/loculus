-- Records of one SeqSet version; the primary key starts with seqset_record_id and cannot serve this filter.
create index seqset_to_records_seqset_idx on seqset_to_records (seqset_id, seqset_version);

-- Per-record lookup in update-seqset, and accession equality/prefix match for sequence citations.
create index seqset_records_accession_idx on seqset_records (accession text_pattern_ops, is_focal);

create index seqset_to_citation_source_seqset_idx on seqset_to_citation_source (seqset_id, seqset_version);

create index seqsets_created_by_idx on seqsets (created_by);
