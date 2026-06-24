# 3. Context and Scope

## System context

```
                  ┌──────────────────────┐
                  │   Instance admin     │
                  │   (browser)          │
                  └──────────┬───────────┘
                             │ HTTPS, Keycloak-authenticated
                  ┌──────────▼───────────┐
                  │   Loculus admin      │
                  │   panel (Astro app)  │
                  └──────────┬───────────┘
                             │
                             │ /api/admin/config/...
                             │
   ┌──────────────┐   ┌──────▼──────────┐   ┌────────────────────────┐
   │  End users   │   │ Loculus backend │───│  Loculus PostgreSQL    │
   │  (browser)   │   │ (Kotlin/Spring) │   │  (config_* tables)     │
   └──────┬───────┘   └─┬──────────┬────┘   └────────────────────────┘
          │             │          │
          ▼             ▲          │ /api/config/...
   ┌───────────┐        │          ▼
   │  Website  │────────┘   ┌──────────────────────────────┐
   │  (Astro)  │            │  Per-organism pod (admin-    │
   └───────────┘            │  managed via Helm)           │
                            │  ┌─────────────────────────┐ │
                            │  │ loculus-config-adapter  │ │  fetches config at startup,
                            │  │ (init container)        │ │  renders SILO/LAPIS files
                            │  └────────────┬────────────┘ │
                            │               │ shared volume│
                            │  ┌────────────▼────────────┐ │
                            │  │ SILO (upstream)         │ │
                            │  │ LAPIS (upstream)        │ │
                            │  │ silo-importer           │ │
                            │  └─────────────────────────┘ │
                            └──────────────────────────────┘
```

## External actors

| Actor | Interaction |
|---|---|
| Instance admin | Edits config through the admin panel; runs `helm upgrade` to apply changes that affect deployed SILO/LAPIS pods. |
| End user (incl. submitter) | Uses the website to browse, search, and submit; consumes published config indirectly via the website and LAPIS. |

## External technical systems

| System | Role | Loculus's coupling |
|---|---|---|
| PostgreSQL | Stores config and everything else | Direct (JDBC, Flyway) |
| Keycloak | Authenticates admins and submitters | OAuth/OIDC |
| LAPIS / SILO | Per-organism query engine and storage | HTTP (from the adapter only); no direct DB coupling |
| Kubernetes | Container orchestration | Backend: zero coupling. Admins use Helm/kubectl. |

## Interfaces

The backend exposes two HTTP surfaces. Full reference: [section 13](13_databaseSchema.md) (storage) and [section 14](14_configSchema.md) (payload shapes); the operation registry is in [section 8](08_crosscuttingConcepts.md).

### Public read API (consumed by website, config adapter, external tools)

```
GET /api/config/instance                        → { version, publishedAt, config, readOnlyMode }
GET /api/config/instance?version={n}            → instance config at version n
GET /api/config/organisms                       → released organisms + displayName + current version
GET /api/config/organisms/{key}                 → { key, version, publishedAt, config }
GET /api/config/organisms/{key}?version={n}     → organism config at version n
```

The read API is **open** — Loculus config holds only non-sensitive data; sensitive values stay in Helm (see [ADR-011](09_architecturalDecisions.md)).

### Admin write API (admin panel only; Keycloak `loculus_administrator` role)

```
GET    /api/admin/config/organisms                          list all organisms (incl. unreleased)
POST   /api/admin/config/organisms                          create unreleased organism (key only)
GET    /api/admin/config/organisms/{key}/draft              read draft (+ pending ops); 204 if none
PUT    /api/admin/config/organisms/{key}/draft              replace draft (unreleased only)
POST   /api/admin/config/organisms/{key}/draft/operations   append operation(s) (released only)
DELETE /api/admin/config/organisms/{key}/draft              discard draft
POST   /api/admin/config/organisms/{key}/publish            publish → new version
GET    /api/admin/config/organisms/{key}/versions           list kept versions
GET    /api/admin/config/instance/draft                     instance draft; 204 if none
PUT    /api/admin/config/instance/draft                     replace instance draft (full document)
POST   /api/admin/config/instance/draft/operations          append instance operation(s)
DELETE /api/admin/config/instance/draft                     discard instance draft
POST   /api/admin/config/instance/publish                   publish instance → new version
GET    /api/admin/config/instance/versions                  list instance versions
GET    /api/admin/config/audit[?organism={key}]             audit-log entries (most recent first)
```

Concurrency on drafts is optimistic: mutating endpoints accept `If-Match: <revision>` and return `409` on mismatch with the current state.
