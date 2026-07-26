-- sample_table and assembly_table rows share the (accession, version) of the
-- submission_table row they were derived from. Add explicit foreign keys so
-- this relationship is enforced by the DB and can be used for joins.

ALTER TABLE sample_table
ADD CONSTRAINT fk_sample_submission
FOREIGN KEY (accession, version)
REFERENCES submission_table(accession, version);

ALTER TABLE assembly_table
ADD CONSTRAINT fk_assembly_submission
FOREIGN KEY (accession, version)
REFERENCES submission_table(accession, version);
