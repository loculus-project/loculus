DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM sequence_upload_aux_table
    ) THEN
        RAISE EXCEPTION
            'Cannot alter sequence_upload_aux_table: table is not empty. Wait for submissions to finish processing before running this migration.';
    END IF;
END $$;

ALTER TABLE metadata_upload_aux_table
  ADD COLUMN fasta_ids jsonb DEFAULT '[]'::jsonb;

ALTER TABLE sequence_upload_aux_table
  DROP CONSTRAINT sequence_upload_aux_table_pkey,
  DROP COLUMN submission_id,
  ADD COLUMN fasta_id text NOT NULL,
  DROP COLUMN segment_name,
  ADD CONSTRAINT sequence_upload_aux_table_pkey PRIMARY KEY (upload_id, fasta_id);

CREATE INDEX ON metadata_upload_aux_table
  USING GIN (fasta_ids jsonb_path_ops);