# Loculus Backend

## Setup

All commands mentioned in this section are run from the `backend` directory unless noted otherwise.

### Prerequisites

- Java 21 installed on your system

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
   postgres:latest
   ```

2. Start the backend (including test config):

   ```sh
   ../generate_local_test_config.sh
   ./start_dev.sh
   ```

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

We use Flyway, so that the service can provision an empty/existing DB without any manual steps in between. On startup scripts in `src/main/resources/db/migration` are executed in order, i.e. `V1__*.sql` before `V2__*.sql` if they didn't run before, so that the DB is always up-to-date. (For more info on the naming convention, see [this](https://www.red-gate.com/blog/database-devops/flyway-naming-patterns-matter) blog post.)

The service listens, by default, to **port 8079**: <http://localhost:8079/swagger-ui/index.html>.

Note: When using a postgresSQL development platform (e.g. pgAdmin) the hostname is 127.0.0.1 and not localhost - this is defined in the `deploy.py` file.

### Operating the backend behind a proxy

When running the backend behind a proxy, the proxy needs to set X-Forwarded headers:

- X-Forwarded-For
- X-Forwarded-Proto
- X-Forwarded-Prefix

## Development

### Run tests and lints

The tests use Testcontainers to start a PostgreSQL database. This requires Docker or a Docker-API compatible container runtime to be installed, and the user executing the test needs the necessary permissions to use it. See [the documentation of the Testcontainers](https://java.testcontainers.org/supported_docker_environment/) for details.

```bash
./gradlew test
```

### Run linter

```bash
./gradlew ktlintCheck
```

## Format

```bash
./gradlew ktlintFormat
```

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
