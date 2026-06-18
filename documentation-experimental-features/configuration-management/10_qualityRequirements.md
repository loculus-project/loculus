# 10. Quality Requirements

| ID | Quality | Scenario | Target / how it's met |
|---|---|---|---|
| Q1 | Safety | Admin attempts to rename a metadata field on a released organism via the API. | Rejected — no such operation exists in the registry ([ADR-006](09_architecturalDecisions.md)). |
| Q2 | Availability | Admin publishes a new organism config version. | LAPIS for that organism stays available throughout the rolling update; the old pod serves until the new one is ready ([section 6](06_runtimeView.md)). |
| Q3 | Auditability | "Who changed the country display name two weeks ago?" | A `config_audit_log` query returns actor, timestamp, action, and summary. |
| Q4 | Reversibility | A published version turns out wrong. | Re-pin the previous version and roll out; back in minutes, as long as that version is still kept. |
| Q5 | Stability | An external LAPIS client queries by field name `country`. | Field names cannot change via the API; existing queries keep working across publishes ([T5](02_constraints.md)). |
| Q6 | Modifiability | Adding a new safe operation. | One PR adding a single registry handler; no DB migration ([ADR-006](09_architecturalDecisions.md)). |
| Q7 | Determinism | CI / preview must reproduce a known config from scratch. | The loader seeds a fresh DB from fixture YAML through the admin API; each organism lands at v1 ([section 7](07_deploymentView.md), [ADR-017](09_architecturalDecisions.md)). |
