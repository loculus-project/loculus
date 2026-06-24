# 10. Quality Requirements

| Quality | Requirement |
|---|---|
| Usability | Swagger and Scalar must load a focused spec for one database or view. |
| Compatibility | Query endpoints should preserve LAPIS request/response formats. |
| Performance | Large LAPIS responses must stream through the backend. |
| Maintainability | Adding a new configured view should automatically produce a query spec. |
| Observability | Upstream LAPIS failures should surface as clear backend proxy errors. |
| Consistency | Website query paths and documented API paths should use the same backend route family. |

