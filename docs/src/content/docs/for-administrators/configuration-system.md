---
title: Configuration system
description: How Loculus configuration is structured — the database-backed domain config vs. deployment config
---

Loculus configuration is split into two layers, with a deliberate boundary between them:

| Layer | Examples | Where it lives | How you change it |
|---|---|---|---|
| **Domain config** | Organism schemas, metadata fields, reference genomes, link-outs, lineage system definitions; instance name, branding, banners, GitHub links, `dataUseTerms`, `fileSharing`, feature toggles | The backend **database** (`config_*` tables — versioned, with an audit log) | The [admin dashboard](managing-configuration/) or the `/api/admin/config/...` API |
| **Deployment / infrastructure config** | Service URLs, image tags, resource requests, replica counts, secrets, which pipelines run | Helm `values.yaml` (and `runtime_config.json` for the website) | Edit the files; redeploy |

The split is deliberate: domain config changes routinely and benefits from versioning + an audit trail, while deployment config changes rarely and belongs in version control with the rest of the deployment. Secrets and infrastructure never enter the database-backed config, which is why its read API can be public.

This page explains the concepts. For the step-by-step admin workflow (creating organisms, editing, publishing, rollout, the API), see [Managing configuration](managing-configuration/).

## The two domain-config documents

- **Instance config** — one document for the whole instance: name, accession prefix, logo, banners, GitHub URLs, `dataUseTerms`, `fileSharing`, feature toggles, lineage system definitions, etc.
- **Organism config** — one document per organism: its `schema` (metadata fields, table columns, primary key, …), reference genome(s) (single- or multi-segment, multi-reference), file categories, link-outs, and display fields.

Each document has its own independent, versioned history.

## Versioned, with drafts

Every published config version is **immutable**. You never edit a published version in place — instead you work on a **draft** and then publish it as a new version:

1. Open an organism (or the instance) for editing — the system loads the current draft, or starts a fresh one from the published version.
2. Make changes — replacing the whole document (for a brand-new, unreleased organism) or appending small, named, validated **operations** (for a released organism), such as `setOrganismDisplay`, `addLinkOut`, or `reorderMetadataFields`.
3. Review the pending operations.
4. **Publish** — this writes a new immutable version and clears the draft (or discard the draft to throw the changes away).

Every change is recorded in an **audit log** (who changed what, when). A released config can only be changed through this operations + publish path; there is no way to silently mutate it.

## Where each component gets its config

The database is the single source of truth; the components read from it in different ways:

- **Backend + website** read the config from the database directly (the website fetches `/api/config/...` on each server-side request and fails closed if the backend is unreachable). Newly published config is picked up without a restart.
- **SILO + LAPIS** do not read the database directly. Each per-organism SILO/LAPIS pod runs a `config-adapter` init container that fetches the **pinned** organism config version (set by `configVersion` in `values.yaml`) from the public API and renders the files SILO/LAPIS expect. Publishing a new version therefore does **not** automatically restart SILO/LAPIS — see [Managing configuration → Update an organism](managing-configuration/#3-update-an-organism) for the rollout step.
- **Preprocessing pipelines** are external and fetch what they need from the public API themselves. They may optionally read an opaque per-organism config file you store in Loculus — see [Configuring pipelines in the admin panel](configure-pipeline-admin-panel/).

## What is *not* in the database-backed config

Deployment and infrastructure settings stay in Helm `values.yaml`: service URLs, image tags/versions, replicas, resource limits, secrets (as Kubernetes Secrets), and the per-organism scaffolding that declares which pipelines run and which `configVersion` each SILO/LAPIS pod pins. See the [Helm chart config reference](../../reference/helm-chart-config/).

> Migration note: the ingest and ENA-submission pipelines still read some organism fields (schema/metadata and reference-genome segment names — but not the reference sequences, which now live only in the database) from `values.yaml`; those legacy fields remain there until those pipelines also move to the database-backed config.

## Where to go next

- [Managing configuration](managing-configuration/) — the practical admin-dashboard + API guide.
- [Configuring pipelines in the admin panel](configure-pipeline-admin-panel/) — the optional preprocessing config-file feature.
- [Helm chart config reference](../../reference/helm-chart-config/) — the deployment-side `values.yaml` fields.
