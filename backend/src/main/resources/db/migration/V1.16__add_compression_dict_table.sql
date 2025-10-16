create table compression_dictionaries_table
(
    id            SERIAL primary key,
    hash          TEXT not null unique,
    dict_contents TEXT not null
);

create index idx_dict_table_hash on compression_dictionaries_table (hash);
