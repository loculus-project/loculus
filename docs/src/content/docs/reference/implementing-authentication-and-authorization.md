---
title: Implementing auth for v1 endpoints
description: A developer implementation guide for authentication and authorization for v1 endpoints.
---

:::danger[Work in progress]
This guide is an AI-generated first draft and has not yet been reviewed for accuracy.
:::

Use this guide when adding a v1 endpoint that needs to identify a caller or decide what they may access. The examples use `/v1/me` and `/v1/groups`; existing unversioned endpoints keep their current authentication and authorization behaviour.

## 1. Decide what the endpoint requires

**Authentication** establishes who is calling. Spring validates the bearer access token before the controller runs. **Identity resolution** maps that authenticated identity to an internal Loculus user ID. **Authorization** decides what that caller may do.

These are separate decisions. A Loculus user ID does not grant access to a group.

| Endpoint                   | Authentication | Loculus identity resolution | Application policy                                                                                                   |
| -------------------------- | -------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/me`               | Required       | Yes                         | Return the caller's own user ID and provisioning timestamp.                                                          |
| `GET /v1/groups`           | Required       | Yes                         | List only groups the caller belongs to, with no superuser bypass.                                                    |
| `POST /v1/groups`          | Required       | Yes                         | Allow authenticated accounts, including service accounts, to create a group and become a member.                     |
| `GET /v1/groups/{groupId}` | Optional       | No                          | Return public details anonymously; include email and members for any authenticated caller, regardless of membership. |

`config/SecurityConfig.kt` wires a separate filter chain for `/v1/**` that requires authentication by default. Declare public exceptions in `api/v1/V1AccessRules.kt`, not by accepting an unchecked token in a controller. A supplied invalid bearer token is rejected even on the public group-details endpoint. The existing endpoints retain their own access rules and Keycloak authentication converter; both chains share Spring's JWT decoder.

## 2. Give application services a Loculus identity, not a token

Keep authentication-provider details at the boundary of the application. Spring authenticates the request; `LoculusIdentityResolver` translates the authenticated token into a `LoculusPrincipal`. Application services then use that principal to identify the actor, without decoding tokens or knowing how Keycloak represents an account.

For an endpoint that needs a user identity:

1. Receive Spring's authenticated `Jwt` through `@AuthenticationPrincipal`.
2. Call `LoculusIdentityResolver.resolve(jwt)` to obtain the principal.
3. Pass that principal to the application service. Use its immutable `userId` as the identity key, not an email address or username.

Do not call `/v1/me` from another endpoint: it is an API for clients to retrieve their identity, not an internal authentication service. Reuse the resolver directly.

`/v1/me` is the smallest example of this boundary: it resolves the caller and maps the result to a public response. Examples omit imports and OpenAPI annotations for readability.

```kotlin
@GetMapping("/v1/me")
fun me(@AuthenticationPrincipal jwt: Jwt): ResponseEntity<MeResponse> =
    ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(identities.resolve(jwt).toResponse())
```

The resolver owns the lookup by `iss` (authentication-provider issuer) and `sub` (account identifier at that issuer), and creates a Loculus user on first use: **just-in-time provisioning (JIT)**. Endpoint implementations should not duplicate this lookup, provisioning or concurrent-request handling.

`LoculusPrincipal` is an internal service type, not an API response or a grant of permission. Keep public schemas separate: here, `MeResponse` and its mapping expose only the user ID and provisioning timestamp.

## 3. Enforce resource policies in the service layer

The controller handles HTTP; the application service coordinates the operation and invokes the resource's authorization service. Keeping permission checks here means another controller can reuse the operation without having to recreate its access rules.

For example, the group-list controller delegates to:

```kotlin
groups.list(identities.resolve(jwt), limit, after).toResponse()
```

`GroupService.list()` applies membership filtering through `GroupAuthorizationService` and the database query. The current compatibility bridge supplies a username; callers of the service still pass a `LoculusPrincipal`:

```kotlin
val username = authorization.membershipUsername(actor)
val rows = database.getMembershipGroups(username, limit + 1, after)
```

The database filters by membership **before** applying pagination. Fetching all groups and filtering the response afterwards would give incorrect pages and move access filtering out of the service/database boundary.

:::caution[Temporary username compatibility]
Existing group memberships use usernames. `GroupAuthorizationService.membershipUsername()` bridges the Loculus principal to the `preferred_username` saved in `external_identities` when it was linked.

This preserves the existing username-based behaviour. Keycloak currently prevents username edits, but that does not prevent a deleted account's username being reused. Migrate membership lookups to Loculus user IDs before v1 stabilises. Do not spread this compatibility lookup into controllers or treat usernames as durable identity keys.
:::

### Keep related writes in one transaction

`GroupController.create()` validates `CreateGroupRequest`, resolves the caller and maps the request into a service input:

```kotlin
val group = groups.create(identities.resolve(jwt), request.toServiceInput())
return ResponseEntity.created(URI.create("/v1/groups/${group.groupId}"))
    .cacheControl(CacheControl.noStore())
    .body(group.toResponse())
```

`GroupService.create()` uses the same membership bridge. The database operation creates the group, creator membership and audit entry in one transaction. Identity provisioning is a separate transaction: a failed group creation can leave a valid Loculus user, but must not leave a partially created group.

Choose the transaction boundary around the complete application operation, not each individual database write. Future resource-specific permission checks belong in the authorization service and must be called by the application service, not implemented only in the controller.

### Resolve identity only when the policy needs it

Group details only need to know whether authentication succeeded, not the caller's Loculus ID. The controller therefore accepts a nullable authenticated principal and deliberately skips JIT:

```kotlin
groups.details(groupId, authenticated = jwt != null).toResponse()
```

`GroupService.details()` calls `GroupAuthorizationService.canViewPrivateDetails()` to select visibility. Anonymous callers receive `null` for email and members; authenticated callers receive those fields. This is the policy for this endpoint, not a general rule that authentication grants access to every resource.

## 4. Handle cross-cutting restrictions centrally

An endpoint's HTTP method does not describe every side effect of the services it calls. When adding an API, check both its explicit writes and any writes performed by shared infrastructure.

For **read-only mode**, use the existing division of responsibility:

- **HTTP write requests:** `ReadOnlyModeInterceptor` centrally blocks `POST`, `PUT`, `PATCH` and `DELETE`. Do not repeat this check in every controller or turn instance-wide maintenance restrictions into resource permissions.
- **Writes inside otherwise readable operations:** the shared component that performs the write must guard it. Identity resolution is an example: a `GET` can trigger first-use provisioning, so the resolver checks read-only mode before creating records. Endpoints reuse that protection automatically.
- **Calls outside HTTP:** the interceptor does not protect background jobs or direct service calls. If adding such a caller, explicitly decide where its write restrictions will be enforced rather than assuming the HTTP gate applies.

Do not catch a failed identity lookup or provisioning attempt and continue with reduced checks. Let the shared error handling return the failure. Optional authentication means that an anonymous request is allowed by policy—not that authentication or storage failures should be treated as anonymous requests.

## 5. Keep contracts separate from services

Use the existing examples as a starting point:

| Responsibility                                      | Example under `backend/src/main/kotlin/org/loculus/backend/`                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Receive requests and return HTTP responses          | `api/v1/me/MeController.kt`, `api/v1/groups/GroupController.kt`                                            |
| Define public response/request types and validation | `api/v1/me/MeResponse.kt`, `api/v1/groups/Schemas.kt`                                                      |
| Translate public and internal types                 | Each endpoint package's `Mappings.kt`                                                                      |
| Resolve authenticated identities                    | `auth/LoculusIdentityResolver.kt`                                                                          |
| Apply resource policies and coordinate operations   | `service/groupmanagement/GroupAuthorizationService.kt`, `GroupService.kt`                                  |
| Read and write stored identities or memberships     | `service/identity/IdentityDatabaseService.kt`, `service/groupmanagement/GroupManagementDatabaseService.kt` |

Pass `LoculusPrincipal` to services that need an actor, rather than passing raw tokens. Return explicitly mapped response types rather than database records. Add OpenAPI descriptions for authentication, parameters, response fields and errors; `@SecurityRequirement` documents authentication but does not enforce it.

## 6. Test the boundary as well as the happy path

Use `MeControllerTest` and `GroupControllerTest` for HTTP examples, and the resolver, authorization, service and database tests for the underlying behaviour. For another endpoint, cover:

- Missing and invalid tokens, plus anonymous behaviour if the endpoint is public.
- First-use provisioning and repeat requests where identity resolution is required; no provisioning where it is not.
- Allowed and denied resource access, including callers who are authenticated but not members.
- Read-only behaviour, unavailable identity storage and transaction rollback for writes.
- Response schemas, validation and OpenAPI output. For lists, test access filtering together with pagination.

Keep new policies scoped to the new endpoints, and retain regression coverage for existing unversioned behaviour.
