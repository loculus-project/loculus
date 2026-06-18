# 12. Glossary

| Term | Meaning |
|---|---|
| Query API | Backend-owned `/query/{key}/{versionGroup}/...` API that proxies LAPIS. |
| Version group | Route segment selecting latest-only (`current`) or historical (`allVersions`) records. |
| Split spec | A filtered OpenAPI document for either general backend endpoints or one query key. |
| Query key | Public key for an organism database or SQL-backed view. |
| Legacy LAPIS proxy | Temporary `/{organism}/lapis/**` backend proxy retained for compatibility. |

