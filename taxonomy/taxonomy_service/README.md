# Taxonomy Service

A FastAPI service that exposes NCBI taxonomy data via a REST API.
Used by Loculus for taxon lookups and scientific host name validation.

The taxonomy database is built and uploaded to S3 by the [`ncbi_tax_download`](../ncbi_tax_download/README.md) module.

The `taxonomy-service` is set up to run in a docker container (see the [`Dockerfile`](./Dockerfile)).
In Kubernetes, the taxonomy database is downloaded at pod startup by an init container and mounted into the service container via a shared volume. The DB version and checksum are configured in the Helm values (`taxonomyService.dbVersion` and `taxonomyService.dbSha256`).

## API

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check |
| `GET /taxa?name=<scientific_name>` | Look up a taxon by scientific name (case-insensitive) |
| `GET /taxa/{tax_id}` | Look up a taxon by NCBI taxon ID |
| `GET /taxa/{tax_id}/common_name` | if `tax_id` has a common name, return the taxon itself. If it has no common name, return the nearest ancestor with a common name  |

## Updating the NCBI database
This service relies on a taxonomy database created by the [`ncbi_tax_download`](../ncbi_tax_download/README.md) module.
The databases are versioned using the creation date: `ncbi_taxonomy_<date>.sqlite`.

The DB version and its checksum are configured in the Helm values file (`kubernetes/loculus/values.yaml`) under `taxonomyService`:

```yaml
taxonomyService:
  dbVersion: "ncbi_taxonomy_2026-03-23"
  dbSha256: "d22610c0877bc0f753576387ee8a237899c5872f04b7561d6d2f3c61738db37f"
```

To update the taxonomy DB:

1) Update `taxonomyService.dbVersion` in the Helm values (important: **don't** include the file extension)
2) Update `taxonomyService.dbSha256` to the sha256 hash of the new DB version. To find this out, run:
```sh
curl -L https://loculus-public.hel1.your-objectstorage.com/taxonomy/<your-database-version>.sqlite.gz \
    | sha256sum | awk '{print $1}'
```

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

The Docker image does not include the taxonomy database. You need to download it separately and mount it into the container (in Kubernetes, this is handled by an init container).

The service requires a config file and the database file mounted into the container. Create a `config_docker.yaml`:

```yaml
tax_db_path: "/data/taxonomy.sqlite"  # path to the mounted DB inside the container
tax_service_host: "0.0.0.0"
tax_service_port: 5000          # defaults to 5000
log_level: INFO                 # defaults to DEBUG
```

Then run the container with the config and database bind-mounted:

```sh
docker run \
  -v /path/to/config.yaml:/opt/app/config.yaml:ro \
  -v /path/to/taxonomy.sqlite:/data/taxonomy.sqlite:ro \
  -p 5000:5000 \
  loculus-taxonomy-service \
  taxonomy_service --config-file=/opt/app/config.yaml
```

## Tests

Tests can be run from this directory:

```sh
micromamba activate loculus-taxonomy-service
pytest
```
