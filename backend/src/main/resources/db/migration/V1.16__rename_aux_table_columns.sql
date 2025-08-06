alter table sequence_upload_aux_table drop CONSTRAINT sequence_upload_aux_table_pkey;

alter table sequence_upload_aux_table drop column segment_name;
alter table sequence_upload_aux_table add column metadata_submission_id text;

alter table sequence_upload_aux_table add PRIMARY KEY (upload_id, submission_id);
