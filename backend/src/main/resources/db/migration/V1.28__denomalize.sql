-- Add organism column to tables that previously derived it via joins.
ALTER TABLE sequence_entries_preprocessed_data ADD COLUMN organism TEXT;
ALTER TABLE external_metadata ADD COLUMN organism TEXT;
ALTER TABLE data_use_terms_table ADD COLUMN organism TEXT;

-- Populate organism from sequence_entries
UPDATE sequence_entries_preprocessed_data
SET organism = se.organism
FROM sequence_entries se
WHERE sequence_entries_preprocessed_data.accession = se.accession
    AND sequence_entries_preprocessed_data.version = se.version;

UPDATE external_metadata em
SET organism = se.organism
FROM sequence_entries se
WHERE em.accession = se.accession
    AND em.version = se.version;

UPDATE data_use_terms_table dut
SET organism = se.organism
FROM sequence_entries se
WHERE dut.accession = se.accession;

ALTER TABLE sequence_entries_preprocessed_data ALTER COLUMN organism SET NOT NULL;
ALTER TABLE external_metadata ALTER COLUMN organism SET NOT NULL;
ALTER TABLE data_use_terms_table ALTER COLUMN organism SET NOT NULL;
