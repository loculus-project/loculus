# 2. Constraints

## Architectural constraints

| # | Constraint | Origin |
|---|---|---|
| C1 | The backend must not depend on Kubernetes APIs. It runs identically in any container environment. | Project policy — keep core software portable |
| C2 | The backend must not embed knowledge of LAPIS or SILO config formats. | Decoupling principle |
| C3 | Existing data (sequences, submissions, accessions) must remain valid through any change. | Migration safety |
| C4 | LAPIS and SILO do not support hot reload — schema changes require restart + reimport. | Upstream limitation |

## Technical constraints

| # | Constraint | Origin |
|---|---|---|
| T1 | Backend is Kotlin + Spring Boot; persistence is PostgreSQL via Flyway migrations. | Existing stack |
| T2 | Website is Astro + React + TypeScript; Zod for schema validation. | Existing stack |
| T3 | Domain config types are defined twice (Kotlin and Zod) and must stay in sync. | Existing stack |
| T4 | Deployment is via Helm; one SILO pod and one LAPIS pod per organism. | Existing topology |
| T5 | Field names (`metadata[].name`, `inputFields[].name`, …) are part of the public LAPIS query surface and must remain stable. | External LAPIS clients |

## Organisational constraints

| # | Constraint | Origin |
|---|---|---|
| O1 | Start with provably safe operations; expand the API surface deliberately. | Stakeholder requirement |
| O2 | Admins are technically capable (Helm, kubectl) but should not have to be for routine config edits. | Stakeholder model |

## Scope constraints

- **In scope:** website, backend, and the LAPIS/SILO integration.
- **Preprocessing pipeline:** decoupled from the core ([ADR-019/020](09_architecturalDecisions.md)). It is treated as external and fetches the generic domain config plus an optional opaque per-organism config file from the backend; its deployment stays in Helm. The core stays pipeline-agnostic.
- **Out of scope:** ingest pipeline and ENA deposition pipeline. These continue to be configured through `values.yaml`. (Migrating them to the DB-backed config is a plausible future step.)
