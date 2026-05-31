# 7. Deployment View

## Cluster layout

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Kubernetes namespace                            │
│                                                                       │
│  ┌─────────────┐  ┌────────────┐  ┌─────────────┐  ┌────────────┐     │
│  │  Backend    │  │  Website   │  │  Keycloak   │  │ PostgreSQL │     │
│  │  Deployment │  │ Deployment │  │  Deployment │  │ StatefulSet│     │
│  └──────┬──────┘  └─────┬──────┘  └─────────────┘  └──────┬─────┘     │
│         └───────────────┴──── connect ─────────────────────┘          │
│                                                                       │
│  Per organism:                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Organism SILO pod   (one Deployment per organism)            │    │
│  │  initContainer: loculus-config-adapter                       │    │
│  │  containers:    SILO, silo-importer                          │    │
│  │  volume:        emptyDir (shared, rendered config)           │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Organism LAPIS pod  (one Deployment per organism)            │    │
│  │  initContainer: loculus-config-adapter                       │    │
│  │  container:     LAPIS                                         │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

## SILO pod spec sketch

```yaml
spec:
  initContainers:
    - name: loculus-config
      image: ghcr.io/loculus-project/config-adapter:X.Y.Z
      env:
        - { name: LOCULUS_BACKEND_URL,             value: "http://loculus-backend:8080" }
        - { name: LOCULUS_ORGANISM_KEY,            value: "ebola-sudan" }
        - { name: LOCULUS_ORGANISM_CONFIG_VERSION, value: "44" }
      volumeMounts:
        - { name: loculus-config, mountPath: /loculus-config }
  containers:
    - name: silo                       # upstream, unmodified
      volumeMounts:
        - { name: loculus-config, mountPath: /app/database_config.yaml,     subPath: database_config.yaml }
        - { name: loculus-config, mountPath: /app/reference_genomes.json,   subPath: reference_genomes.json }
    - name: silo-importer
      volumeMounts:
        - { name: loculus-config, mountPath: /config }
  volumes:
    - { name: loculus-config, emptyDir: {} }
```

## What Helm owns / no longer owns

| Helm still owns | Helm no longer owns |
|---|---|
| Deployments, Services, Ingress, PVCs | Organism schemas |
| Image tags, replica counts, resource limits | Metadata field definitions |
| DB connection strings, JDBC URLs, credentials | Reference genome content |
| Keycloak/LAPIS URLs, cross-pod networking | Lineage system definitions |
| The list of organism **keys** and their **pinned config versions** | Instance branding, dataUseTerms, fileSharing, link-outs |

## `values.yaml` after migration

```yaml
organisms:
  - key: ebola-sudan
    configVersion: 44      # one value, templated into both the SILO and LAPIS pod spec
  - key: west-nile
    configVersion: 12

backend:  { image: ghcr.io/loculus-project/backend:1.0.0, databaseUrl: … }
website:  { image: ghcr.io/loculus-project/website:1.0.0 }   # no pin; fetches latest per request
# (no metadata, no schemas, no reference genomes)
```

Bumping a single per-organism value rolls both pods in step. The **preprocessing** pipeline no longer reads organism content from a Helm ConfigMap: it fetches its opaque config file plus the organism metadata directly from the backend's public config API (see [ADR-019/020](09_architecturalDecisions.md)); Helm passes only operational args (`--backend-host`, `--organism`, `--pipeline-version`, the Keycloak secret) and the deployment topology (image/version/replicas). **Ingest** still reads organism content from `values.yaml`, so `defaultOrganismConfig`/`defaultOrganisms` remain there for it.

## Images

| Image | Built by | Use |
|---|---|---|
| `ghcr.io/loculus-project/config-adapter` | Loculus | Init container in SILO + LAPIS pods (one binary; renders the same files in both). |
| `ghcr.io/loculus-project/config-loader` | Loculus | Job that seeds the DB for CI/preview (below). |
| `ghcr.io/genspectrum/lapis-silo`, `.../lapis` | GenSpectrum (upstream) | SILO / LAPIS containers, unmodified. |

The adapter and loader are TypeScript CLIs in the shared `config-tools/` package, run with `tsx` (no separate compile step).

## Seeding the DB for tests and previews

Real instances are populated by admins through the panel. CI and preview deployments instead run the **config loader** to make the DB deterministic and scriptable:

- **Fixtures.** `kubernetes/loculus/fixtures/instance.yaml` + `fixtures/organisms/<key>.yaml`, one file per organism (the content formerly in `values.yaml.defaultOrganisms`, converted to the canonical schema). Backend tests use a parallel fixture set under `backend/src/test/resources/fixtures/<variant>/`.
- **Loader.** `loculus-config-loader` reads the fixtures and drives the **public admin API** (`POST organisms` → `PUT draft` → `publish`). Using the real API everywhere — no test-only backdoor — means every test run also exercises the write path. On a fresh DB each organism lands at v1, so Helm can pin `configVersion: 1`.
- **Helm.** A `pre-install` ConfigMap bundles the fixtures; a `post-install/post-upgrade` Job exchanges the `config_loader_user` Keycloak password for a token carrying the `loculus_administrator` role and runs the loader in `fresh-only` mode (fails loudly rather than publishing surprise new versions if a fixture changed against a non-fresh DB). CI waits for the Job to complete before Playwright.
- **Backend tests.** A `ConfigFixtures` `@TestConfiguration` loads the fixture YAML into the `config_*` tables in `@BeforeEach`, after the DB is wiped, so every `@EndpointTest` sees the expected organisms via `ConfigService`.
- **Local dev.** Same loader from a shell, against `docker-compose`.

During the brief window between pod startup and Job completion, SILO/LAPIS pods sit in `Init:Error` (their organism isn't in the DB yet) and Kubernetes retries them. Acceptable for previews.
