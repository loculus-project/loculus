---
title: Implementing auth for v1 endpoints
description: A developer implementation guide for authentication and identity resolution for v1 endpoints.
---

:::danger[Work in progress]
This guide is an AI-generated first draft and has not yet been reviewed for accuracy.
:::

Use this guide when adding a v1 endpoint that needs a Loculus user identity. The example is `GET /v1/me`; existing unversioned endpoints keep their current behaviour. Resource-authorization examples and migration of existing memberships are deferred.

## 1. Separate authentication, identity and authorization

**Authentication** establishes who is calling. Spring validates the bearer access token before the controller runs. **Identity resolution** maps that authenticated identity to an internal Loculus user ID. **Authorization** decides what that caller may do.

A Loculus user ID is an identity key, not a permission. Provisioning an identity must not grant access to application resources.

`config/SecurityConfig.kt` wires a separate filter chain for `/v1/**`, requiring authentication by default. Version-specific route rules live in `api/v1/V1AccessRules.kt`, which explicitly requires authentication for `GET /v1/me`. Existing endpoints retain their Keycloak authentication converter; both chains share Spring's JWT decoder.

## 2. Give application services a Loculus identity, not a token

Keep authentication-provider details at the application boundary. Spring authenticates the request; `LoculusIdentityResolver` translates the authenticated token into a `LoculusPrincipal`. Application services can then identify the actor without decoding tokens or depending on Keycloak usernames.

For an endpoint that needs a user identity:

1. Receive Spring's authenticated `Jwt` through `@AuthenticationPrincipal`.
2. Call `LoculusIdentityResolver.resolve(jwt)`.
3. Pass the resulting principal to application services that need an actor. Use its immutable `userId` as the identity key.

Do not call `/v1/me` from another endpoint: it is an API for clients to retrieve their own identity, not an internal authentication service. Reuse the resolver directly.

`/v1/me` is the smallest example: it resolves the caller and maps the result to a public response. Imports and OpenAPI annotations are omitted here for readability.

```kotlin
@GetMapping("/v1/me")
fun me(@AuthenticationPrincipal jwt: Jwt): ResponseEntity<MeResponse> =
    ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(identities.resolve(jwt).toResponse())
```

The resolver owns the lookup by `iss` (authentication-provider issuer) and `sub` (account identifier at that issuer). It creates a Loculus user on first use: **just-in-time provisioning (JIT)**. Endpoint implementations should not duplicate this lookup, provisioning or concurrent-request handling.

Human and service accounts follow the same resolution process. An optional `preferred_username` is stored as an initial provider attribute, but is neither required for resolution nor used as the identity key.

## 3. Keep public schemas separate from internal types

`LoculusPrincipal` is an internal service type, not an API response. Define the public contract separately and map to it explicitly.

For `/v1/me`, `Schemas.kt` defines `MeResponse`, and `Mappings.kt` selects only the user ID and provisioning timestamp. Neither external identity details nor provider attributes are exposed by this response.

| Responsibility                   | Example under `backend/src/main/kotlin/org/loculus/backend/`          |
| -------------------------------- | --------------------------------------------------------------------- |
| HTTP route and response handling | `api/v1/me/MeController.kt`                                           |
| Public response schema           | `api/v1/me/Schemas.kt`                                                |
| Internal-to-public mapping       | `api/v1/me/Mappings.kt`                                               |
| Route-level authentication rules | `api/v1/V1AccessRules.kt`                                             |
| Shared identity resolution       | `auth/LoculusIdentityResolver.kt`                                     |
| Internal actor type              | `auth/LoculusPrincipal.kt`                                            |
| Identity persistence             | `service/identity/IdentityDatabaseService.kt` and `IdentityTables.kt` |

Keep controllers thin and business operations in services. Document parameters, response fields and errors in OpenAPI; `@SecurityRequirement` documents authentication but does not enforce it.

## 4. Handle cross-cutting restrictions centrally

An endpoint's HTTP method does not describe every side effect of the services it calls. Check both explicit writes and writes performed by shared infrastructure.

For **read-only mode**, use the existing division of responsibility:

- **HTTP write requests:** `ReadOnlyModeInterceptor` centrally blocks `POST`, `PUT`, `PATCH` and `DELETE`. Do not repeat this check in every controller or treat instance-wide maintenance restrictions as resource permissions.
- **Writes inside otherwise readable operations:** the shared component performing the write must guard it. A `GET` can trigger first-use provisioning, so the identity resolver checks read-only mode before creating records. Endpoints reuse that protection automatically.
- **Calls outside HTTP:** the interceptor does not protect background jobs or direct service calls. Decide where their write restrictions will be enforced rather than assuming the HTTP gate applies.

Do not catch a failed identity lookup or provisioning attempt and continue with reduced checks. Let shared error handling return the failure. Authentication or storage failures must not be treated as anonymous access.

## 5. Test the boundaries

Use `MeControllerTest` for the HTTP contract, `LoculusIdentityResolverTest` for resolution behaviour, and `IdentityDatabaseServiceTest` for transactional persistence. Cover:

- Missing or invalid tokens and unusable identity claims.
- First-use provisioning and repeat requests returning the same identity.
- Concurrent first requests producing one user and one identity link, without orphan records.
- Read-only behaviour, unavailable identity storage and rollback on conflicts.
- Explicit response fields, cache-control headers and generated OpenAPI documentation.
- Existing endpoints retaining their authentication behaviour without triggering provisioning.

Resource-specific authorization needs its own policies and tests when introduced; identity resolution alone does not provide them.
