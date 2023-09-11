create table sequences (
       sequence_id bigserial,
       version bigint not null default 1,
       custom_id text not null,
       submitter text not null,
       submitted_at timestamp not null,
       started_processing_at timestamp,
       finished_processing_at timestamp,
       status text not null,
       revoked boolean not null default false,
       original_data jsonb,
       processed_data jsonb,
       errors jsonb,
       warnings jsonb,
       primary key (sequence_id, version)
);

create index on sequences (submitter);
create index on sequences (status);
