# Preprocessing config-file fixtures

Optional, opaque preprocessing config files seeded into the backend by the
config loader (`config-tools/src/loader`). They mirror the admin-panel
"Preprocessing" feature: per organism, per pipeline version, one free-form text
file that the backend stores verbatim and serves from
`GET /api/config/organisms/{key}/preprocessing/{pipelineVersion}`. The core
never interprets the content — only the (external) preprocessing pipeline does.

See [`config-architecture/61_preprocessingPipeline.md`](../../../../config-architecture/61_preprocessingPipeline.md).

## Layout

```
preprocessing/
  <organism-key>/
    <pipelineVersion>.yaml      # file stem = integer pipeline version; content is opaque
```

Example: `preprocessing/ebola-sudan/1.yaml` is the config file for organism
`ebola-sudan`, pipeline version 1. The extension is irrelevant (the content is
opaque); the file stem must be the integer pipeline version.

The loader PUTs each file after the organism is created/published. Re-running is
idempotent (a PUT replaces the current value).

## What the nextclade pipeline expects in the file

For the in-repo nextclade pipeline, the file is the YAML its `Config` parses
(`preprocessing/nextclade/src/loculus_preprocessing/config.py`), minus the parts
the pipeline now derives itself:

- **Keep in the file:** nextclade dataset config (`segments[].references[]` with
  `nextclade_dataset_name`/`tag`/`server`, `genes`), `nextclade_dataset_server`,
  alignment knobs, EMBL/INSDC/taxonomy fields (`scientific_name`,
  `molecule_type`, …), operational defaults (`batch_size`, `log_level`), and any
  **non-identity** `processing_spec` entries (e.g. `validate_host`,
  `parse_date_into_range`, nextclade output mappings).
- **Do NOT put in the file:** identity `processing_spec` entries for plain
  metadata fields — the pipeline fetches the organism's metadata from the config
  API and applies identity defaults itself (expanding `perSegment` fields per
  segment). Only override the fields that need non-identity processing.

Operational/secret values (backend URL, Keycloak password) are NOT here — they
are passed by Helm as args/env. **Never put secrets in these files; they are
served by an open, public endpoint.**

## How the current files were produced

The committed files (`cchf`, `cchf-multi-ref`, `ebola-sudan` v1+v2,
`enteroviruses`, `not-aligned-organism`, `west-nile`) were generated to be a
**byte-faithful reproduction** of what the old Helm
`loculus-preprocessing-config.yaml` ConfigMap used to mount, so the pipeline's
behaviour is unchanged by the migration. They were extracted by rendering the
chart at the commit just before the ConfigMap template was removed
(`helm template` → the `preprocessing-config.yaml` ConfigMap data) and writing
each to `<organism>/<pipelineVersion>.yaml`.

Each file was validated to load cleanly into the pipeline's `Config`
(`preprocessing/nextclade/src/loculus_preprocessing/config.py`).

Because these files carry the full `processing_spec` (including identity
entries), the pipeline's identity-default derivation is a no-op overlay here —
the result matches the file exactly. The files MAY later be trimmed to only the
non-identity entries (the pipeline re-derives identity defaults from the
organism metadata it fetches), but that is an optional cleanup.

Organisms preprocessed by the **dummy** pipeline need no file (the dummy ignores
config). To regenerate or add an organism, port the nextclade dataset config
from `kubernetes/loculus/values.yaml`
(`defaultOrganisms.<key>.preprocessing[].configFile`) and that organism's
`processing_spec` (its metadata `preprocessing:` blocks, expanded per segment).
