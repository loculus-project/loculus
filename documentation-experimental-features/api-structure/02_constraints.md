# 2. Constraints

## Technical constraints

1. LAPIS remains the source of query execution behavior.
2. Query endpoints must support both `GET` and `POST` because LAPIS clients use both forms.
3. Large responses must stream through the backend without buffering the full body.
4. Hop-by-hop HTTP headers must not be forwarded from LAPIS to clients.
5. Query APIs must work for normal organism databases and SQL-backed views.
6. Generated OpenAPI documents must stay valid after path rewriting from generic `/query/{organism}` paths to concrete organism/view keys.

## Operational constraints

The backend resolves LAPIS URLs from published config. If a database or view has no `lapisUrl`, the proxy returns `404` rather than guessing deployment names.

