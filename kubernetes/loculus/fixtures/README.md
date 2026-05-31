# `kubernetes/loculus/fixtures/`

Fixture YAMLs consumed by the `loculus-config-loader` CLI (see
`config-tools/Dockerfile.loader`) to seed a fresh Loculus deployment.

## Provenance

These fixtures are the **source of truth** for the organism/instance domain
config used by CI, previews, and local dev (the backend DB is seeded from them
by `loculus-config-loader`). They are hand-maintained — edit them directly.

Reference-genome sequences are **inlined** here (not `[[URL:...]]` placeholders),
so the loader needs no network access at load time. The sequences no longer live
in `values.yaml` at all: domain config (organisms, schemas, reference genomes,
lineage definitions) is owned by these fixtures / the database, while
`values.yaml` keeps only deployment/technical config plus the legacy per-organism
scaffolding that `ingest`/`ena-submission` still read (segment names, no sequences).

(These fixtures were originally bootstrapped from `values.yaml` by a one-shot
`migrate-values-to-fixtures.py` script, since deleted.)

## Layout

```
fixtures/
├── instance.yaml                  # validates against canonicalInstanceConfig
└── organisms/
    └── <key>.yaml                 # one file per organism; key = filename stem
```

Current organisms (matches `defaultOrganisms` in `values.yaml`):
`cchf`, `cchf-multi-ref`, `dummy-organism`, `dummy-organism-with-files`,
`ebola-sudan`, `enteroviruses`, `not-aligned-organism`, `west-nile`.

## Local-dev loading

```bash
cd config-tools
npm install   # one-time
npm run loader -- \
  --backend-url http://localhost:8079 \
  --fixtures ../kubernetes/loculus/fixtures \
  --admin-token "$LOCULUS_ADMIN_TOKEN"
```

`LOCULUS_ADMIN_TOKEN` must be a Keycloak token for a user with the `loculus_administrator` realm role.

Use `--dry-run` to validate fixtures against the canonical Zod schema without
making any HTTP calls.

## Helm Job usage (Phase 3.4)

Helm mounts these YAMLs as a ConfigMap (`loculus-config-loader-fixtures`) and
runs the loader as a `post-install` Job with `--mode fresh-only`.
