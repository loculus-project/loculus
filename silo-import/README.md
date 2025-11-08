# SILO Importer

Python controller that retrieves released datasets from the Loculus backend, prepares them
for SILO preprocessing, and directly executes the SILO binary for preprocessing.

The SILO importer downloads data from the Loculus backend and triggers SILO preprocessing only if the following conditions hold:
1. The data is in a valid format (e.g. ndjson format where each line is a valid json, has number of expected records, and the pipeline version exists and is a valid integer if a lineage definition is required).
2. The lineage definitions file can be produced if it is required.
3. The data has changed since the last download or it has been over more than `HARD_REFRESH_INTERVAL` since the last hard refresh. We determine if the data has changed from the header (e.g. 304 not modified) and by comparing a hash of the data.

Data is prepared in the `preprocessing/input/data.ndjson.zst` file, and optionally lineage definitions are placed in `preprocessing/input/lineage_definitions.yaml`. The SILO binary is then executed directly via subprocess to preprocess the data into the `preprocessing/output` directory. 

## Local development

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
BACKEND_BASE_URL="http://localhost:8079/organism" python -m silo_import
```

Environment variables mirror the historical shell scripts:

- `BACKEND_BASE_URL` (required)
- `LINEAGE_DEFINITIONS` (optional JSON mapping `pipelineVersion -> URL`)
- `HARD_REFRESH_INTERVAL` (seconds, default `3600`)
- `POLL_INTERVAL_SECONDS` (default `30`)
- `IMPORT_TIMEOUT_SECONDS` (default `3600`)
- `ROOT_DIR` (optional alternative root for the `/preprocessing` tree)

## Container image

The accompanying `Dockerfile` builds an image that includes:
- This Python package and its dependencies
- The SILO binary compiled from the LAPIS-SILO submodule

The image uses a multi-stage build process:
1. First stage: Compiles SILO from the `LAPIS-SILO` submodule using the pre-built dependency image
2. Second stage: Installs the Python package and copies the SILO binary

A GitHub Actions workflow publishes the final image to `ghcr.io/loculus-project/silo-import`.
