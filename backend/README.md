# Pathoplexus Backend

## Setup

To start the backend, a PostgreSQL database is required. The schema is specified in [init.sql](./database/init.sql).
To configure the database connection, set the following environment variables:

```
DATABASE_HOST
DATABASE_PORT
DATABASE_NAME
DATABASE_USERNAME
DATABASE_PASSWORD
```

The service listen, by default, to **port 8079**.

### Start from docker-compose

We have a [docker-compose config](./docker-compose.yml) to start the backend using the `:main` image along with an
instance of the PostgreSQL database. You can just run:

```bash
docker compose up
```

To only start the database with docker-compose, you can run:

```bash
docker compose up database
```
