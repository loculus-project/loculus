# LAPIS Proxy — Architecture Documentation

## 1. Introduction And Goals

This branch demonstrates a new API structure for sequence reads:

- `/query/{organism}/current/...` returns only latest sequence versions.
- `/query/{organism}/allVersions/...` can return historical versions.
- The backend exposes and documents these endpoints alongside the existing submission APIs.

The main goal is to show the value of a backend-owned query API: one documented API surface, one component for submission and query APIs, and easy access to backend-only context such as submitting groups. Group-specific authentication is implemented as a demonstration of this API architecture.

## 2. Constraints

- The demonstration authorization must be enforced in the backend, not only in the website.
- LAPIS remains the query engine; the backend should add access constraints and proxy requests rather than reimplementing LAPIS queries.
- Group access must be expressed as a LAPIS filter so that filtering work stays in LAPIS.
- Existing organism-specific configuration remains the source of truth for LAPIS URLs and metadata fields.

## 3. Context And Scope

Loculus already serves submission APIs from the backend and sequence-query APIs from LAPIS. This branch explores serving website-facing sequence queries through the backend as well.

The backend query API still delegates to LAPIS, but it can add information that only the backend knows. Group-specific authentication is the example used here because the backend has database access and understands submitting groups.

## 4. Solution Strategy

- Add `/query/{organism}/{versionGroup}/...` endpoints that mirror the LAPIS data endpoints used by the website.
- Document those endpoints in the backend API reference together with the submission endpoints.
- Add a demonstration access filter that augments LAPIS request bodies or query strings with group and version constraints.
- Use `current` for latest-version views and `allVersions` where sequence history or exact accession versions are needed.
- Update website data loading so user-facing sequence data and counts come from `/query`.

## 5. Building Block View

- `QueryController`: backend surface for website-facing sequence queries and API documentation.
- `LapisAccessFilter`: derives demonstration access filters from the authenticated user.
- `LapisProxyService`: forwards filtered requests to the configured LAPIS instance.
- Website query clients: call `/query` for metadata, aggregation, sequence, mutation, insertion, and download data.
- Backend config: provides organism keys, LAPIS URLs, and schema fields used by the proxy.

## 6. Runtime View

For a website request, the user session is converted into a bearer token and sent to the backend query API. The backend resolves the organism config, computes the access filter, combines it with the requested LAPIS query, and forwards the result to LAPIS.

In the demonstration access model, unauthenticated users receive no private sequence data, superusers receive all sequence data, and regular users receive sequences submitted by groups they belong to.

## 7. Deployment View

The website points to the Loculus backend and builds query URLs from that backend URL. The backend reaches LAPIS through the configured per-organism LAPIS service URL.

No additional runtime service is introduced. Query and submission endpoints are served by the same backend component.

## 8. Crosscutting Concepts

- API structure: sequence query and submission APIs share one backend OpenAPI surface, shown through Swagger UI or Scalar.
- Demonstration access control: sequence visibility is expressed as LAPIS-compatible filters.
- Version groups: `current` adds the latest-version constraint; `allVersions` leaves version history visible subject to access control.
- Private landing page: unauthenticated users see a concise private-instance notice and login link.
- Counts: landing-page counts use backend query results so they reflect the current user's visibility.

## 9. Architecture Decisions

- Keep LAPIS as the data-query engine and proxy through the backend for API structure and demonstration authorization.
- Introduce `/query` so website-facing sequence reads are documented with the backend APIs.
- Model `current` and `allVersions` explicitly in the path so callers choose the desired version scope.
- Preserve a small proxy layer to avoid duplicating LAPIS request handling in the backend.

## 10. Quality Requirements

- Demonstrability: the API structure should make backend-owned query endpoints easy to inspect in the API reference.
- Security example: private sequence data must not leak through tables, details, downloads, or counts.
- Performance: backend work should be limited to auth-derived filter construction and request forwarding.
- Compatibility: query endpoints should stay close to LAPIS endpoint shapes used by the website.

## 11. Risks And Technical Debt

- The website still has a few raw LAPIS call paths that need follow-up before the old proxy can be retired.
- The demonstration access filter depends on the configured group metadata field matching LAPIS data.
- Query endpoint coverage is driven by current website needs, so new website LAPIS usages should prefer `/query`.

## 12. Glossary

- `current`: query version group for latest sequence versions only.
- `allVersions`: query version group for all sequence versions visible to the user.
- LAPIS: the query engine that executes metadata, aggregation, sequence, mutation, and insertion requests.
- Submitting group: the group associated with a sequence entry and used by the demonstration access model.
- Superuser: demonstration user role that can see all sequence data.

## 20. Gaps

Remaining website uses of `/{organism}/lapis/**`:

- `website/src/components/SearchPage/fields/AutoCompleteOptions.ts`: lineage definition lookup still uses the raw LAPIS proxy.
- `website/src/components/DataUseTerms/EditDataUseTermsModal.tsx`: data-use-terms details still call `useDetails()` without a `/query` URL.
- `website/src/pages/loculus-info/index.ts`: runtime info still exposes per-organism raw LAPIS URLs.
- `website/src/services/lapisClient.ts`: `streamSequences()` and `getDetails()` still target raw LAPIS, though they currently have no production website callers.
