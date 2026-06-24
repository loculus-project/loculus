# @loculus/config-tools

Shared canonical config schemas (Zod) and CLIs for the Loculus DB-backed config system.

This package backs:

- **`website/`** — consumes the canonical Zod schemas (via re-export in `website/src/types/loculusConfig.ts`).
- **`loculus-config-loader`** (this package) — posts fixture YAML to the backend admin API.
- **`loculus-config-adapter`** (planned, Phase 2.2) — init-container that renders SILO/LAPIS / preprocessing config from `/api/config/...`.

## Layout

```
config-tools/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── Dockerfile.loader
└── src/
    ├── index.ts                       # re-exports all schemas
    ├── schema/
    │   ├── canonicalConfig.ts         # mirrors backend/.../config/Config.kt + InstanceConfig.kt
    │   └── adminApi.ts                # mirrors AdminConfigController response DTOs
    └── loader/
        ├── cli.ts                     # `loculus-config-loader` entry point
        ├── fixtures.ts                # reads instance.yaml + organisms/*.yaml
        ├── adminClient.ts             # HTTP client (Bearer auth + If-Match)
        ├── compare.ts                 # deep-equal for idempotency
        ├── publish.ts                 # orchestrator
        └── publish.spec.ts
```

## Fixture format

The loader expects a directory like:

```
<fixtures-dir>/
├── instance.yaml                  # validates against canonicalInstanceConfig
└── organisms/
    ├── <key1>.yaml                # validates against canonicalOrganismConfig
    └── <key2>.yaml
```

Each organism's `key` is taken from its filename (without the `.yaml` extension).
Backend test fixtures under `backend/src/test/resources/fixtures/<variant>/` are
in this exact shape (the fixtures `ConfigFixtures.kt` consumes), so they double
as loader input for local dev.

## Adapter: `loculus-config-adapter`

Init-container that fetches a pinned organism's config from the Loculus public
API and renders the files SILO + LAPIS + preprocessing expect.

### Outputs

- `database_config.yaml` — SILO database config (was `_siloDatabaseConfig.tpl`)
- `reference_genomes.json` — flat nucleotide+gene shape with multi-segment / multi-reference disambiguation (was `_merged-reference-genomes.tpl`)
- `preprocessing_config.yaml` — per-field preprocessing pipeline spec (was `_preprocessingFromValues.tpl`)
- `lineage_definitions.json` — the `{ lineageSystem: { pipelineVersion: URL } }` map taken from the DB instance config's `lineageSystemDefinitions`, filtered to the systems this organism references (always written, possibly `{}`). The adapter does **not** download the definitions; the silo-importer reads this file and downloads them itself at import time (it knows the pipeline version of the data it imports).

### CLI usage

```
loculus-config-adapter \
  --backend-url http://localhost:8079 \
  --organism ebola-sudan \
  --organism-version 1 \
  [--instance-version 4]              # default: latest
  [--output-dir /loculus-config]      # default: /loculus-config
```

Environment fallbacks: `LOCULUS_BACKEND_URL`, `LOCULUS_ORGANISM_KEY`,
`LOCULUS_ORGANISM_CONFIG_VERSION`, `LOCULUS_INSTANCE_CONFIG_VERSION`,
`LOCULUS_CONFIG_OUTPUT_DIR`.

### Consistency

The adapter writes each output file directly into the output dir; it never
removes the dir, because in Kubernetes that dir is the mount point of a shared
`emptyDir` the container can't delete. Consistency comes from init-container
ordering instead: the adapter runs to completion before SILO/LAPIS starts, so
the main container only ever sees a complete render.

### Docker

```bash
docker build -f config-tools/Dockerfile.adapter -t loculus-config-adapter:dev config-tools/
```

The Phase 3.5 Helm work wires this as an init container on each per-organism
SILO + LAPIS Deployment.

## Loader: `loculus-config-loader`

Replaces the legacy `backend/import_local_test_config.py` script.

### CLI usage

```
loculus-config-loader \
  --backend-url http://localhost:8079 \
  --fixtures backend/src/test/resources/fixtures/default \
  --admin-token "$LOCULUS_ADMIN_TOKEN" \
  [--mode idempotent|fresh-only|republish] \
  [--dry-run]
```

Environment variables work too: `LOCULUS_BACKEND_URL`, `LOCULUS_FIXTURES_DIR`,
`LOCULUS_ADMIN_TOKEN`, `LOCULUS_ADMIN_TOKEN_FILE`.

### Modes

- `idempotent` (default) — for each fixture entry, skip if the backend already
  matches; otherwise create-then-publish. Fails if an *already-released*
  organism's draft has diverged from the fixture (use `--mode republish` to
  override; not yet implemented for that case).
- `fresh-only` — fails if any fixture key already exists in the backend. Right
  for Helm post-install hooks where a fresh cluster shouldn't paper over half-state.
- `republish` — placeholder; not yet implemented for released organisms.

### Local-dev usage

To seed a local backend with the default test fixtures (replaces the old
`import_local_test_config.py` flow):

```bash
cd config-tools
npm install
npm run loader -- \
  --backend-url http://localhost:8079 \
  --fixtures ../backend/src/test/resources/fixtures/default \
  --admin-token "$LOCULUS_ADMIN_TOKEN"
```

Use a Keycloak token for a user with the `loculus_administrator` realm role.

### Helm usage (planned, Phase 3.4)

The Helm chart's post-install Job will mount a ConfigMap of YAML fixtures and
invoke `loculus-config-loader --mode fresh-only` against the in-cluster backend.

## Schemas

Importable from `@loculus/config-tools`:

```ts
import {
    canonicalInstanceConfig,
    canonicalOrganismConfig,
    organismDraftResponse,
    publishResponse,
    operationRequest,
} from '@loculus/config-tools';
```

(In this repo, the website imports them via a relative re-export at
`website/src/types/loculusConfig.ts`; no workspace setup is required.)

## Tests

```bash
cd config-tools
CI=1 npm test
```

Unit tests use Vitest with a mocked global `fetch`.

## Docker

```bash
docker build -f config-tools/Dockerfile.loader -t loculus-config-loader:dev config-tools/
```

The image runs `npx tsx src/loader/cli.ts` as `ENTRYPOINT`; pass loader flags as
the `args` array in your Kubernetes job spec or as `CMD` for `docker run`.
