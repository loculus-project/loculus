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
| `GET /taxa?scientific_name=<string>` | Endpoint used to validate user input. If the input is valid, the details of the taxon are returned. Currently only supports validation of scientific names (case-insensitive) through the `scientific_name` query parameter. |
| `GET /taxa/{tax_id}?find_common_name=<boolean>` |  Endpoint to use once a valid taxon ID is found. Looks up a taxon by NCBI taxon ID. If find_common_name=true, returns the nearest ancestor (including self) that has a common name. |

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
Navigate to the `loculus/taxonomy/taxonomy_service` directory, set up the environment, and install the service:

```sh
micromamba env create -f environment.yaml
micromamba activate loculus-taxonomy-service
pip install -e .
```

Download the taxonomy database and unzip it:

```sh
curl -L https://loculus-public.hel1.your-objectstorage.com/taxonomy/ncbi_taxonomy_latest.sqlite.gz \
    -o ncbi_taxonomy_latest.sqlite.gz && \
    gunzip ncbi_taxonomy_latest.sqlite.gz
```

Create a new file `config/config_local.yaml` containing:

```yaml
tax_db_path: "./ncbi_taxonomy_latest.sqlite"  # path to DB on your machine
```

Run the service:

```sh
taxonomy_service --config-file ./config/config_local.yaml
```

### Using the docker container
Navigate to the `loculus/taxonomy/taxonomy_service` directory and build the Docker image:

```sh
docker build -t loculus-taxonomy-service .
```

The Docker image does not include the taxonomy database.
You need to download it separately using the same command shown in the 'Using the micromambda environment' section, we will then mount the database into the container (in Kubernetes, this is handled by an init container).

Once you've downloaded the database, create a new file `config/config_docker.yaml`:

```yaml
tax_db_path: "/data/ncbi_taxonomy_latest.sqlite"  # path to the mounted DB inside the container
tax_service_host: "0.0.0.0"     # defaults to 127.0.0.1
tax_service_port: 5000          # defaults to 5000
log_level: INFO                 # defaults to DEBUG
```

Then run the container with the config and database bind-mounted:

```sh
docker run \
  -v ./config/config_docker.yaml:/opt/app/config_docker.yaml:ro \
  -v ./ncbi_taxonomy_latest.sqlite:/data/ncbi_taxonomy_latest.sqlite:ro \
  -p 5000:5000 \
  loculus-taxonomy-service \
  taxonomy_service --config-file=/opt/app/config_docker.yaml
```

## Tests

Tests can be run from this directory:

```sh
micromamba activate loculus-taxonomy-service
pytest
```
