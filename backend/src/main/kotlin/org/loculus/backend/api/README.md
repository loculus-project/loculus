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
        └── Schemas.kt        # optional
    └── submission/
        └── ...
```

Where:

- `VXAccessRules.kt`: defines endpoint access rules for the API version. This file should define a `vXAccessRules` function, which adds access rules for the API version, and this should be called in `config/SecurityConfig.kt` (which remains the 'source of truth' for access rules).
- **Controllers:** defines the endpoints (paths, endpoint descriptions, HTTP methods, status codes) and makes calls to services. Logic specific to that particular API version may live here - for instance, different API versions for the same endpoint may make use of different services.
- **Schemas (optional):** request/response classes for this API version. Each class converts itself to or from the service types:
    - Classes used as request types should have a `toServiceX()` function, to convert from the request to the service type.
    - Classes used as response types should have a `from(...)` function on their companion object to convert from the service type to the response.
    - Together, these allow service types to be shared amongst different API versions, with each version being able to define its own fixed representation for the data types.

## Notes

`v0/` currently has its own schemas for `groups` only. Other features still pull their input/output DTOs directly from the internal `types`. Ideally we should aim to separate the `v0` API from internal service types.

Logic shared between API versions belongs in the service layer, not in controllers or schemas.
Services, tables and shared types live outside `api/` and are not versioned.
