The `backend`, `website`, and `integration-tests` directories each contain their own `AGENTS.md` files with additional specific instructions.

Use conventional commits as titles for PRs, e.g. feat(deployment):xx, fix!(website):xx, chore(backend):xx.
Components include: website, backend, deployment, preprocessing, ingest, deposition.

Write detailed PR summaries, not just short bullet points.

## Updating Conda Environment Dependencies

Conda dependencies in `environment.yml` files are not automatically updated by dependabot.
To update them manually:

1. **Check for updates**: Use the script `scripts/check_conda_versions.py` to check which
   packages have newer versions available:
   ```bash
   python3 scripts/check_conda_versions.py
   ```

2. **Update the versions**: Edit the `environment.yml` files with the new versions:
   - `preprocessing/nextclade/environment.yml`
   - `ingest/environment.yml`
   - `ena-submission/environment.yml`

3. **Keep ruff in sync**: If updating ruff in `ena-submission/environment.yml`, also update
   it in `.pre-commit-config.yaml` to match.

4. **Pin all dependencies**: All dependencies should use exact version pinning (e.g., `=1.2.3`)
   rather than minimum version constraints (e.g., `>=1.2.3`) to ensure reproducible builds.

5. **Run pre-commit**: After updating ruff or other linting tools, run pre-commit on all files
   to catch any new linting issues:
   ```bash
   pre-commit run --all-files
   ```

The check script queries conda-forge and bioconda channels using micromamba and reports
which packages have updates available.
