ALTER TABLE seqsets ADD CONSTRAINT seqsets_seqset_doi_unique UNIQUE (seqset_doi);

CREATE TABLE seqset_citations (
    seqset_doi    VARCHAR(255) NOT NULL REFERENCES seqsets(seqset_doi) ON DELETE CASCADE,
    citation_doi  VARCHAR(255) NOT NULL,
    title         TEXT         NOT NULL DEFAULT '',
    year          VARCHAR(10)  NOT NULL DEFAULT '',
    contributors  JSONB        NOT NULL DEFAULT '[]',
    last_fetched  TIMESTAMP    NOT NULL,
    PRIMARY KEY (seqset_doi, citation_doi)
);
