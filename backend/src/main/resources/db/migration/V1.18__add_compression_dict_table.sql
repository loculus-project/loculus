create table compression_dictionaries
(
    id            SERIAL primary key,
    hash          TEXT not null unique,
    dict_contents BYTEA not null
);

create index idx_dict_table_hash on compression_dictionaries (hash);
