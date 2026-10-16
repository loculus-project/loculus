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

- the url to fetch the public key for JWT verification
  (corresponding to the `jwks_uri` value in the `/.well-known/openid-configuration` endpoint of the Keycloak server):

```sh
--spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:8083/realms/loculus/protocol/openid-connect/certs
```

We use Flyway, so that the service can provision an empty/existing DB without any manual steps in between. On startup scripts in `core/src/main/resources/db/migration` are executed in order, i.e. `V1__*.sql` before `V2__*.sql` if they didn't run before, so that the DB is always up-to-date. (For more info on the naming convention, see [this](https://www.red-gate.com/blog/database-devops/flyway-naming-patterns-matter) blog post.)

Note: When using a PostgreSQL development platform (e.g. pgAdmin) the hostname is 127.0.0.1 and not localhost - this is defined in the `deploy.py` file.

Note that we also use flyway in the ena-submission pod to create an additional schema in the database, ena-submission. This schema is not added here.

### Operating the backend behind a proxy

When running the backend behind a proxy, the proxy needs to set X-Forwarded headers:

- X-Forwarded-For
- X-Forwarded-Proto
- X-Forwarded-Prefix

## Development

### Project structure

The backend is one Spring Boot application, built from several Gradle modules:

| Module | Contents |
| --- | --- |
| `core` | Code that both API versions use: authentication, error handling, the database schema (Flyway migrations and table definitions) and shared services such as group management. Its test fixtures (`core/src/testFixtures`) hold test helpers shared by the other modules. |
| `v1` | The current API and its implementation. |
| `v2` | The new API, served under `/v2`. It may depend on `core`, never on `v1`. |
| `app` | The application itself (`BackendApplication` and its configuration). It contains `core`, `v1` and `v2` and builds the `backend.jar`. |

Within each module, code is organised by layer (`controller`, `service`, `config`, `auth`, ...), as in v1. v2's code lives under the `org.loculus.backend.v2` package.

When v2 needs code that is still in v1, move that code to `core`, or write a new version in `v2`. Only move what v2 actually uses; whatever is left in `v1` will be deleted together with it.

v2 has its own security filter chain (`V2Config`), set up like v1's: every v2 endpoint requires a token, except the public ones listed there. Public endpoints are also marked with an empty `@SecurityRequirements`, so that the API docs say they need no token. `PublicEndpointsTest` checks that the two agree.

Each module has its own tests: `./gradlew :v2:test` runs only v2's tests, against an application that contains `core` and `v2` but not `v1`.

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
