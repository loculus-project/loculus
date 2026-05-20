create table seqset_citing_source (
    citing_source_id   bigserial,
    source_doi         text not null unique,
    origin             text not null check (origin in ('CROSSREF', 'CURATED')),
    title              text not null,
    year               integer not null,
    contributors       jsonb not null,

    primary key (citing_source_id)
);

create table seqset_to_citing_source (
    citing_source_id   bigint not null,
    seqset_id          text not null,
    seqset_version     bigint not null,

    primary key (citing_source_id, seqset_id, seqset_version),
    constraint foreign_key_citing_source
        foreign key (citing_source_id)
            references seqset_citing_source(citing_source_id)
            on delete cascade,
    constraint foreign_key_seqset
        foreign key (seqset_id, seqset_version)
            references seqsets(seqset_id, seqset_version)
            on delete cascade
);
