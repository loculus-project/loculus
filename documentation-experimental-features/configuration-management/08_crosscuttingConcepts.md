# 8. Crosscutting Concepts

## Versioning and snapshots

- Each scope (the instance, each organism) has its own monotonic integer version counter starting at 1. No content hashes.
- Every publish writes a new immutable row in `config_*_versions`. A version is never modified once written.
- A snapshot **inlines everything it needs** at publish time (reference genomes, and the lineage-definition URLs the adapter resolves), so the version a pod fetched is the version it runs, with no further lookups.
- Versions are kept long enough to cover rollouts and short-window rollback. There is **no commitment that old versions stay valid forever** — future config-structure evolution may make very old versions unreadable, and that is acceptable. Garbage collection of unreferenced versions is allowed but not yet implemented.

## Drafts and optimistic concurrency

- One draft per scope (a singleton row for the instance, one row per organism). The draft `config` column is the **materialized** current draft state.
- Each draft has a `revision` counter, bumped on every mutation. Mutating endpoints accept `If-Match: <revision>`; a mismatch returns `409` with the current state.
- For a released organism the draft is **lazily created** from the current published config on the first edit; `base_version` records the predecessor.
- Drafts are deleted on publish or explicit discard. There is no per-operation undo — discard is the only revert.

## Editing model

Two API paths, gated by status:

- **Unreleased organism** → `PUT /draft` replaces the whole document. No safety checks against existing data, because nothing has been released.
- **Released organism** → `POST /draft/operations` appends named operations from the registry.

The **instance config** always has a published version (a Flyway migration seeds v1 with defaults — name `"Loculus"`, `accessionPrefix "LOC_"`, dataUseTerms/fileSharing disabled), so it is "released" from the moment the DB exists. It supports both a `setInstanceBranding` operation and a full-document `PUT /draft`; the admin panel uses typed forms that build the whole document and PUT it, keeping a raw-JSON editor as an advanced escape hatch. There is no `mode` column anywhere — status-gating happens at the API layer (`403` for the wrong path).

## Operation registry

- One in-code map `opType → handler`, owned entirely by the backend (Kotlin). Each handler is a typed component with a payload data class, a pure-function validator (preconditions against the current draft), a pure-function applier (produces the next draft), and a human-readable summary used in the pending-ops/audit views.
- Handlers are auto-discovered at startup via Spring component scanning. Adding an operation is one new handler file — no DB migration, no API version bump.
- **The registry IS the safety policy.** If there is no handler, an admin cannot do it. Operations are classified by rollout impact:
  - **T1 — cosmetic / no-rollout**: display labels, descriptions, branding, link-out text, field ordering. No effect on backend validation or SILO/LAPIS schema.
  - **T2 — non-breaking schema**: needs a config publish + SILO/LAPIS rollout but must not break existing data, queries, or services. Adding an optional metadata field is the example. Allowed only when the validator can prove non-breakage.
  - **T3 — breaking / high-risk**: field renames/removals, type changes, required-field changes, reference-genome changes, lineage-index changes. Deliberately **not** in the registry; to be designed later with their own safety reasoning.
- The publish response tells the admin when a published change requires bumping the pinned organism version and rolling SILO/LAPIS.

## Consumer models

Different consumers reach config differently — intentionally asymmetric:

- **SILO and LAPIS pods**: pinned via env var at pod startup; the adapter init container fetches that exact version. A change applies only when the admin bumps the pin and runs `helm upgrade`. SILO and LAPIS for one organism share a single Helm value, so they roll together. This matches their fragility: they hold large indexed datasets whose schema must match their config.
- **Website**: fetches the latest published config per SSR request (no pin), behind a short (~30s) in-process cache with in-flight de-duplication. Cosmetic edits appear within the cache window without any rollout. The cache exists purely as a performance guard (an uncached version OOM-killed the pod under load); the trade-off is that publishes appear after up to ~30s rather than instantly.
- **Backend**: reads domain config from the DB through `ConfigService`, with a naive in-process cache invalidated on every publish.

The prototype assumes a **single backend replica**, so the naive cache is sufficient. Running multiple replicas later would require revisiting invalidation (short TTL, Postgres notifications, or version polling).

## Domain vs technical configuration

Only the **domain** portion of the old mixed `BackendConfig` moved to the DB. The split:

- **DB-backed domain config**: instance branding, public links, accession prefix, data-use terms, file-sharing policy, domain feature flags, organism schemas, reference genomes, lineage systems, display settings, link-outs.
- **Helm/Spring technical config**: backend/website/Keycloak/LAPIS URLs, DB/S3/SMTP credentials, image tags, ports, resource limits, compression level, pipeline polling intervals, read-only operational mode.

The backend now carries technical settings in a `@ConfigurationProperties` bean (populated from Spring/Helm) and reads all domain config through `ConfigService`. No backend business logic reads domain config from a file.

## Sensitivity and authentication

- The config model — instance and organism — stores **only non-sensitive data**: schemas, labels, public URLs, reference genomes, lineage definitions, link-outs. **Credentials, API keys, SMTP passwords, and certificates stay in Helm `values.yaml`** as Kubernetes Secrets. This invariant is what lets the read API be open and audit logs be retained freely.
- **Read API**: open, no token (website, adapter, external tools).
- **Admin API**: Keycloak `loculus_administrator` realm role; bearer token via OAuth2. This is separate from `super_user`, which remains a curation role for cross-group sequence-entry actions. The website decodes `realm_access.roles` during session establishment and gates `/admin/*` accordingly.

## Audit log

- `config_audit_log` is append-only. Every state-changing action writes a row: `organism_create`, `document_replace`, `op_append`, `publish`, `discard_draft`.
- It doubles as the source of the admin panel's **pending-operations** list: the `op_append` rows since the organism's last `publish`/`discard_draft` are exactly the draft's queued edits.

## Domain vocabulary

Config uses domain words (`lineageSearch`, `substringSearch`, `generateIndex`-intent), not tool words. Translation into SILO/LAPIS vocabulary happens in the adapter.
