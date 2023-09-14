# Pathoplexus Backend

## Setup

To start the backend, a PostgreSQL database is required. The database connection is configured via Spring properties that need to be passed on startup:

* Via command line argument: `--database.jdbcUrl=jdbc:postgresql://localhost:5432/pathoplexus`
* Via environment variable: `SPRING_APPLICATION_JSON={"database":{"jdbcUrl":"jdbc:postgresql://localhost:5432/pathoplexus"}}`

We use Flyway, so that the service can provision an empty/existing DB without any manual steps in between. On startup scripts in `src/main/resources/db/migration` are executed in order, i.e. `V1__*.sql` before `V2__*.sql` if they didn't run before, so that the DB is always up-to-date. (For more info on the naming convention, see [this](https://www.red-gate.com/blog/database-devops/flyway-naming-patterns-matter) blog post.)

The service listens, by default, to **port 8079**.

### Start from docker-compose

Make sure you have configured access to the private container registry (see [/README.md](../README.md)).

We have a [docker-compose config](./docker-compose.yml) to start the backend. For flexibility the docker image name is read from the environment. To use the `:latest` image along with an
instance of the PostgreSQL database, you can just run:

```bash
DOCKER_IMAGE_NAME=ghcr.io/pathoplexus/backend:latest docker compose up
```

You can then access the backend at <http://127.0.0.1:8079/swagger-ui/index.html> :tada:

To pull the latest version of the image, run:

```bash
docker pull ghcr.io/pathoplexus/backend
```

You may need to run `docker compose down` when the image is updated before running `docker compose up`. This will delete the database and create a new one and can be helpful when breaking changes occur (after release migration scripts will keep the database schema up-to-date and this should not be necessary). Run:

```bash
DOCKER_IMAGE_NAME=ghcr.io/pathoplexus/backend:latest docker compose down
```

To only start the database with docker-compose, you can run:

```bash
docker compose up database
```

### Operating the backend behind a proxy

When running the backend behind a proxy, the proxy needs to set X-Forwarded headers:

* X-Forwarded-For
* X-Forwarded-Proto
* X-Forwarded-Prefix

## Development

### Requirements

* Java (tested to work with Java 19 and 20, though other version might work as well)

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
