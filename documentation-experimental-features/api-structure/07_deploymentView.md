# 7. Deployment View

## Runtime deployment

No new service is introduced. The existing backend pod proxies to existing LAPIS services.

Each organism and view config carries a `lapisUrl`. In local previews these are in-cluster service URLs such as `http://loculus-lapis-service-west-nile:8080` or `http://loculus-lapis-service-overview:8080`.

## Public entry points

| Path | Purpose |
|---|---|
| `/query/{key}/current/...` | Latest-version query API. |
| `/query/{key}/allVersions/...` | Historical-version query API. |
| `/api-docs.json` | Complete OpenAPI document. |
| `/api-docs/general.json` | Backend endpoints without query APIs. |
| `/api-docs/query/{key}.json` | One database or view query API. |
| `/swagger-ui/loculus` | Swagger UI with Loculus navigation bar. |
| `/scalar-api-reference` | Scalar page with Loculus navigation bar. |

