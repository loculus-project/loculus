# Architecture Decisions

- Keep LAPIS as the data-query engine and proxy through the backend for API structure and demonstration authorization.
- Introduce `/query` so website-facing sequence reads are documented with the backend APIs.
- Model `current` and `allVersions` explicitly in the path so callers choose the desired version scope.
- Preserve a small proxy layer to avoid duplicating LAPIS request handling in the backend.
