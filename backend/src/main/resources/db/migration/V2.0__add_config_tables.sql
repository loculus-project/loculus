-- DB-backed domain config system; see config-architecture/13_databaseSchema.md.
--
-- This single migration introduces the whole config subsystem (organism +
-- instance versions, drafts, audit log, opaque preprocessing config files, and
-- the per-organism deployed flag). It is kept as one V2.0 migration on purpose:
-- the feature was developed across several files but is squashed here so the
-- config schema lands atomically rather than as an incremental V2.x history.

CREATE TABLE config_organisms (
    key                TEXT PRIMARY KEY,
    status             TEXT NOT NULL,
    current_version    BIGINT,
    created_at         TIMESTAMP NOT NULL DEFAULT now(),
    created_by         TEXT NOT NULL,
    first_published_at TIMESTAMP,
    last_published_at  TIMESTAMP,
    CHECK (status IN ('unreleased', 'released')),
    CHECK ((status = 'unreleased') = (current_version IS NULL))
);

CREATE TABLE config_instance_versions (
    version       BIGSERIAL PRIMARY KEY,
    config        JSONB NOT NULL,
    published_at  TIMESTAMP NOT NULL DEFAULT now(),
    published_by  TEXT NOT NULL
);

CREATE TABLE config_instance_state (
    singleton        BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    current_version  BIGINT REFERENCES config_instance_versions(version)
);

CREATE TABLE config_organism_versions (
    organism_key  TEXT NOT NULL REFERENCES config_organisms(key),
    version       BIGINT NOT NULL,
    config        JSONB NOT NULL,
    published_at  TIMESTAMP NOT NULL DEFAULT now(),
    published_by  TEXT NOT NULL,
    PRIMARY KEY (organism_key, version)
);

ALTER TABLE config_organisms
    ADD CONSTRAINT config_organisms_current_version_fk
    FOREIGN KEY (key, current_version)
    REFERENCES config_organism_versions(organism_key, version)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE config_instance_draft (
    singleton    BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    config       JSONB NOT NULL,
    base_version BIGINT REFERENCES config_instance_versions(version),
    revision     BIGINT NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NOT NULL DEFAULT now(),
    updated_at   TIMESTAMP NOT NULL DEFAULT now(),
    created_by   TEXT NOT NULL,
    updated_by   TEXT NOT NULL
);

CREATE TABLE config_organism_drafts (
    organism_key TEXT PRIMARY KEY REFERENCES config_organisms(key) ON DELETE CASCADE,
    config       JSONB NOT NULL,
    base_version BIGINT,
    revision     BIGINT NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NOT NULL DEFAULT now(),
    updated_at   TIMESTAMP NOT NULL DEFAULT now(),
    created_by   TEXT NOT NULL,
    updated_by   TEXT NOT NULL,
    FOREIGN KEY (organism_key, base_version)
        REFERENCES config_organism_versions(organism_key, version)
);

CREATE TABLE config_audit_log (
    id             BIGSERIAL PRIMARY KEY,
    occurred_at    TIMESTAMP NOT NULL DEFAULT now(),
    actor          TEXT NOT NULL,
    scope          TEXT NOT NULL,
    organism_key   TEXT,
    action         TEXT NOT NULL,
    details        JSONB,
    result_version BIGINT
);

CREATE INDEX ix_config_audit_log_organism_time ON config_audit_log (organism_key, occurred_at DESC);
CREATE INDEX ix_config_audit_log_actor_time    ON config_audit_log (actor, occurred_at DESC);

-- Optional, unversioned per-(organism, pipeline version) preprocessing config files.
-- The backend stores and serves these verbatim and never interprets them; they are
-- a generic, opaque text channel for external preprocessing pipelines.
-- See config-architecture/outdated-implementation-support-files/61_preprocessingPipeline.md.
CREATE TABLE config_preprocessing_files (
    organism_key     TEXT NOT NULL REFERENCES config_organisms(key) ON DELETE CASCADE,
    pipeline_version BIGINT NOT NULL,
    config_file      TEXT NOT NULL,
    updated_at       TIMESTAMP NOT NULL DEFAULT now(),
    updated_by       TEXT NOT NULL,
    PRIMARY KEY (organism_key, pipeline_version)
);

-- Per-organism deployment readiness flag. Newly created organisms set this to
-- FALSE until an administrator confirms the SILO/LAPIS deployment is ready;
-- existing released organisms are assumed already deployed.
ALTER TABLE config_organisms
    ADD COLUMN deployed BOOLEAN;

UPDATE config_organisms
    SET deployed = (status = 'released');

ALTER TABLE config_organisms
    ALTER COLUMN deployed SET NOT NULL,
    ALTER COLUMN deployed SET DEFAULT TRUE;

-- Mirror of DEFAULT_INSTANCE_CONFIG_JSON in InstanceConfig.kt; keep in sync.
INSERT INTO config_instance_versions (version, config, published_at, published_by)
VALUES (
    1,
    '{"name":"Loculus","accessionPrefix":"LOC_","dataUseTerms":{"enabled":false,"urls":null},"fileSharing":{"outputFileUrlType":"website"},"description":null,"logo":null,"supportContact":null,"bannerMessage":null,"bannerMessageURL":null,"submissionBannerMessage":null,"submissionBannerMessageURL":null,"welcomeMessageHTML":null,"additionalHeadHTML":null,"gitHubEditLink":null,"gitHubMainUrl":null,"gitHubIssuesUrl":null,"issuesEmail":null,"enableSeqSets":false,"seqSetsFieldsToDisplay":null,"seqSetsGraphs":null,"enableLoginNavigationItem":true,"enableSubmissionNavigationItem":true,"enableSubmissionPages":true,"dataUseTermsAgreementHTML":null,"sequenceFlagging":null,"dateFieldForGroupGraph":null,"lineageSystemDefinitions":null}'::jsonb,
    now(),
    'system'
);

INSERT INTO config_instance_state (singleton, current_version) VALUES (TRUE, 1);
