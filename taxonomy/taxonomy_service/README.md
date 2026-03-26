# Taxonomy Service

A FastAPI service that exposes NCBI taxonomy data via a REST API.
Used by Loculus for taxon lookups and scientific host name validation.

The taxonomy database is built and uploaded to S3 by the [`ncbi_tax_download`](../ncbi_tax_download/README.md) module.

The `taxonomy-service` is set up to run in a docker container (see the [`Dockerfile`](./Dockerfile)).
In Kubernetes, the taxonomy database is downloaded at pod startup by an init container and mounted into the service container via a shared volume.
The DB version is configured in `values.yaml` (`taxonomyService.dbVersion`).

## API

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check |
| `GET /taxa?scientific_name=<string>` | Endpoint used to validate user input. If the input is valid, the details of all associated taxa are returned. Currently only supports validation of scientific names (case-insensitive) through the `scientific_name` query parameter. |
| `GET /taxa/{tax_id}?find_common_name=<boolean>` |  Endpoint to use once a valid taxon ID is found. Looks up a taxon by NCBI taxon ID and returns it. If find_common_name=true, returns the nearest ancestor (including self) that has a common name. |

## Updating the NCBI database

This service relies on a taxonomy database created by the [`ncbi_tax_download`](../ncbi_tax_download/README.md) module.
The databases are versioned using the creation date: `ncbi_taxonomy_<date>.sqlite`.

The DB version is configured in the Helm values file (`kubernetes/loculus/values.yaml`) under `taxonomyService`:

```yaml
taxonomyService:
  dbVersion: "ncbi_taxonomy_latest"
```

By default, this downloads the latest version of the database.
To use a specific version instead, set dbVersion to e.g., "ncbi_taxonomy_2026-03-23" (important: **do not** include the file extension here).
You can get an overview of the available database versions by running:

```sh
s3cmd ls s3://loculus-public/taxonomy/ \
    --host=hel1.your-objectstorage.com \
    --host-bucket=loculus-public.hel1.your-objectstorage.com \
    --access_key=<your_access_key> \
    --secret_key=<your_secret_key>
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
