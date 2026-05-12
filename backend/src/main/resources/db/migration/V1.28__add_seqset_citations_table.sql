ALTER TABLE seqsets ADD CONSTRAINT seqsets_seqset_doi_unique UNIQUE (seqset_doi);

create table seqset_citing_source (
    source_id          text not null,
    source_type        text not null check (source_type in ('DOI', 'URL')),
    origin             text not null check (origin in ('CROSSREF', 'CURATED')),
    title              text not null,
    year               varchar(10) not null,
    contributors       jsonb not null,

    primary key (source_id)
);

create table seqset_to_citing_source (
    citing_source_id   text not null,
    seqset_id          text not null,
    seqset_version     bigint not null,

    primary key (citing_source_id, seqset_id, seqset_version),
    constraint foreign_key_citing_source_id
        foreign key (citing_source_id)
            references seqset_citing_source(source_id)
            on delete cascade,
    constraint foreign_key_seqset_id
        foreign key (seqset_id, seqset_version)
            references seqsets(seqset_id, seqset_version)
            on delete cascade
);
