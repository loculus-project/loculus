UPDATE submission_table s
SET project_id = p.project_id
FROM project_table p
WHERE s.project_id IS NULL
  AND s.group_id = p.group_id
  AND s.organism = p.organism;

-- SELECT project_id FROM submission_table WHERE project_id !~ '^\d+$';

ALTER TABLE submission_table
ALTER COLUMN project_id TYPE BIGINT
USING CAST(project_id AS BIGINT);

ALTER TABLE submission_table
ADD CONSTRAINT fk_submission_project
FOREIGN KEY (project_id)
REFERENCES project_table(project_id);