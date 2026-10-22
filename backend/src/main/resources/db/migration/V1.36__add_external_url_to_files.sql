ALTER TABLE files ADD COLUMN external_url text;

CREATE UNIQUE INDEX files_group_id_external_url_idx ON files (group_id, external_url)
    WHERE external_url IS NOT NULL;
