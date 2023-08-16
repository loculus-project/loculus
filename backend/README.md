# Pathoplexus Backend

## Setup

To start the backend, a PostgreSQL database is required. The schema is specified in [init.sql](src/main/resources/database/init.sql).
The database connection is configured via Spring properties.

The service listens, by default, to **port 8079**.

### Start from docker-compose

We have a [docker-compose config](./docker-compose.yml) to start the backend. For flexibility the docker image name is read from the environment. To use the `:latest` image along with an
instance of the PostgreSQL database, you can just run:

```bash
DOCKER_IMAGE_NAME=ghcr.io/pathoplexus/backend:latest docker compose up
```

To pull the latest version of the image, run:

```bash
docker pull ghcr.io/pathoplexus/backend
```

To only start the database with docker-compose, you can run:

```bash
docker compose up database
```
