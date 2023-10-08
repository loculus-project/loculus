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

-- CitationController

create table bibliography_sets (
       bibliography_set_id uuid not null,
       bibliography_set_version int8,
       name text not null,
       description text,

       created_at timestamp not null,
       created_by text not null,

       primary key (bibliography_set_id, bibliography_set_version)
);

create table bibliography_records (
       bibliography_record_id int8,
       accession text not null,
       type text not null,

       primary key (bibliography_record_id)
);

create table bibliography_records_to_sets (
       bibliography_record_id uuid not null,
       bibliography_set_id text not null,
       bibliography_set_version int8 not null,

       primary key (bibliography_record_id, bibliography_set_id, bibliography_set_version),
       constraint foreign_key_bibliography_record_id
              foreign key(bibliography_record_id)
                     references bibliography_records(bibliography_record_id)
                     on delete no action,
       constraint foreign_key_bibliography_set_id
              foreign key(bibliography_set_id)
                     references bibliography_sets(bibliography_set_id)
                     on delete no action
);

create table citations (
       citation_id bigserial,
       name text not null,
       description text,
       type text not null,

       created_at timestamp not null,
       created_by text not null,
       updated_at timestamp not null,
       updated_by text not null,

       primary key (citation_id)
);

create table bibliography_sets_citations (
       bibliography_set_id int8,
       bibliography_set_version int8,
       citation_id int8,

       primary key (bibliography_set_id, citation_id),
       constraint foreign_key_bibliography_set_id
              foreign key(bibliography_set_id)
                     references bibliography_sets(bibliography_set_id)
                     on delete no action,
       constraint foreign_key_citation_id
              foreign key(citation_id)
                     references citations(citation_id)
                     on delete no action
);

create table authors (
       author_id bigserial,
       affiliation text not null,
       email text not null,
       name text not null,

       created_at timestamp not null,
       created_by text not null,
       updated_at timestamp not null,
       updated_by text not null,

       primary key (author_id)
);

create table authors_bibliography_sets (
       author_id int8,
       bibliography_set_id int8,
       bibliography_set_version int8,

       primary key (author_id, bibliography_set_id),
       constraint foreign_key_author_id
              foreign key(author_id)
                     references authors(author_id)
                     on delete no action,
       constraint foreign_key_bibliography_set_id
              foreign key(bibliography_set_id)
                     references bibliography_sets(bibliography_set_id)
                     on delete no action
);