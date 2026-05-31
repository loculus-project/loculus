# 4. Solution Strategy

| # | Decision | Reasoning |
|---|---|---|
| S1 | PostgreSQL is the source of truth for domain config. | Centralised, transactional, easy to attribute changes. |
| S2 | The backend exposes config over HTTP; every other component consumes it as a client. | Decoupled consumers; one API to evolve. |
| S3 | SILO and LAPIS pods include a per-pod **config adapter** that translates Loculus config into their file formats. | Keeps the backend tool-agnostic. |
| S4 | Pod specs **pin a specific config version**; the admin updates the pin to apply changes; Kubernetes performs the rolling update. | Native k8s semantics; no custom restart machinery. |
| S5 | Two editing paths: **free-form document replacement** for never-published organisms, **restricted named operations** for released ones. | Maximises flexibility before release, safety after. |
| S6 | The write API exposes only operations that are safe by construction; unsafe edits are not in the API at all. | Predictable safety story; small surface to review. |
| S7 | Published versions are **immutable while kept**; they exist to support smooth rollouts and short-window rollback. | Avoids long-term commitments that would constrain future schema evolution. |
| S8 | Shared TypeScript package (`config-tools/`) owns the canonical schemas and both edge programs (loader, adapter). | One place to keep Zod schemas; the website re-exports them. |

These choices appear as the building blocks in [section 5](05_buildingBlockView.md) and are justified in detail as ADRs in [section 9](09_architecturalDecisions.md).
