# API

Each folder here is one version of the API (`v0/`, `v1/`, ...), with one sub-folder per feature:

```
api/
└── v1/
    ├── V1SecurityConfig.kt   # access rules for this version's paths
    └── groups/
        ├── GroupController.kt
        ├── Schemas.kt        # optional
        └── Mappings.kt       # optional
```

- **Controller:** the endpoints: paths, status codes and calls to services.
- **Schemas (optional):** the request and response classes that define this version's API.
- **Mappings (optional):** adapt between the schemas and the services: converting types, plus anything only this version does differently, such as ordering or reshaping results.

Schemas and mappings let a version define its own API on top of the shared services, so services can change without changing what clients of an existing version see.
A feature can leave them out and use the shared `types/` directly, as `v0/` does.

Rules that every version must agree on, such as permissions and validation, belong in the services, not in controllers or mappings.
Services, tables and shared types live outside `api/` and are not versioned.
