# 1. Introduction and Goals

## What this describes

Loculus's **domain-specific configuration** (organisms, schemas, branding, link-outs, reference genomes, lineage systems, …) lives in the backend **database** and is edited through a Keycloak-gated **admin panel**, instead of being baked into Helm's `values.yaml`.

Only domain configuration moved. Technical/infrastructure config (database connections, ingress, ports, image tags, replica counts, credentials) stays in Helm. The work spans the **core software** — website, backend, and the LAPIS/SILO integration. The **preprocessing** pipeline has since been decoupled too: it is treated as external and fetches what it needs from the backend's public config API, including an optional opaque per-organism config file ([ADR-019/020](09_architecturalDecisions.md)). The **ingest** pipeline remains `values.yaml`-configured for now.

## Goals

1. **Editable without redeploy** — admins change domain config from a UI; common edits no longer require editing `values.yaml`.
2. **Safe by construction** — the write API exposes only operations whose effect on existing data, queries, and pipelines is well understood. Destructive operations are not in the API surface at all.
3. **Zero/minimal downtime** — when a change requires SILO/LAPIS reindexing, the old instance stays live until the new one is ready.
4. **Predictable, observable rollouts** — changes that need pod restarts propagate through standard Kubernetes rolling updates, not custom kill-and-restart logic.
5. **Decoupled responsibilities** — the backend knows nothing about Kubernetes, LAPIS, or SILO; LAPIS/SILO pods know nothing about the Loculus database. The contract between them is an HTTP API.
6. **Auditable** — every config change is attributed and replayable; short-window rollback is trivial.

## Non-goals

- Making the core (backend, config DB, `config-tools`) aware of any specific pipeline, or letting it deploy/run pipelines. Pipelines stay external and customizable; the optional preprocessing config-file feature ([ADR-020](09_architecturalDecisions.md)) is a store-and-serve text channel only.
- Changing how the **ingest** pipeline is configured (still `values.yaml`).
- Removing Helm or `values.yaml` — they remain the source of infrastructure config.
- Letting Loculus dynamically provision Kubernetes pods. Provisioning stays a Helm/admin responsibility.
- Hot-reloading LAPIS or SILO in-process (their architecture does not support it; we work with restarts).

## Scope and status

This is a **working prototype**, not a production migration. Loculus has no stable release yet, so breaking changes are acceptable and a production migration tool can be designed later.

What must keep working from day one is **integration tests and preview instances**. The per-organism content in `kubernetes/loculus/values.yaml` exists for CI and previews, not for real instances. A small **config loader** populates the DB-backed config from fixture YAML so tests and previews stay functional without manual entry (see [section 7](07_deploymentView.md)).

## Stakeholders

| Role | Goal |
|---|---|
| Instance admin (domain expert) | Change branding, add organisms, evolve schemas without writing YAML or rolling Helm for every tweak. |
| Server operator | Owns the technical setup (PostgreSQL provisioning, infrastructure, Loculus version upgrades). |
| End user / submitter | Stable URLs and stable LAPIS queries; no surprise breakage. |
| Loculus developer | Add new config options without invasive schema/code changes. |
