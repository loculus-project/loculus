# SILO Importer

Python service that retrieves released datasets from the Loculus backend, transforms them
for SILO, and runs SILO preprocessing directly.

The importer downloads data from the Loculus backend, [transforms it into the format required by SILO](https://github.com/GenSpectrum/LAPIS-SILO/tree/main/tools/legacyNdjsonTransformer), and runs SILO preprocessing only if the following conditions hold:
1. The data is in a valid format (e.g. ndjson format where each line is a valid json, has number of expected records, and the pipeline version exists and is a valid integer if a lineage definition is required).
2. The lineage definitions file can be produced if it is required.
3. The data has changed since the last download or it has been over more than `HARD_REFRESH_INTERVAL` since the last hard refresh. We determine if the data has changed from the header (e.g. 304 not modified) and by comparing a hash of the data. 

## Local development

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
cargo install --git https://github.com/GenSpectrum/LAPIS-SILO.git --rev 8d38b2739524cca52857d9d09ff05e9373cea4df
BACKEND_BASE_URL="http://localhost:8079/organism" python -m silo_import
```

Environment variables mirror the historical shell scripts:

- `BACKEND_BASE_URL` (required)
- `LINEAGE_DEFINITIONS` (optional JSON mapping `pipelineVersion -> URL`)
- `HARD_REFRESH_INTERVAL` (seconds, default `3600`)
- `SILO_IMPORT_POLL_INTERVAL_SECONDS` (default `30`)
- `SILO_RUN_TIMEOUT_SECONDS` (default `3600`)
- `ROOT_DIR` (optional alternative root for the `/preprocessing` tree)

## Container image

The accompanying `Dockerfile` builds a minimal image including this package and its
Python dependencies. A GitHub Actions workflow publishes it to `ghcr.io/loculus-project/loculus-silo`.
