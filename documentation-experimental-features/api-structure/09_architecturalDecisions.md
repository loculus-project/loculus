# 9. Architectural Decisions

## ADR-001: Backend owns the public query API path

**Decision.** Public query calls use `/query/{key}/{versionGroup}/...`.

**Consequences.** Clients do not need LAPIS service URLs. The backend can document and evolve the public query surface.

## ADR-002: LAPIS remains the query engine

**Decision.** The backend forwards to LAPIS instead of evaluating metadata or sequence queries.

**Consequences.** Query behavior stays aligned with LAPIS. Backend work is limited to routing, filtering, and streaming.

## ADR-003: Version scope is explicit in the path

**Decision.** `current` and `allVersions` are route segments.

**Consequences.** Callers choose latest-only or historical behavior explicitly, and OpenAPI documents show both modes.

## ADR-004: OpenAPI is split by path filtering

**Decision.** Springdoc still generates a complete document; custom endpoints filter it into general and per-query specs.

**Consequences.** There is one source OpenAPI model, but users can load smaller specs.

## ADR-005: Views use the same query API as organisms

**Decision.** `QueryController` resolves keys against configured views and organism configs.

**Consequences.** SQL-backed metadata views get Swagger, Scalar, and `/query` access without a separate API family.

## ADR-006: Keep the legacy LAPIS proxy temporarily

**Decision.** `/{organism}/lapis/**` remains available while callers migrate.

**Consequences.** Compatibility is preserved, but the API documentation page no longer promotes the legacy proxy.

