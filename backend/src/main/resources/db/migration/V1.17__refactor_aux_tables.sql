ALTER TABLE metadata_upload_aux_table
  ADD COLUMN fasta_ids jsonb DEFAULT '[]'::jsonb;

ALTER TABLE sequence_upload_aux_table
  DROP CONSTRAINT sequence_upload_aux_table_pkey,
  DROP COLUMN submission_id,
  ADD COLUMN fasta_id text NOT NULL,
  DROP COLUMN segment_name,
  ADD CONSTRAINT sequence_upload_aux_table_pkey PRIMARY KEY (upload_id, fasta_id);