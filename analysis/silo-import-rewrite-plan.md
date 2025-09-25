# SILO Import Job Rewrite Plan

## Goals & Constraints
- Reimplement the SILO import workflow in Python so it can live in a dedicated container with Python available.
- Keep SILO itself in its current image while allowing it to consume the data produced by the importer through a shared volume.
- Coordinate the Python importer and the SILO runner through lightweight file-based signalling (as suggested, via touching files) so the stripped-down shell side only invokes `/app/silo`.
- Preserve existing behaviour around ETag handling, hourly hard refreshes, lineage definition downloads, hash-based deduping, and cleanup of cached input/output directories.

## Proposed Architecture
- **Shared Volumes**
  - Reuse the existing `/preprocessing/input` and `/preprocessing/output` emptyDirs for data exchange.
  - Use a simple sentinel file (e.g. `/preprocessing/input/run_silo`) to trigger SILO preprocessing; no additional coordination volume is required.

- **Python Importer Container** (`silo-importer`)
  1. Runs a new `silo_import_job.py` script continuously.
  2. Owns all orchestration logic currently split between `silo_import_job.sh` and `silo_import_wrapper.sh`, including hourly hard refresh decisions.
  3. Executes the full import pipeline whenever a run is scheduled:
     - Determine whether to perform a hard refresh (`last_etag` of `0`) or use cached ETag.
     - Download released data, manage per-run staging directories under `/preprocessing/input/<timestamp>`, verify record counts, and compute hashes to skip redundant runs.
     - Fetch lineage definitions when required (based on pipeline version), writing to `/preprocessing/input/lineage_definitions.yaml`.
     - Copy the staged `data.ndjson.zst` to `/preprocessing/input/data.ndjson.zst` ready for SILO.
     - Trim older cached directories in both `input` and `output` folders, mirroring the current shell logic.
  4. When preprocessing data is ready, touches the sentinel file to request SILO execution and waits for completion markers written by the shell side.

- **SILO Runner Container** (existing lapis-silo image)
  - Replace the current `silo_import_wrapper.sh` with a minimal watcher that:
    1. Waits for the sentinel file to appear (or its mtime to change).
    2. Invokes `/app/silo preprocessing` when triggered.
    3. Writes a completion signal (e.g. removes the sentinel and touches `/preprocessing/input/last_silo_run`) that the Python process observes before proceeding with cleanup/ETag updates.
    4. Exits on failure to allow Kubernetes to restart the pod.

- **File Signalling Details**
  - `run_silo`: created/touched by Python when new data is staged; the shell loop consumes it, runs SILO, then deletes or renames it.
  - `silo_done`: touched by the shell script once `/app/silo` completes so Python can resume and update state.
  - Both markers live alongside existing input files so regular cleanup routines must avoid removing them.

## Implementation Steps
*(Initial iteration kept here for historical context; superseded by the packaging plan below.)*
1. **Python Importer**
   - Create `kubernetes/loculus/silo_import_job.py` encapsulating the current Bash logic plus orchestration duties (ETag handling, downloads, lineage definitions, hard-refresh cadence, sentinel management).
   - Use Python-native dependencies (standard library + `zstandard`) so the container only needs curl via APT and the `zstandard` wheel via `pip`.
   - Implement sentinel-wait logic to block until `silo_done` appears after requesting a run.

2. **Shell Runner Simplification**
   - Rewrite `silo_import_wrapper.sh` to watch for `run_silo`, invoke `/app/silo preprocessing`, then remove/touch completion files.
   - Keep environment variable inputs identical to simplify configuration and rely solely on built-in tooling (no extra package installs).

3. **Helm / Deployment Updates**
   - Add the Python script to the ConfigMap (`lapis-silo-database-config-<organism>`): new data key `silo_import_job.py`.
   - Introduce a new container definition (`silo-importer`) in `templates/silo-deployment.yaml` that runs `python3 /silo_import_job.py` (installing `curl` via `apt-get` and `zstandard` via `pip`) and mounts the same config/output volumes.
   - Mount `silo_import_job.py` into the importer container and mount the simplified `silo_import_wrapper.sh` into the SILO container.
   - Extend `values.yaml` (and schema if required) with an image spec for the importer container (default `python:3.11-slim`) to keep images configurable.

4. **Validation & Docs**
   - Update any architecture notes if necessary.
   - Provide manual verification steps (e.g. helm template diff, container logs expectations) since automated tests may not cover Kubernetes side effects.

## Packaging & Image Plan (next phase)
- Promote the importer into a dedicated Python package under `kubernetes/silo-import`, with a `pyproject.toml`, `src/` layout, and multiple modules (`config`, `paths`, `downloader`, `lineage`, `sentinels`, `runner`, CLI entrypoint).
- Build a slim Docker image (Debian slim base) that installs package dependencies via `pip install .` and includes system tools required by the importer (ideally only `curl`).
- Provide a console entry point (`silo-import`) so the container command is simply the executable, without mounting scripts from ConfigMaps.
- Add a GitHub Actions workflow (`.github/workflows/silo-import-image.yml`) mirroring existing image jobs to publish `ghcr.io/loculus-project/silo-import` for `main`, PRs, and optional ARM builds.
- Update Helm values/templates to consume the new image (remove `silo_import_job.py` from ConfigMap, drop extra mounts, point to `siloImporter` image spec).
- Document build/run instructions in `kubernetes/silo-import/README.md` and ensure linting/py_compile checks remain lightweight.

## Open Questions / Assumptions
- Sentinel filenames (`run_silo`, `silo_done`) are acceptable; we must ensure cleanup scripts exclude them.
- Installing `curl` via APT and `zstandard` via `pip` at container start is acceptable for the importer container.
- No backend API changes are required; the importer continues to call the existing `/get-released-data` endpoint.
- Pod restart semantics are acceptable for error handling (i.e. the shell runner can `exit 1` on failure so Kubernetes retries).
