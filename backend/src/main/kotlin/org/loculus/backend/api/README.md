# API Package

## Folder structure

Unversioned controllers such as `info` and `debug` live at the root of the `api` package, and have their access rules defined in `config/SecurityConfig.kt`.

Otherwise, each subfolder contains one version of the API. These API version packages will themselves contain subfolders for each feature they support (`groups`, `submission`, `query`, etc.).

The structure should look like this:

```
api/
├── debug/
    └── DebugController.kt
├── info/
    └── InfoController.kt
└── vX/
    ├── VXAccessRules.kt
    └── groups/
        ├── GroupController.kt
        ├── Schemas.kt        # optional
        └── Mappings.kt       # optional
    └── submission/
        └── ...
```

Where:

- `VXAccessRules.kt`: defines endpoint access rules for the API version. This file should define a `vXAccessRules` function, which adds access rules for the API version, and this should be called in `config/SecurityConfig.kt` (which remains the 'source of truth' for access rules).
- **Controllers:** defines the endpoints (paths, status codes) and makes calls to services.
- **Schemas (optional):** request/response classes that define this version's API.
- **Mappings (optional):** bridge(s) between the schemas and the services: converting types, plus anything only this version does differently, such as ordering or reshaping results.

Schemas and mappings together let a version define its own API on top of the shared services, so services can change without changing what clients of an existing version see.

## Notes

`v0/` currently does not have its own schemas/mappings - it still pulls its input/output DTOs directly from the internal `types`. This should be refactored soon to separate the `v0` API from internal services.

Logic shared between API versions belongs in the service layer, not in controllers or mappings.
Services, tables and shared types live outside `api/` and are not versioned.
