
ALTER TABLE project_table DROP CONSTRAINT project_table_pkey;
ALTER TABLE project_table ADD COLUMN project_id BIGSERIAL PRIMARY KEY;

ALTER TABLE submission_table ADD project_id text;

CREATE INDEX idx_project_table_group_id ON project_table(group_id);
CREATE INDEX idx_project_table_organism ON project_table(organism);