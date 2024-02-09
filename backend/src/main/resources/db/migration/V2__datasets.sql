create table datasets (
       dataset_id uuid not null,
       dataset_version int8 not null,
       name text not null,
       description text,
       dataset_doi text,
       created_at timestamp not null,
       created_by text not null,

       primary key (dataset_id, dataset_version)
);

create table dataset_records (
       dataset_record_id bigserial,
       accession text not null,
       type text not null,

       primary key (dataset_record_id)
);

create table dataset_to_records (
       dataset_record_id bigserial not null,
       dataset_id uuid not null,
       dataset_version int8 not null,

       primary key (dataset_record_id, dataset_id, dataset_version),
       constraint foreign_key_dataset_record_id
              foreign key(dataset_record_id)
                     references dataset_records(dataset_record_id)
                     on delete cascade,
       constraint foreign_key_dataset_id
              foreign key(dataset_id, dataset_version)
                     references datasets(dataset_id, dataset_version)
                     on delete cascade
);


create table authors (
       author_id uuid not null,
       name text not null,
       affiliation text not null,
       email text not null,
       username text,
       email_verified boolean not null default false,
       is_public boolean not null default false,
       created_at timestamp not null,
       created_by text not null,
       updated_at timestamp not null,
       updated_by text,

       primary key (author_id)
);
