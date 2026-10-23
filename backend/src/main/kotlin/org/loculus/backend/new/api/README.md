# API versions

Each folder here (`v1/`, `v2/`, ...) holds one API version: per feature, a controller, `Schemas.kt` (request and response shapes) and `Mappings.kt`.
Services and tables live outside `api/` and are not versioned.

Endpoints go `fromRequest()` → service → `toResponse()`, so each version keeps its responses the same when the service changes.

**A version promises:** its paths, request and response shapes, and status codes for normal use.
Changing any of these needs a new version. New fields and endpoints go into the current version.

**A version doesn't promise:** bug fixes, security fixes and error message wording. These change for all versions at once.

If a change breaks an older version's tests, either fix its mapping (promised behaviour) or update the test in the same PR (anything else).
