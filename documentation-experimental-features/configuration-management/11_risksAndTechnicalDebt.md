# 11. Risks and Technical Debt

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | Schema drift between the Kotlin and Zod definitions. | Manual sync via code review; widen the backend side first. Codegen is a possible future option. |
| R2 | Two-step admin workflow (publish + deployment rollout) is friction. | The publish modal surfaces the new version, the exact `configVersion` pin, a GitOps values example, a direct Helm example, and links to administrator rollout docs. |
| R3 | Concurrent edits to the same draft. | Optimistic concurrency on `revision`; `409` returns the current state; the panel refetches and prompts a redo. |
| R4 | Admin pins a non-existent / garbage-collected version. | Adapter init fails clearly; the pod stays `Init:Error`; admin re-pins a kept version. |
| R5 | Adapter cannot reach the backend at startup. | Init container retries with backoff, then fails; the pod won't start with stale config. |
| R6 | A published snapshot has malformed lineage content. | The adapter surfaces parse errors; init fails clearly; admin pins the previous version. |
| R7 | Bad config published and rolled out before anyone notices. | Same risk class as `values.yaml` today; mitigated by re-pinning an earlier kept version. |
| R8 | A newly published organism becomes visible before its SILO/LAPIS deployments exist. | Needs a deployment-readiness gate; see [section 62](62_organismCreationDeployment.md). |
| R9 | The DB-backed schema silently drops behaviour Helm templates used to generate. | Fixtures were converted 1:1 from `values.yaml`; renderer tests cover the adapter output. A full field-level parity inventory is still worth writing (see debt). |
| R10 | The naive backend cache becomes stale with multiple backend replicas. | Prototype assumes one replica. Revisit invalidation before scaling out. |
| R11 | Website requires a reachable backend on every SSR request. | A backend outage stalls page renders; the config fetch returns `503`. Acceptable for the prototype; a stale-cache fallback can sit behind the same interface. |

## Technical debt (accepted)

- **Kotlin ↔ Zod schema duplication** — kept in sync manually, no codegen.
- **Ingest still reads organism content from `values.yaml`** — `defaultOrganismConfig` / `defaultOrganisms` remain for the ingest (and ENA-submission) pipelines, but only the schema/metadata and the reference-genome **segment names**: the reference-genome **sequences** (formerly `[[URL:…]]` placeholders) have been removed from `values.yaml`, and the backend/website ConfigMaps no longer carry any domain config — both read it from the database. Preprocessing has been fully migrated ([ADR-019/020](09_architecturalDecisions.md)): the nextclade pipeline fetches its opaque config file (and the organism metadata) from the backend, the Helm `processing_spec`/ConfigMap generation was removed, `metadata[].preprocessing` was dropped from the schema/values/fixtures, and the loader seeds the per-organism config files from `kubernetes/loculus/fixtures/preprocessing/`. An end-to-end validation of the nextclade pipeline against a live preview is still advisable.
- **Backend draft validation is structure-only.** A `PUT /draft` is validated by deserialization, not by the cross-field invariants documented in [section 14](14_configSchema.md) (`tableColumns ⊆ metadata names`, `defaultOrderBy` exists, `metadataTemplate ⊆ inputFields`, multi-field-search references, etc.). Individual operation handlers do check their own preconditions. A canonical validator that runs on every draft mutation and returns `422` is the intended fix.
- **Instance operation coverage is partial.** Only `setInstanceBranding` exists as a granular instance operation; all other instance fields go through full-document `PUT` (see [ADR-015](09_architecturalDecisions.md)). Fine functionally; granular ops + audit detail can be added later.
- **Lineage definitions flow from the DB through the adapter (resolved).** The canonical `InstanceConfig.lineageSystemDefinitions` (a `{ system: { pipelineVersion: URL } }` map) is the source of truth. The config-adapter reads it from the backend at render time, filters it to the organism's referenced systems, and writes `lineage_definitions.json` into the shared volume; the silo-importer mounts that file (`LINEAGE_DEFINITIONS_FILE`) and downloads the definitions itself at import time. The old adapter download path (`LOCULUS_LINEAGE_*` env vars, `lineage_<system>.yaml`) and the Helm `LINEAGE_DEFINITIONS` env var (sourced from `fixtures/instance.yaml`) have been removed.
- **`schema.organismName` is still required** even though `OrganismConfig.displayName` is canonical ([ADR-016](09_architecturalDecisions.md)). Dropping it needs the website transform and the SILO `instanceName` to read `displayName` directly.
- **`accessionPrefix` is immutable by registry omission**, not by schema. Review any future instance operation that could touch it.
- **No production migration tool.** The loader bootstraps from fixtures; migrating an existing `values.yaml`-driven production instance to DB-backed config still needs a separate one-time tool.
- **Admin-panel end-to-end (Playwright) coverage** is not yet authored. Component-level Vitest specs and manual click-through cover the flows for now.
- **Single-backend-replica cache assumption** and the **~30s website config cache** ([ADR-018](09_architecturalDecisions.md)) are prototype trade-offs.
