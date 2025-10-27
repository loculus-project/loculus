The `backend`, `website`, and `integration-tests` directories each contain their own `AGENTS.md` files with additional specific instructions.

Use conventional commits as titles for PRs, e.g. feat(deployment):xx, fix!(website):xx, chore(backend):xx.
Components include: website, backend, deployment, preprocessing, ingest, deposition.

Write detailed PR summaries, not just short bullet points.

## Updating Conda Environment Dependencies

Conda dependencies in `environment.yml` files are not automatically updated by dependabot.
The `maintenance-scripts/` folder contains utilities to help update conda environment versions.
