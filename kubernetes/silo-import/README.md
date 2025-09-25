# SILO Importer

Python controller that retrieves released datasets from the Loculus backend, prepares them
for SILO preprocessing, and coordinates with the existing SILO container via sentinel files.

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
- `SILO_IMPORT_POLL_INTERVAL_SECONDS` (default `30`)
- `SILO_RUN_TIMEOUT_SECONDS` (default `3600`)
- `ROOT_DIR` (optional alternative root for the `/preprocessing` tree)

## Container image

The accompanying `Dockerfile` builds a minimal image that installs this package and its
Python dependencies. A GitHub Actions workflow publishes it to `ghcr.io/loculus-project/silo-import`.
