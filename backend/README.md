# Pathoplexus Backend

## Setup

To start the backend, a PostgreSQL database is required. The schema is specified in [init.sql](./database/init.sql).
The database connection is configured via Spring properties.

The service listens, by default, to **port 8079**.

### Start from docker-compose

We have a [docker-compose config](./docker-compose.yml) to start the backend using the `:latest` image along with an
instance of the PostgreSQL database. You can just run:

```bash
docker compose up
```

To only start the database with docker-compose, you can run:

```bash
docker compose up database
```
