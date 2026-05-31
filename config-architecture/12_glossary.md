# 12. Glossary

| Term | Meaning |
|---|---|
| **Adapter** (`loculus-config-adapter`) | TypeScript CLI in `config-tools/` that fetches a pinned organism config from the backend and renders the SILO + LAPIS files. Runs as an init container in both SILO and LAPIS pods. Does **not** render any Loculus preprocessing-pipeline config (that pipeline is external — see Preprocessing config file). |
| **Common (system) metadata** | The built-in fields (`accessionVersion`, `accession`, `version`, `submissionId`, `submitter`, `groupName`, `submittedAtTimestamp`, data-use-terms fields, …) composed onto every organism's metadata at render time, by both the website and the adapter. Defined in code, not stored per organism. |
| **Config loader** (`loculus-config-loader`) | TypeScript CLI in `config-tools/` that reads fixture YAML and brings the backend to that state through the admin API. Seeds CI, previews, and local dev. |
| **Config version** | A monotonically-numbered snapshot of instance or organism config, identified by `(scope, version)`. Immutable while kept; not guaranteed to exist forever. |
| **`config-tools/`** | Top-level npm package owning the canonical Zod schemas (re-exported by the website) and the loader + adapter CLIs. |
| **Draft** | A mutable working copy of instance or organism config — one per scope, materialized in a `config_*_draft(s)` row, with a `revision` counter. |
| **Fixtures** | Canonical-schema YAML files (`instance.yaml` + `organisms/<key>.yaml`) used to seed the DB for tests and previews. |
| **Instance config** | Singleton config: branding, dataUseTerms, fileSharing, feature toggles, accession prefix, lineage system definitions, display defaults. |
| **LAPIS** | Upstream HTTP query API in front of SILO. One deployment per organism. |
| **Operation** | A named, parameterized edit appended to a draft; defined by a handler in the in-code operation registry. |
| **Operation registry** | The in-code set of admin operations for released organisms and the instance. It *is* the safety policy — operations are classified cosmetic / non-breaking-schema / (future) breaking; absent operations cannot be performed. |
| **Organism config** | Per-organism config: schema (metadata, input fields, table columns, link-outs, submission types, files), reference genome(s), display fields. |
| **Pinned version** | The config version set on a SILO/LAPIS pod spec via env var. Determines what config that pod runs. |
| **Preprocessing config file** | An optional, opaque text file stored per `(organism, pipeline version)` in `config_preprocessing_files` and served raw from a dedicated public endpoint. Unversioned (direct admin save). The backend never interprets it; an external preprocessing pipeline fetches it if it wants. See [ADR-020](09_architecturalDecisions.md). |
| **Published version** | A `config_*_versions` row; immutable while kept. |
| **Released (organism)** | An organism with at least one published version (`config_organisms.status = 'released'`). |
| **Rollout** | The `helm upgrade` action that applies an updated organism config version to running pods, implemented by Kubernetes as a rolling update. |
| **Schema (organism)** | The `schema` field of an organism config. |
| **SILO** | Upstream columnar genomic database. One deployment per organism. |
| **silo-importer** | Loculus component that pulls processed sequences from the backend into SILO. Runs in the SILO pod. |
| **Unreleased (organism)** | An organism with no published version yet (`config_organisms.status = 'unreleased'`). |
| **`values.yaml`** | Helm values file. After the migration: infrastructure config plus organism keys and pinned versions. |
