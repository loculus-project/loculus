# 9. Architectural Decisions

## ADR-001: PostgreSQL is the source of truth for domain config

**Context.** Domain config lived in `values.yaml`; changing it meant editing files and rolling Helm, even for cosmetic edits.

**Decision.** Domain config (organisms, schemas, branding, link-outs, reference genomes, lineage definitions) lives in PostgreSQL `config_*` tables. `values.yaml` keeps only infrastructure config. Technical runtime config stays in Helm/Spring (URLs, credentials, image tags, ports, limits, compression level, polling intervals, read-only mode).

**Consequences.** Edits are possible from a UI. The old mixed file-loaded `BackendConfig` is split into DB-backed domain config and a Spring `@ConfigurationProperties` technical-config bean.

## ADR-002: The backend is ignorant of Kubernetes and of LAPIS/SILO formats

**Decision.** The backend has no Kubernetes dependency and no LAPIS/SILO config code. It serves a tool-agnostic config document; consumers translate.

**Consequences.** Each consumer embeds its own translation. The system grows by adding adapters, not backend integrations. The backend stays testable as a pure HTTP service.

## ADR-003: A single per-pod config adapter

**Context.** Something must translate Loculus config into SILO/LAPIS files. Both read `database_config.yaml`; SILO additionally reads `reference_genomes.json` and the preprocessing config.

**Decision.** One image, `loculus-config-adapter`, runs as an init container in both SILO and LAPIS pods. It always renders the full file set; each pod mounts only what it needs. It is a TypeScript CLI in the shared `config-tools/` package (a port of the former Helm `_*.tpl` templates).

**Consequences.** One image to maintain. Upstream SILO/LAPIS images are unmodified. The adapter's output is identical regardless of which pod it runs in.

## ADR-004: Pinned-version model with Kubernetes rolling updates

**Context.** LAPIS and SILO do not support hot reload. Sidecar restarts, controller k8s access, and signal reloads all add coupling or fragility.

**Decision.** Each pod spec pins a config version via env var. The admin bumps the pin to apply a change; Kubernetes performs a standard rolling update. The adapter is init-only — no sidecar, no reload loop.

**Consequences.** Minimal-downtime updates via native k8s semantics. The cost is a two-step workflow (publish + `helm upgrade`). Rollback is "re-pin a previous, still-kept version".

## ADR-005: Two editing paths gated by organism status

**Decision.** `PUT /draft` replaces the whole config for **unreleased** organisms; `POST /draft/operations` appends registry operations for **released** ones. The gate is the organism's status, not a column. Wrong path → `403`.

**Consequences.** Onboarding is unrestricted; maintaining a released organism is registry-restricted. The registry stays focused on small parameterised edits.

## ADR-006: The operation registry is the safety policy

**Decision.** Admin operations on released organisms (and the instance) are an in-code registry of typed handlers, auto-discovered at startup. If an operation is not in the registry, an admin cannot perform it. The registry currently exposes cosmetic/display edits, link-out edits, and one non-breaking schema edit (add optional field). Breaking/high-risk edits are absent.

**Consequences.** Safety is a code-review concern at the registry level; the action set is enumerable; growing the surface is deliberate.

## ADR-007: Inline lineage and reference data in organism snapshots

**Decision.** Reference genomes and lineage-definition references are inlined into the organism snapshot at publish time, so a published version contains everything the adapter needs without further lookups.

**Consequences.** Snapshots grow (a few hundred KB). Adapters never resolve cross-snapshot references. This is for correctness of currently-kept versions, not a guarantee that arbitrarily old versions stay valid (see [section 8](08_crosscuttingConcepts.md)).

## ADR-008: Per-scope monotonic version numbers; no content hashes

**Decision.** Each organism and the instance has its own integer counter from 1. No content hash.

**Consequences.** Version numbers stay small and meaningful. Concurrent publishes of two organisms don't share a counter. Identical-content publishes still create distinct versions (no dedup); acceptable at expected scale.

## ADR-009: Adapter fetches once at init; no polling, no push

**Decision.** Adapters fetch once at init-container startup. Config changes propagate only through pod restarts triggered by spec changes.

**Consequences.** No sidecar. The pod spec is the single source of truth for what version a pod runs.

## ADR-010: Adapters pin only the organism config version

**Decision.** Adapters take only the organism version. Instance-level fields they need (accession prefix, common system metadata, lineage URLs) are read from the instance config at render time, not pinned.

**Consequences.** One pin per pod. Instance-config changes don't trigger rollouts for every organism's SILO/LAPIS.

## ADR-011: Config holds only non-sensitive data; the read API is open

**Decision.** The config domain is non-sensitive only. Sensitive values (SMTP/JWT/API credentials, TLS) live in Helm as Secrets. The read API needs no token.

**Consequences.** No adapter token to provision or rotate; the website fetches without auth. The schema and registry must never admit credential fields.

## ADR-012: Website fetches latest per request; SILO+LAPIS share one Helm pin

**Decision.** The website does not pin — it fetches `/api/config/...` at request time (behind a short cache, ADR-018). SILO and LAPIS for an organism share one `organisms[i].configVersion` value templated into both pod specs.

**Consequences.** Instance/cosmetic edits apply with no `helm upgrade`; organism edits stay explicit and gated. The shared pin removes a class of admin error (rolling SILO without LAPIS).

## ADR-013: LAPIS-relevant adapter outputs are `database_config.yaml` and `reference_genomes.json`

**Context.** Verified against `lapis-deployment.yaml`: the LAPIS container mounts only those two files; the SILO URL is a CLI argument; everything else is Helm-set, not domain config.

**Decision.** The adapter renders those two files for LAPIS pods; no LAPIS-specific files are needed.

