# 5. Building Block View

## Level 1 — system overview

```
┌──────────────────────────────────────────────────────────────┐
│                       Loculus system                          │
│                                                               │
│   ┌────────────┐    ┌────────────┐    ┌──────────────────┐    │
│   │  Website   │    │  Backend   │    │  Postgres        │    │
│   │  + Admin   │────│            │────│  (config_*)      │    │
│   │  panel     │    │            │    │                  │    │
│   └────────────┘    └─────┬──────┘    └──────────────────┘    │
│                           │                                   │
│                           │ HTTP                              │
│                           ▼                                   │
│              ┌──────────────────────────┐                     │
│              │ Per-organism pod          │                    │
│              │  ├ loculus-config-adapter │ (init container)   │
│              │  ├ SILO                   │                    │
│              │  ├ LAPIS                  │                    │
│              │  └ silo-importer          │                    │
│              └──────────────────────────┘                     │
└──────────────────────────────────────────────────────────────┘
```

## Components

| Component | Where | Responsibility |
|---|---|---|
| **Backend config module** | `backend/.../config/` (Kotlin) | Stores/serves config; owns the operation registry; the only writer of the `config_*` tables. |
| **Admin panel** | `website/src/pages/admin/config/`, `website/src/components/admin/` | Keycloak-gated UI for instance + organism config editing, drafts, publish, history, audit. |
| **Website config access** | `website/src/middleware/configMiddleware.ts`, `services/configTransform.ts` | Fetches published config per request and derives the website's view model. |
| **`config-tools/`** | top-level TS package | Canonical Zod schemas (re-exported by the website) + two CLIs: the **loader** and the **adapter**. |
| **loculus-config-loader** | `config-tools/src/loader/` | Reads fixture YAML and brings the backend into that state via the admin API. Used by CI, previews, local dev. |
| **loculus-config-adapter** | `config-tools/src/adapter/` | Per-pod init container; fetches one pinned organism version and renders SILO + LAPIS files (it does not render any Loculus preprocessing-pipeline config). |

## Level 2 — backend config module

```
┌────────────────────────────────────────────────────────────────────┐
│                       Loculus backend                                │
│  ┌──────────────┐  ┌──────────────────┐                              │
│  │ Public read  │  │ Admin write API  │  (Keycloak loculus-admin.)   │
│  │ API          │  │ /api/admin/      │                              │
│  │ /api/config/ │  │ config/...       │                              │
│  └──────┬───────┘  └─────┬────────────┘                              │
│         ▼                ▼                                           │
│  ┌────────────────────┐  ┌──────────────────────────┐                │
│  │ ConfigService      │  │ DraftService             │                │
│  │  read versions,    │  │  draft CRUD, publish,    │                │
│  │  cache (invalidated│  │  optimistic concurrency  │                │
│  │  on publish)       │  └────────────┬─────────────┘                │
│  └─────────┬──────────┘               │                              │
│            │             ┌────────────▼─────────────┐                │
│            │             │ OperationRegistry +      │                │
│            │             │ OperationDispatcher      │                │
│            │             │  (typed handlers)        │                │
│            │             └────────────┬─────────────┘                │
│            │       ┌──────────────────┘                              │
│            │       │   AuditLogService (append-only; source of       │
│            │       │   the "pending ops" list)                       │
│            ▼       ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Postgres config_* tables (see section 13)                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

| Service | Responsibility |
|---|---|
| `ConfigService` | Read published instance/organism config and version lists; naive in-process cache invalidated on publish. |
| `DraftService` | Draft CRUD and publish for both scopes; lazy-creates a draft from the current published config on first edit; `revision`-based optimistic concurrency. |
| `OrganismAdminService` | Creates an organism row + its `current_processing_pipeline` row in one transaction. |
| `AuditLogService` | Appends audit rows; computes the pending-operations list from entries since the last publish/discard. |
| `OperationRegistry` / `OperationDispatcher` | Maps `opType → handler`; handlers are auto-discovered Spring components. |

### Operation registry (implemented handlers)

The registry IS the safety policy: if there is no handler, an admin cannot perform the edit. Currently implemented (all classified safe — see [section 8](08_crosscuttingConcepts.md) for the T1/T2/T3 model):

| `opType` | Scope | Effect |
|---|---|---|
| `setInstanceBranding` | instance | name / description / logo / supportContact |
| `setOrganismDisplay` | organism | displayName / description / image |
| `setMetadataFieldDisplay` | organism | displayName / header / description / hidden / customDisplay on an existing field |
| `reorderMetadataFields` | organism | set field display order |
| `addLinkOut` / `updateLinkOut` / `removeLinkOut` | organism | manage `schema.linkOuts` (keyed by `name`) |
| `addOptionalMetadataField` | organism (T2) | append a `required: false` metadata field |

Instance fields not covered by `setInstanceBranding` (banners, GitHub links, feature toggles, data-use-terms, display defaults) are edited by replacing the whole instance draft via `PUT /api/admin/config/instance/draft`; the admin panel builds that document from typed forms. Adding a granular operation later is one new handler file.

## Level 2 — config adapter

```
loculus-config-adapter  (TypeScript CLI, init container in SILO and LAPIS pods)
  1. Read env: LOCULUS_BACKEND_URL, LOCULUS_ORGANISM_KEY, LOCULUS_ORGANISM_CONFIG_VERSION
  2. GET /api/config/organisms/{key}?version={v}   (and the instance config for common metadata)
  3. Render files into the shared output dir (atomic stage + rename)
  4. Exit 0; the main container starts and reads the files
```

One image, one-shot, no sidecar, no watch loop, no auth token. It renders the full file set; each pod mounts only what it consumes:

| File | Consumed by |
|---|---|
| `database_config.yaml` | SILO, LAPIS, silo-importer |
| `reference_genomes.json` | SILO, LAPIS, silo-importer |
| `preprocessing_config.yaml` (SILO's own input/lineage config — not the Loculus pipeline's) | silo-importer |
| `lineage_definitions.json` (the `lineageSystemDefinitions` URL map from the DB instance config, filtered to this organism's systems) | silo-importer — it downloads each `<system>.yaml` itself at import time and writes them where SILO reads them via `preprocessing_config.yaml` |

The adapter does **not** render any config for the Loculus *preprocessing* pipeline — that pipeline is external and fetches what it needs from the backend itself ([ADR-019/020](09_architecturalDecisions.md)).

Adapters pin only the **organism** config version. Anything instance-level they need (e.g. `accessionPrefix`, the common system metadata, lineage definition URLs) is read from the instance config at render time; common metadata is composed onto the organism's fields in the same way the website does.
