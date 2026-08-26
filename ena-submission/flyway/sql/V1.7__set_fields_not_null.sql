UPDATE submission_table SET unaligned_nucleotide_sequences = '{}'::jsonb WHERE unaligned_nucleotide_sequences IS NULL;
UPDATE submission_table SET metadata = '{}'::jsonb WHERE metadata IS NULL;

ALTER TABLE submission_table ALTER COLUMN unaligned_nucleotide_sequences SET NOT NULL;
ALTER TABLE submission_table ALTER COLUMN metadata SET NOT NULL;