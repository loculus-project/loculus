# Taxonomy Service

A FastAPI service that exposes NCBI taxonomy data via a REST API.
Used by Loculus for taxon lookups and scientific host name validation.

The taxonomy database is built and uploaded to S3 by the [`ncbi_tax_download`](../ncbi_tax_download/README.md) module.

The `taxonomy-service` is set up to run in a docker container (see the [`Dockerfile`](./Dockerfile)).
This container downloads the DB from S3, so the service has access to it directly in the container.

## API

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check |
| `GET /taxa?name=<scientific_name>` | Look up a taxon by scientific name (case-insensitive) |
| `GET /taxa/{tax_id}` | Look up a taxon by NCBI taxon ID |
| `GET /taxa/{tax_id}/common_name` | if `tax_id` has a common name, return the taxon itself. If it has no common name, return the nearest ancestor with a common name  |

## Setup & Running

### Using the micromamba environment
Set up the environment, install the service

```sh
micromamba env create -f environment.yaml
micromamba activate loculus-taxonomy-service
pip install -e .
```

Download the taxonomy database and unzip it

```sh
curl -L https://loculus-public.hel1.your-objectstorage.com/taxonomy/ncbi_taxonomy_latest.sqlite.gz \
    -o ncbi_taxonomy_latest.sqlite.gz && \
    gunzip ncbi_taxonomy_latest.sqlite.gz
```

Create a `config.yaml`

```yaml
tax_db_path: "/path/to/ncbi_taxonomy_latest.sqlite"  # path to DB on your machine
```

Run the service

```sh
taxonomy_service --config-file /path/to/config.yaml
```

### Using the docker container
Build the Docker image:

```sh
docker build -t loculus-taxonomy-service .
```

The service requires a config file mounted into the container. Create a `config_docker.yaml`:

```yaml
tax_db_path: "/opt/app/ncbi_taxonomy_latest.sqlite"  # path inside the container
tax_service_host: "0.0.0.0"
tax_service_port: 5000          # defaults to 5000
log_level: INFO                 # defaults to DEBUG
```

Then run the container with the config directory bind-mounted:

```sh
docker run \
  -v /path/to/config/dir:/opt/app/config:ro \
  -p 5000:5000 \
  loculus-taxonomy-service \
  taxonomy_service --config-file=/opt/app/config/config_docker.yaml
```

## Tests

Tests can be run from this directory:

```sh
micromamba activate loculus-taxonomy-service
pytest
```
