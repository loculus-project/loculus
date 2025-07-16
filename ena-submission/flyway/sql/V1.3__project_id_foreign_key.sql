-- All entries without a project_id were submitted by us and thus have an ena_submission_accession
-- Projects we submitted were created based on the group_id and organism

UPDATE submission_table s
SET project_id = p.project_id
FROM project_table p
WHERE s.project_id IS NULL
  AND s.group_id = p.group_id
  AND s.organism = p.organism
  AND p.result ? 'ena_submission_accession';

-- The cast will fail if there are any project_ids that are not numeric
-- SELECT project_id FROM submission_table WHERE project_id !~ '^\d+$';

ALTER TABLE submission_table
ALTER COLUMN project_id TYPE BIGINT
USING CAST(project_id AS BIGINT);

ALTER TABLE submission_table
ADD CONSTRAINT fk_submission_project
FOREIGN KEY (project_id)
REFERENCES project_table(project_id);
