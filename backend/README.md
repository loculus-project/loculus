# Loculus Backend

## Setup

All commands mentioned in this section are run from the `backend` directory unless noted otherwise.

### Prerequisites

* Java 21 installed on your system
* A running PostgreSQL database (e.g. via a local [Kubernetes deployment](../kubernetes/README.md))])

### Starting the backend

#### TLDR

```bash
../generate_local_test_config.sh
./start_dev.sh
```

#### Details

The backend is configured via
[Spring properties](https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.external-config)
that need to be passed on startup, e.g. via command line argument.
You need to set:
* the database URL, username and password:
```
--spring.datasource.url=jdbc:postgresql://localhost:5432/loculus
--spring.datasource.username=postgres
--spring.datasource.password=unsecure
```
* the path to the config file (use `../generate_local_test_config.sh` to generate this file):
```
--loculus.config.path=../website/tests/config/backend_config.json
```
* the url to fetch the public key for JWT verification 
  (corresponding to the `jwks_uri` value in the `/.well-known/openid-configuration` endpoint of the Keycloak server):
```
--spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:8083/realms/loculus/protocol/openid-connect/certs
```

We use Flyway, so that the service can provision an empty/existing DB without any manual steps in between. On startup scripts in `src/main/resources/db/migration` are executed in order, i.e. `V1__*.sql` before `V2__*.sql` if they didn't run before, so that the DB is always up-to-date. (For more info on the naming convention, see [this](https://www.red-gate.com/blog/database-devops/flyway-naming-patterns-matter) blog post.)

The service listens, by default, to **port 8079**: <http://localhost:8079/swagger-ui/index.html>.

### Operating the backend behind a proxy

When running the backend behind a proxy, the proxy needs to set X-Forwarded headers:

* X-Forwarded-For
* X-Forwarded-Proto
* X-Forwarded-Prefix

## Development

### Build docker image

In the `backend` directory run:

```bash
./gradlew bootBuildImage
```

Check the deployment for how to run the image.

### Run tests and lints

```bash
./gradlew test
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
