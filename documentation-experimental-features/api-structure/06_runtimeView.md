# 6. Runtime View

## Query request

1. A client sends `GET` or `POST` to `/query/{key}/{versionGroup}/metadata`, `/aggregated`, or another supported query endpoint.
2. The backend resolves `{key}` first as a configured view and then as an organism.
3. The backend maps the route to the corresponding LAPIS `/sample/...` path.
4. `current` adds `versionStatus=LATEST_VERSION`; `allVersions` does not.
5. The proxy forwards the request to the configured LAPIS URL.
6. LAPIS executes the query and streams the response through the backend.

## API documentation request

1. Springdoc generates the complete backend OpenAPI document at `/api-docs.json`.
2. `/api-docs/general.json` removes all `/query/` paths.
3. `/api-docs/query/{key}.json` keeps only paths for that one key.
4. Swagger and Scalar load whichever spec is selected in the top bar.

