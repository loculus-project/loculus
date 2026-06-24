# 5. Building Block View

## Level 1

```
Client / Website
      |
      v
Loculus backend
  - QueryController
  - LapisAccessFilter
  - LapisProxyService
  - OpenApiSplitController
      |
      v
Configured LAPIS instance
```

## Components

| Component | Responsibility |
|---|---|
| `QueryController` | Defines typed `/query/{key}/{versionGroup}/...` routes and resolves the configured LAPIS URL. |
| `LapisAccessFilter` | Adds the version-scope filter to JSON bodies or query strings. |
| `LapisProxyService` | Sends the upstream HTTP request and streams the LAPIS response back to the client. |
| `LapisProxyController` | Legacy `/{organism}/lapis/**` compatibility proxy. |
| `OpenApiSplitController` | Builds `/api-docs/general.json` and `/api-docs/query/{key}.json` from the generated OpenAPI document. |
| `InfoController` | Serves Swagger and Scalar shells with a small Loculus navigation bar. |
| Website docs page | Groups complete, general, database-query, and view-query API documents. |

