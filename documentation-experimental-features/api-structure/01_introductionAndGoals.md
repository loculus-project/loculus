# 1. Introduction and Goals

## What this describes

Loculus exposes sequence-query APIs through the backend under `/query/{organism}/{versionGroup}/...` instead of asking the website and users to call LAPIS directly.

LAPIS remains the query engine. The backend owns the public API shape, resolves organism and view configuration, injects version-scope filters, proxies the request, and exposes OpenAPI documents for the resulting API surface.

## Goals

1. Provide one backend-owned API surface for submission, configuration, and sequence queries.
2. Keep query URLs stable even if internal LAPIS service names or deployment details change.
3. Document query APIs with the rest of the backend API in Swagger and Scalar.
4. Split large OpenAPI output into usable per-query and general specifications.
5. Preserve LAPIS streaming behavior and response formats.
6. Keep the backend proxy thin; LAPIS still performs filtering, aggregation, and sequence output.

## Non-goals

- Reimplementing LAPIS query semantics in the backend.
- Removing the temporary `/{organism}/lapis/**` proxy in this prototype.
- Adding production-grade per-user query authorization.
- Hiding public open metadata behind authentication.

## Scope and status

This is a working prototype. The website uses the new `/query` routes for the main search and documentation flows. A legacy LAPIS proxy remains for compatibility and for call paths that have not yet moved.

