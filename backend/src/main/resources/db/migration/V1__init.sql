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
create table authors (
       author_id bigserial,

       affiliation text not null,
       email text not null,
       name text not null,

       created_at timestamp not null,
       created_by text not null,
       updated_at timestamp not null,
       updated_by text not null,
       metadata jsonb,

       primary key (author_id)
);

create table bibliography_records (
       bibliography_record_id bigserial,

       accession text not null,
       license text not null,
       name text not null,
       type text not null,

       created_at timestamp not null,
       created_by text not null,
       updated_at timestamp not null,
       updated_by text not null,
       metadata jsonb,

       primary key (bibliography_record_id)
);

create table authors_bibliography_records (
       author_id int8,
       bibliography_record_id int8,

       primary key (author_id, bibliography_record_id),
       constraint foreign_key_author_id
              foreign key(author_id)
                     references authors(author_id)
                     on delete no action,
       constraint foreign_key_bibliography_record_id
              foreign key(bibliography_record_id)
                     references bibliography_records(bibliography_record_id)
                     on delete no action
);

create table bibliography_sets (
       bibliography_set_id bigserial,
       
       version bigint not null default 1,
       description text not null,
       name text not null,
       status text not null,
       type text not null,

       created_at timestamp not null,
       created_by text not null,
       updated_at timestamp not null,
       updated_by text not null,
       metadata jsonb,

       primary key (bibliography_set_id)
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

create table bibliography_records_bibliography_sets (
       bibliography_record_id int8,
       bibliography_set_id int8,
       bibliography_set_version int8,

       primary key (bibliography_record_id, bibliography_set_id, bibliography_set_version),
       constraint foreign_key_author_id
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

       data text not null,
       type text not null,

       created_at timestamp not null,
       created_by text not null,
       updated_at timestamp not null,
       updated_by text not null,
       metadata jsonb,
       
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
