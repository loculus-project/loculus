create table sequences (
    sequence_id bigserial primary key,
    submitter text not null,
    submitted_at timestamp not null,
    started_processing_at timestamp,
    status text not null,
    original_data jsonb not null
);

create index on sequences (submitter);
create index on sequences (status);
