# Pathoplexus Backend

## Setup

All commands mentioned in this section are run from the `backend` directory.

### Prerequisites

* Java 20 installed on your system
* A running PostgreSQL database

The easiest way to start a PostgreSQL database is to use Docker compose:

```bash
DOCKER_IMAGE_NAME=doesNotMatterHere docker compose up database
```

### Starting the backend

The database connection is configured via Spring properties that need to be passed on startup:

* Via command line argument (also see docker-compose.yml): 
```
--database.jdbcUrl=jdbc:postgresql://localhost:5432/pathoplexus
--database.username=postgres
--database.password=unsecure
```
* Via environment variable: `SPRING_APPLICATION_JSON={"database":{"jdbcUrl":"jdbc:postgresql://localhost:5432/pathoplexus","username":"postgres","password":"unsecure"}}`

We use Flyway, so that the service can provision an empty/existing DB without any manual steps in between. On startup scripts in `src/main/resources/db/migration` are executed in order, i.e. `V1__*.sql` before `V2__*.sql` if they didn't run before, so that the DB is always up-to-date. (For more info on the naming convention, see [this](https://www.red-gate.com/blog/database-devops/flyway-naming-patterns-matter) blog post.)

The service listens, by default, to **port 8079**: <http://localhost:8079/swagger-ui/index.html>.

#### Start from command line: 
```bash
./gradlew bootRun --args='--database.jdbcUrl=jdbc:postgresql://localhost:5432/pathoplexus --database.username=postgres --database.password=unsecure'
```
or
```bash
SPRING_APPLICATION_JSON='{"database":{"jdbcUrl":"jdbc:postgresql://localhost:5432/pathoplexus","username":"postgres","password":"unsecure"}}' ./gradlew bootRun
```

#### Start from docker-compose

Build an image and start it along with the database:

```bash
./gradlew bootBuildImage --imageName=pathoplexus-backend
DOCKER_IMAGE_NAME=pathoplexus-backend docker compose up
```

`docker compose up backend` will start the backend only.

We have a GitHub action that builds and pushes the image to the GitHub container registry.
Make sure you have configured access to the private container registry (see [/README.md](../README.md)).
To run the latest version of the image, run:

```bash
docker pull ghcr.io/pathoplexus/backend
DOCKER_IMAGE_NAME=ghcr.io/pathoplexus/backend:latest docker compose up
```

You may need to run `docker compose down` when the image is updated before running `docker compose up`.
This will delete the database and create a new one and can be helpful when breaking changes occur.
In the early development phase, we will introduce breaking changes to the database schema frequently.
Run:

```bash
DOCKER_IMAGE_NAME=ghcr.io/pathoplexus/backend:latest docker compose down
```

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

### Run tests and lints

```bash
./gradlew test
./gradlew ktlintCheck
```

## Logs

The backend stores its logs in `./log/backend.log`, relative to the working directory.
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
