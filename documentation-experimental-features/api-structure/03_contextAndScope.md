# 3. Context and Scope

## Context

Before this prototype, Loculus exposed backend APIs and LAPIS APIs as separate surfaces. This made API documentation fragmented and leaked internal LAPIS routes into the website.

The new shape is:

- `/query/{key}/current/...` for latest-version query results.
- `/query/{key}/allVersions/...` for historical-version query results.
- `/api-docs.json` for the complete backend OpenAPI document.
- `/api-docs/general.json` for backend endpoints excluding query APIs.
- `/api-docs/query/{key}.json` for one database or view query API.

## In scope

- Backend query routing and proxying.
- Version-scope injection through `versionStatus`.
- OpenAPI splitting and per-spec documentation pages.
- Swagger and Scalar shells with a Loculus navigation bar.

## Out of scope

- LAPIS deployment internals.
- SILO import and preprocessing details.
- Query authorization beyond the current open endpoint model.

