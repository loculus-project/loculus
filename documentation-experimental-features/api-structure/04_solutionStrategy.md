# 4. Solution Strategy

1. Add explicit backend routes under `/query/{organism}/{versionGroup}` for the LAPIS endpoints used by Loculus.
2. Resolve `{organism}` against both released organisms and configured views.
3. Translate `current` to a LAPIS `versionStatus=LATEST_VERSION` filter; leave `allVersions` unfiltered by version status.
4. Forward the request to the configured upstream LAPIS URL with streaming response bodies.
5. Keep a legacy `/{organism}/lapis/**` proxy for compatibility while callers migrate.
6. Generate one complete OpenAPI document and derive smaller documents by filtering paths.
7. Present the split documents on `/api-documentation`, Swagger, and Scalar.

