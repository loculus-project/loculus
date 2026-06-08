# Building Block View

- `QueryController`: backend surface for website-facing sequence queries and Swagger documentation.
- `LapisAccessFilter`: derives demonstration access filters from the authenticated user.
- `LapisProxyService`: forwards filtered requests to the configured LAPIS instance.
- Website query clients: call `/query` for metadata, aggregation, sequence, mutation, insertion, and download data.
- Backend config: provides organism keys, LAPIS URLs, and schema fields used by the proxy.
