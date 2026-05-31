# 13. Database Schema

Detail companion to [section 5](05_buildingBlockView.md) (Building Block View) and [section 8](08_crosscuttingConcepts.md) (Crosscutting Concepts). The full DDL below is implemented in a single migration, `backend/src/main/resources/db/migration/V2.0__add_config_tables.sql`, which also creates `config_preprocessing_files` and the per-organism `deployed` readiness flag.

## Overview

Eight tables, all prefixed `config_`, all in the same Postgres database as the rest of the Loculus backend. The first seven hold the versioned, draftable config documents; `config_preprocessing_files` is a separate, deliberately unversioned store of opaque pipeline config files.

| Table | Role | Cardinality |
|---|---|---|
| `config_organisms` | Organism registry + lifecycle status + pointer to current version | One per organism |
| `config_instance_versions` | Published instance-config snapshots | One per publish |
| `config_instance_state` | Pointer to the current published instance version | Singleton |
| `config_organism_versions` | Published organism-config snapshots | One per (organism, publish) |
| `config_instance_draft` | Active instance draft (if any) | 0 or 1 |
| `config_organism_drafts` | Active organism draft (per organism) | 0 or 1 per organism |
| `config_audit_log` | Permanent action history; doubles as the source for "pending ops" listings | Append-only |
| `config_preprocessing_files` | Opaque, unversioned preprocessing config files (one per organism + pipeline version) | 0..n per organism |

## DDL

```sql
-- Organism registry + lifecycle state
CREATE TABLE config_organisms (
    key                TEXT PRIMARY KEY,
    status             TEXT NOT NULL,         -- 'unreleased' | 'released'
    current_version    BIGINT,                -- FK to config_organism_versions (deferred)
    deployed           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMP NOT NULL DEFAULT now(),
    created_by         TEXT NOT NULL,
    first_published_at TIMESTAMP,
    last_published_at  TIMESTAMP,
    CHECK (status IN ('unreleased', 'released')),
    CHECK ((status = 'unreleased') = (current_version IS NULL))
);

-- Instance config: published snapshots
CREATE TABLE config_instance_versions (
    version       BIGSERIAL PRIMARY KEY,
    config        JSONB NOT NULL,
    published_at  TIMESTAMP NOT NULL DEFAULT now(),
    published_by  TEXT NOT NULL
);

-- Instance config: singleton pointer to "current"
CREATE TABLE config_instance_state (
    singleton        BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    current_version  BIGINT REFERENCES config_instance_versions(version)
);

-- Organism config: published snapshots
CREATE TABLE config_organism_versions (
    organism_key  TEXT NOT NULL REFERENCES config_organisms(key),
    version       BIGINT NOT NULL,            -- per-organism, monotonic from 1
    config        JSONB NOT NULL,             -- self-contained (includes resolved lineage defs)
    published_at  TIMESTAMP NOT NULL DEFAULT now(),
    published_by  TEXT NOT NULL,
    PRIMARY KEY (organism_key, version)
);

ALTER TABLE config_organisms
    ADD CONSTRAINT config_organisms_current_version_fk
    FOREIGN KEY (key, current_version)
    REFERENCES config_organism_versions(organism_key, version)
    DEFERRABLE INITIALLY DEFERRED;

-- Instance config: optional active draft (singleton)
CREATE TABLE config_instance_draft (
    singleton    BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    config       JSONB NOT NULL,              -- materialized current draft state
    base_version BIGINT REFERENCES config_instance_versions(version),
    revision     BIGINT NOT NULL DEFAULT 0,   -- optimistic-CC token
    created_at   TIMESTAMP NOT NULL DEFAULT now(),
    updated_at   TIMESTAMP NOT NULL DEFAULT now(),
    created_by   TEXT NOT NULL,
    updated_by   TEXT NOT NULL
);

-- Organism config: optional active draft (one per organism)
CREATE TABLE config_organism_drafts (
    organism_key TEXT PRIMARY KEY REFERENCES config_organisms(key) ON DELETE CASCADE,
    config       JSONB NOT NULL,              -- materialized current draft state
    base_version BIGINT,                       -- null when organism has no published version
    revision     BIGINT NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NOT NULL DEFAULT now(),
    updated_at   TIMESTAMP NOT NULL DEFAULT now(),
    created_by   TEXT NOT NULL,
    updated_by   TEXT NOT NULL,
    FOREIGN KEY (organism_key, base_version)
        REFERENCES config_organism_versions(organism_key, version)
);

-- Permanent audit trail of every config-changing action.
-- Also the source for "pending operations" listings (audit entries since
-- the organism's last publish are the contents of the current draft).
CREATE TABLE config_audit_log (
    id             BIGSERIAL PRIMARY KEY,
    occurred_at    TIMESTAMP NOT NULL DEFAULT now(),
    actor          TEXT NOT NULL,
    scope          TEXT NOT NULL,             -- 'instance' | 'organism'
    organism_key   TEXT,                       -- null for instance scope
    action         TEXT NOT NULL,
        -- 'organism_create' | 'document_replace' | 'op_append'
        -- | 'publish' | 'mark_deployed' | 'discard_draft'
    details        JSONB,                      -- op type + payload for op_append; diff summary for publish
    result_version BIGINT
);

CREATE INDEX ix_config_audit_log_organism_time ON config_audit_log (organism_key, occurred_at DESC);
CREATE INDEX ix_config_audit_log_actor_time    ON config_audit_log (actor, occurred_at DESC);

-- Opaque, unversioned preprocessing config files. One row per
-- (organism, pipeline version); stored and served verbatim, never interpreted.
CREATE TABLE config_preprocessing_files (
    organism_key     TEXT NOT NULL REFERENCES config_organisms(key) ON DELETE CASCADE,
    pipeline_version BIGINT NOT NULL,
    config_file      TEXT NOT NULL,
    updated_at       TIMESTAMP NOT NULL DEFAULT now(),
    updated_by       TEXT NOT NULL,
    PRIMARY KEY (organism_key, pipeline_version)
);
```

