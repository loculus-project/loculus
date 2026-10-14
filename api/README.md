# Loculus API (v2) — demo

> **Demo / not in use.** Not deployed, not in CI, not called by any client.

A separate service for gradually moving functionality out of the backend behind versioned `/v2/...` routes.
It uses the same stack as the backend (Kotlin, Spring Boot, Exposed) so code can be moved over with little rewriting.

So far it only implements group management.

## Endpoints

| v2                                          | v1 equivalent                                | Auth                               |
| ------------------------------------------- | -------------------------------------------- | ---------------------------------- |
| `GET /v2/groups?name=`                      | `GET /groups?name=`                          | authenticated                      |
| `POST /v2/groups` → `201` + `Location`      | `POST /groups` → `200`                       | authenticated                      |
| `GET /v2/groups/{groupId}`                  | `GET /groups/{groupId}` (`.group`)           | public (email redacted)            |
| `PUT /v2/groups/{groupId}`                  | `PUT /groups/{groupId}`                      | member or superuser                |
| `GET /v2/groups/{groupId}/members`          | `GET /groups/{groupId}` (`.users`)           | authenticated                      |
| `PUT /v2/groups/{groupId}/members/{user}`   | `PUT /groups/{groupId}/users/{user}`         | member or superuser                |
| `DELETE /v2/groups/{groupId}/members/{user}`| `DELETE /groups/{groupId}/users/{user}`      | member or superuser                |
| `GET /v2/me/groups`                         | `GET /user/groups`                           | authenticated                      |

Other differences from v1:

- Group details and members are separate resources instead of one `GroupDetails` object with nullable `users`.
- Lists are ordered by id.
- Error messages say "Group N does not exist." everywhere (v1 sometimes uses "Group(s) N do(es) not exist.").
- Missing or invalid tokens on write requests return `401` (v1 returns `403`, because CSRF protection is on).
- It uses Jackson 3, the Spring Boot 4 default. The backend still uses the Jackson 2 bridge.

## Layout

```
src/main/kotlin/org/loculus/api/
  common/        shared by all features: auth, error handling, config, audit log
  groups/        GroupController, GroupService, GroupTables, GroupTypes, UserDirectory
```

- **One folder per feature.** Moving a feature from the backend means adding one folder plus its tests.
- **One controller per feature**, split only when a feature has distinct audiences with their own URL prefixes and
  access rules (e.g. submission: submitters, preprocessing pipelines, public downloads).
- **Controllers are thin:** request mapping, access annotation, one service call. Logic lives in the service.

## Access control

Each endpoint declares who may call it, on the controller method itself (`common/auth/Access.kt`):

| Annotation                 | Who may call it                                   |
| -------------------------- | ------------------------------------------------- |
| `@Public`                  | anyone, with or without a token                   |
| _(none)_                   | any authenticated user                            |
| `@RequiresRole(role)`      | authenticated users with that Keycloak realm role |

The security filter chain only validates bearer tokens on `/v2/**`, so an invalid token is always a `401`.
`AccessInterceptor` enforces the annotation for the controller method that handles the request, so there is no
separate list of paths to keep in sync. Data-dependent checks (e.g. "member of this group") stay in the service.

The access level is also written into the OpenAPI spec as `x-access` (`public`, `authenticated`, `role:<name>`), and
public endpoints have an empty `security` requirement. `OpenApiTest` fails if an endpoint lacks `x-access`, or if the
set of public endpoints changes without the test being updated.

## Database

The **backend owns the schema**. This service never runs migrations (`spring.flyway.enabled=false`); it reads and
writes the backend's existing tables (`groups_table`, `user_groups_table`, `audit_log`). The table definitions in
`groups/GroupTables.kt` must match the backend's migrations.

To catch drift, the tests create the test database by running the backend's Flyway migrations from
`../backend/src/main/resources/db/migration`.

## Running tests

Requires Docker (Testcontainers) and JDK 25.

```sh
./gradlew test --console=plain
./gradlew ktlintFormat
```

## Running locally

Same database and Keycloak settings as the backend:

```sh
./gradlew bootRun --args='--spring.datasource.url=jdbc:postgresql://localhost:5432/loculus
  --spring.datasource.username=postgres --spring.datasource.password=unsecure
  --spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:8083/realms/loculus/protocol/openid-connect/certs
  --keycloak.user=backend --keycloak.password=backend --keycloak.realm=loculus
  --keycloak.client=backend-client --keycloak.url=http://localhost:8083'
```

Swagger UI: http://localhost:8080/swagger-ui/index.html

## Not done yet

- No Dockerfile, Helm chart, ingress route or CI workflow.
- Code shared with the backend (auth, error handling, table definitions) is copied, not extracted into a shared module.
- No request ID / MDC logging, and no metrics beyond the actuator health endpoint.
