create table seqset_citing_source (
    source_doi         text not null,
    origin             text not null check (origin in ('CROSSREF', 'CURATED')),
    title              text not null,
    year               varchar(10) not null,
    contributors       jsonb not null,

    primary key (source_doi)
);

create table seqset_to_citing_source (
    source_doi         text not null,
    seqset_id          text not null,
    seqset_version     bigint not null,

    primary key (source_doi, seqset_id, seqset_version),
    constraint foreign_key_citing_source
        foreign key (source_doi)
            references seqset_citing_source(source_doi)
            on delete cascade,
    constraint foreign_key_seqset
        foreign key (seqset_id, seqset_version)
            references seqsets(seqset_id, seqset_version)
            on delete cascade
);
