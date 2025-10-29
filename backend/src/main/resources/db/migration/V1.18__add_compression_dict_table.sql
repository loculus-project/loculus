create table compression_dictionaries
(
    id            INTEGER generated always as identity primary key,
    hash          CHAR(64) not null unique,
    dict_contents BYTEA not null,
    created_at    TIMESTAMPTZ not null default now()
);
