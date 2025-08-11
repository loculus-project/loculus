alter table sequence_upload_aux_table drop CONSTRAINT sequence_upload_aux_table_pkey;

alter table sequence_upload_aux_table add column sequence_submission_id text;
alter table sequence_upload_aux_table add column metadata_submission_id text;

update sequence_upload_aux_table
set metadata_submission_id = submission_id
where metadata_submission_id is null;

update sequence_upload_aux_table
set sequence_submission_id = case
  when segment_name is NULL or segment_name = '' then submission_id
  else submission_id || '_' || segment_name
end
where sequence_submission_id is NULL;

alter table sequence_upload_aux_table drop column segment_name;
alter table sequence_upload_aux_table drop column submission_id;

alter table sequence_upload_aux_table add PRIMARY KEY (upload_id, sequence_submission_id);