## ADR-014: Canonical schemas and edge tooling live in a shared TS package

**Decision.** `config-tools/` owns the canonical Zod schemas plus the loader and adapter CLIs. The website re-exports the schemas (`website/src/types/loculusConfig.ts` is a one-line re-export); the Kotlin types in the backend are the parallel definition.

**Consequences.** One TS home for the schema; loader, adapter, and website cannot drift from each other. Kotlin ↔ Zod sync remains manual (see [section 11](11_risksAndTechnicalDebt.md)).

## ADR-015: Instance config edited via full-document PUT plus a branding operation

**Context.** Building granular operations for every instance field (banners, GitHub links, feature toggles, data-use-terms, display defaults) is a lot of surface for cosmetic, non-schema fields.

**Decision.** The instance supports a `setInstanceBranding` operation and a full-document `PUT /draft`. The admin panel holds the whole instance config in state, edits it through typed forms, and PUTs it; a raw-JSON editor is the advanced escape hatch. Granular instance operations can be added later if needed.

**Consequences.** Fast coverage of all instance fields without a handler per field. Instance edits are `document_replace`, which is acceptable because the instance has no SILO/LAPIS schema to protect.

## ADR-016: `OrganismConfig.displayName` is the canonical organism name

**Context.** The schema historically carried the organism name in three places: top-level `displayName`, an unused top-level scientific-name field, and the legacy required `schema.organismName`.

**Decision.** `OrganismConfig.displayName` is the canonical display name. The unused scientific-name field was removed. `schema.organismName` is retained as a backward-compatibility fallback (the website's transform and SILO's `instanceName` still read it) and is documented as legacy; consumers prefer `displayName` and fall back to `schema.organismName`.

**Consequences.** One source of truth going forward; a future cleanup can drop `schema.organismName` once the website transform and the SILO adapter read `displayName` directly.

## ADR-017: One loader, driving the public admin API, seeds tests and previews

**Context.** Real instances are populated by admins, but CI, preview deployments, and local dev need a deterministic, scriptable way to fill the DB.

**Decision.** A single `loculus-config-loader` reads fixture YAML and brings the backend into that state through the **public admin API** (create → PUT draft → publish). The same code path is used by the Helm seeding Job, CI, and local dev. Backend tests use a sibling `ConfigFixtures` helper that inserts the same fixture content into the `config_*` tables before each `@EndpointTest`.

**Consequences.** No test-only backdoor; every seeded run exercises the write path. The loader is a bootstrap, not a production migrator. It runs in `fresh-only` mode for Helm so a fixture change against a non-fresh DB fails loudly instead of publishing surprise versions.

## ADR-018: Short in-process cache on the website's config fetch

**Context.** Fetching every organism's config on every SSR request (no cache) OOM-killed the website pod under load.

**Decision.** The website caches the assembled config for ~30s with in-flight de-duplication, keyed per process.

**Consequences.** A publish appears on the website after up to ~30s rather than instantly — an acceptable trade-off for the prototype, and consistent with the "cosmetic edits within seconds" intent. A finer-grained invalidation (content-hash `If-None-Match`, push, or per-page cache) can replace it later behind the same interface.

## ADR-019: Preprocessing pipelines are external; pipeline config leaves the core

**Context.** Preprocessing pipelines are customizable — the in-repo `dummy` and `nextclade` pipelines are just *our* pipelines; other instances run entirely different ones. Yet pipeline knowledge had leaked into core: `metadata[].preprocessing` directives lived in the canonical schema, and `config-tools` rendered a Loculus-pipeline config file (`pipeline_preprocessing_config.yaml`). The backend must also remain ignorant of Kubernetes ([ADR-002](#adr-002-the-backend-is-ignorant-of-kubernetes-and-of-lapissilo-formats)) and so manages no pipeline pods.

**Decision.** Core (backend, config DB, `config-tools`) is pipeline-agnostic. `metadata[].preprocessing` was removed from the canonical Zod + Kotlin schemas, `values.yaml`, `values.schema.json`, and the fixtures. `config-tools` no longer renders any Loculus-pipeline file (the per-field renderer was deleted; the adapter still renders SILO's own `preprocessing_config.yaml`, which is SILO infrastructure). A preprocessing pipeline fetches the generic domain config (metadata, reference genomes) from the public API and derives its own processing spec; its deployment (image, version, args, replicas) stays in Helm, and the chart passes `--organism` so the pipeline knows what to fetch.

**Consequences.** Pipeline-specific logic lives with the pipeline. The backend never interprets processing directives and never deploys a pipeline. Ingest still reads some organism fields from `values.yaml` (accepted debt — [section 11](11_risksAndTechnicalDebt.md)).

## ADR-020: Opaque, unversioned per-organism preprocessing config files

**Context.** A pipeline often needs per-organism configuration (e.g. nextclade datasets) that an admin should be able to edit without redeploying — but that the core should neither understand nor validate.

**Decision.** Loculus optionally stores one **opaque text** config file per `(organism, pipeline version)` in a dedicated, **unversioned** table (`config_preprocessing_files`, [section 13](13_databaseSchema.md)), separate from the versioned config documents. It is served raw from a dedicated public endpoint (`GET /api/config/organisms/{key}/preprocessing/{version}`) and written via admin `PUT`/`DELETE` (direct save — no draft/publish). The backend stores and serves it verbatim and never parses it. Using it is entirely optional.

**Consequences.** A pipeline can fetch its config from the backend if it wants, while the core stays pipeline-agnostic; storing a config file is *not* the same as running a pipeline (the admin still deploys one). No secrets may go in it (the endpoint is open — [ADR-011](#adr-011-config-holds-only-non-sensitive-data-the-read-api-is-open)). Being unversioned, it is decoupled from the SILO/LAPIS config-version rollout.

