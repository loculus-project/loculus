create table sequences (
                           sequence_id bigserial primary key,
                           custom_id text not null,
                           submitter text not null,
                           submitted_at timestamp not null,
                           started_processing_at timestamp,
                           finished_processing_at timestamp,
                           status text not null,
                           original_data jsonb not null,
                           processed_data jsonb,
                           errors jsonb,
                           warnings jsonb
);

create index on sequences (submitter);
create index on sequences (status);
