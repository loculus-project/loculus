# Loculus Backend

## Setup

All commands mentioned in this section are run from the `backend` directory unless noted otherwise.

### Prerequisites

- [Java 25](https://adoptium.net/de/temurin/releases) – You can do this with [SDKMAN!](https://sdkman.io/).

### Starting the backend

#### TLDR

1. Start the database as a daemon (if not already running):

   ```sh
   docker run -d \
   --name loculus_postgres \
   -e POSTGRES_DB=loculus \
   -e POSTGRES_USER=postgres \
   -e POSTGRES_PASSWORD=unsecure \
   -p 5432:5432 \
   postgres:15.19
   ```

2. Start the backend (including test config):

   ```sh
   ../generate_local_test_config.sh
   ./start_dev.sh
   ```

The service listens, by default, to **port 8079**: <http://localhost:8079/swagger-ui/index.html>. The test config will be written to `loculus/website/tests/config`.

3. Clean up the database when done:

   ```sh
   docker stop loculus_postgres
   ```

#### Details

The backend is configured via
[Spring properties](https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.external-config)
that need to be passed on startup, e.g. via command line argument.
You need to set:

- the database URL, username and password:

```sh
--spring.datasource.url=jdbc:postgresql://localhost:5432/loculus
--spring.datasource.username=postgres
--spring.datasource.password=unsecure
```

- the path to the config file (use `../generate_local_test_config.sh` to generate this file):

```sh
--loculus.config.path=../website/tests/config/backend_config.json
```

- the URL to fetch public signing keys for JWT verification
  (corresponding to the `jwks_uri` value in the realm's `/realms/loculus/.well-known/openid-configuration` endpoint):

```sh
--spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:8083/realms/loculus/protocol/openid-connect/certs
```

- the expected issuer, which must exactly match the access token's `iss` claim
  (corresponding to the `issuer` value in the realm's `/realms/loculus/.well-known/openid-configuration` endpoint):

```sh
--spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:8083/realms/loculus
```

Both settings are required and serve different purposes:

- **`jwk-set-uri`: where to fetch public signing keys** to verify token signatures. This can be an internal service URL.
- **`issuer-uri`: which issuer to trust.** The token's `iss` must exactly match this value. We configure `jwk-set-uri` separately so the backend can fetch signing keys through the internal network, even when the issuer uses a public HTTPS URL. For example, the preprocessing pipeline in Pathoplexus production requests tokens from Keycloak over internal HTTP, but those tokens identify the public HTTPS issuer. The backend validates that issuer while fetching signing keys internally.

The backend checks that each token has a valid signature, is within its allowed validity period,
and names the issuer configured by the operator. It does not trust an issuer simply because a token names it.

Helm derives it from the public Keycloak URL (`public.keycloakUrl` when overridden) plus
`/realms/loculus`; standard chart upgrades need no manual Keycloak changes. Standalone backend
launches must supply it explicitly.

`start_dev.sh` and IntelliJ default to the localhost issuer above. For a different issuer,
edit the IntelliJ argument or run:

```sh
OIDC_ISSUER_URI=https://authentication.example.org/realms/loculus ./start_dev.sh
```

This changes only the expected issuer, not the JWKS URL or other Keycloak connection settings.
Website `--from-live` configuration does not set these backend properties either.
Missing or mismatched token issuers produce `401`; matching existing tokens need no renewal.
Verify browser and pipeline issuers before upgrading a custom deployment.

We use Flyway, so that the service can provision an empty/existing DB without any manual steps in between. On startup scripts in `src/main/resources/db/migration` are executed in order, i.e. `V1__*.sql` before `V2__*.sql` if they didn't run before, so that the DB is always up-to-date. (For more info on the naming convention, see [this](https://www.red-gate.com/blog/database-devops/flyway-naming-patterns-matter) blog post.)

Note: When using a PostgreSQL development platform (e.g. pgAdmin) the hostname is 127.0.0.1 and not localhost - this is defined in the `deploy.py` file.

Note that we also use flyway in the ena-submission pod to create an additional schema in the database, ena-submission. This schema is not added here.

### Operating the backend behind a proxy

When running the backend behind a proxy, the proxy needs to set X-Forwarded headers:

- X-Forwarded-For
- X-Forwarded-Proto
- X-Forwarded-Prefix

## Development

### Run tests and lints

The tests use [Testcontainers](https://testcontainers.com/) to start a PostgreSQL database.
This requires Docker or a Docker-API compatible container runtime to be installed and running,
and the user executing the test needs the necessary permissions to use it.
See [the documentation of the Testcontainers](https://java.testcontainers.org/supported_docker_environment/) for details.

```bash
./gradlew test
```

### Run linter

```bash
./gradlew ktlintCheck
```

### Format

```bash
./gradlew ktlintFormat
```

### Upgrading Gradle

1. Check the Kotlin Gradle plugin version in `build.gradle` (plugins block).
2. Look up the max supported Gradle for that Kotlin version in the compatibility table: https://kotlinlang.org/docs/gradle-configure-project.html#apply-the-plugin.
3. If the target Gradle version is supported, run `./gradlew wrapper --gradle-version=<version> && ./gradlew wrapper` to regenerate the wrapper, commit the changed wrapper files, then validate with `./gradlew test --console=plain` and `./gradlew ktlintFormat`.

## Logs

The backend writes logs to stdout and stores them logs in `./log/backend.log`, relative to the working directory.
Details on potential problems are most likely found there.
In the Docker container, the logs can be found in `/workspace/log/backend.log`.

Once per day, the log file is rotated and compressed. Old log files are stored in `./log/archived/`.

## Swagger UI

The backend provides a Swagger UI at <http://localhost:8079/swagger-ui/index.html>.
We use Swagger to document the API and to provide a playground for testing the API.
Especially for manual testing during the development, this is very useful.

OpenAPI does not deal well with NDJSON.
Since the API has endpoints that deal with NDJSON, the documentation of those endpoints is to be understood as
"the provided schema is a valid JSON schema for each line of the NDJSON file".

The Swagger UI and OpenAPI specification is generated via the [Springdoc plugin](https://springdoc.org/).

## Loculus identity and new API authorization

New controllers can explicitly resolve a Spring-authenticated JWT through `LoculusIdentityResolver`
to obtain a Loculus user ID. Existing endpoints keep their current authentication and authorization.
The initial endpoint is `/v1/me`, which returns the caller's Loculus user ID and provisioning timestamp.
Controllers and public schemas live in `org.loculus.backend.api.v1`; shared logic stays
in `auth` and `service`. Existing group endpoints and membership storage are unchanged.

See the [implementation guide](../docs/src/content/docs/reference/implementing-authentication-and-authorization.md)
for an example using the v1 identity endpoint. Resource-authorization examples are deferred.