`config_preprocessing_files` is intentionally outside the version/draft/publish machinery: admins edit these files directly (a `PUT` replaces the current value, a `DELETE` removes it) and the current value is what the public endpoint serves. This keeps pipeline-specific configuration — which the core neither understands nor needs — decoupled from the versioned organism config that SILO/LAPIS pin. See [section 14](14_configSchema.md) for the endpoints and [ADR-020](09_architecturalDecisions.md) for the rationale.

## Key invariants

- **Versions are per-scope and monotonic.** Each organism has its own counter; the instance has its own.
- **Versions are immutable while kept** — never modified after creation. Old versions may be garbage-collected once no pod pins them; the concrete retention policy is an implementation detail.
- **A `released` organism always has `current_version IS NOT NULL`** and vice versa (CHECK constraint).
- **`deployed` is a public-readiness gate, not a config lifecycle state.** Existing rows default to `TRUE` during migration so current organisms remain visible; newly created organisms explicitly set it to `FALSE` until an administrator confirms SILO/LAPIS are deployed.
- **Drafts are materialized.** `config_organism_drafts.config` always reflects the current draft state. Each mutation updates the materialized state in place and writes an audit row.
- **Snapshots are self-contained.** No FK between `config_organism_versions` and `config_instance_versions`. Lineage definitions referenced by an organism are inlined at publish time.
- **Unreleased organism drafts have `base_version IS NULL`.** Released organism drafts have `base_version` pointing at the predecessor.
- **Only the current draft is kept.** Drafts disappear on publish/discard. The audit log preserves history.
- **Deferrable FK between organisms and organism_config_versions** lets us insert both rows in a single transaction during initial publish.

## Row-flow scenarios

### New organism → first publish

1. `INSERT INTO config_organisms (key, status='unreleased', current_version=NULL, deployed=FALSE, …)`. Audit row `organism_create`.
2. First `PUT /draft`: `INSERT INTO config_organism_drafts (organism_key, config=…, base_version=NULL)`. Audit row `document_replace`.
3. Subsequent `PUT /draft` calls: `UPDATE config_organism_drafts SET config=…, revision=revision+1`. Audit row `document_replace`.
4. On publish (single transaction, deferred FK):
   - `INSERT INTO config_organism_versions (organism_key, version=1, config)`.
   - `UPDATE config_organisms SET status='released', current_version=1, first_published_at=…, last_published_at=…` while leaving `deployed=FALSE`.
   - `DELETE FROM config_organism_drafts WHERE organism_key=…`.
   - Audit row `publish` with `result_version=1`.
5. After SILO/LAPIS are deployed and healthy, `POST /api/admin/config/organisms/{key}/mark-deployed` sets `deployed=TRUE` and writes audit row `mark_deployed`. Only then does `GET /api/config/organisms` include the new organism.

### Edit released organism → publish

1. First op append: lazily create `config_organism_drafts` row with `config = (copy of current published config)`, `base_version = current_version`.
2. Apply op to draft `config` (UPDATE in place); bump `revision`. Audit row `op_append`.
3. Publish (single transaction):
   - `INSERT INTO config_organism_versions` with `version = previous + 1`.
   - `UPDATE config_organisms SET current_version=N, last_published_at=…`.
   - `DELETE FROM config_organism_drafts`.
   - Audit row `publish`.

### Discard draft

`DELETE FROM config_organism_drafts WHERE organism_key=…`. Audit row `discard_draft`.

### Initial DB setup

The `V2.0` migration that creates the tables also inserts:
- An initial `config_instance_versions` row with `version=1` and a hardcoded default `config` JSON (`name="Loculus"`, `accessionPrefix="LOC_"`, `dataUseTerms`/`fileSharing` disabled, all optional fields null). This JSON literal mirrors `DEFAULT_INSTANCE_CONFIG_JSON` in `InstanceConfig.kt` and must be kept in sync with it.
- A `config_instance_state` row with `current_version=1`.

So the instance config is always "released" from the moment the DB exists; admins customise it via operations or a full-document PUT.

### Listing pending operations for the admin panel

`SELECT details FROM config_audit_log WHERE organism_key=$1 AND action='op_append' AND occurred_at > (SELECT COALESCE(MAX(occurred_at), 'epoch') FROM config_audit_log WHERE organism_key=$1 AND action IN ('publish','discard_draft','organism_create')) ORDER BY occurred_at;`

## Indexes

Required:
- `config_audit_log (organism_key, occurred_at DESC)` — recent history for an organism.
- `config_audit_log (actor, occurred_at DESC)` — "what has this admin done lately".

Already covered by PKs / unique constraints:
- `config_organisms.key`, `config_organism_versions (organism_key, version)`, `config_instance_versions.version`.

## Relationship to existing Loculus tables

- `sequence_entries.organism` continues to be a free-form string; it is **not** FK'd to `config_organisms.key`. Adding that FK is a separate, optional future migration.
- No other existing tables are touched.
