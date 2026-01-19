# Maintenance Scripts

Throwaway utility scripts for one-off maintenance tasks.

## check_conda_versions.py

A simple script to check for updates to conda packages in `environment.yml` files, since dependabot doesn't support conda dependencies.

**Usage:**
```bash
python3 maintenance-scripts/check_conda_versions.py
```

Queries conda-forge and bioconda for the latest versions and reports which packages can be updated.

**Update process:**

1. **Check for updates**: Run the script to see which packages have newer versions available
2. **Update the versions**: Edit the `environment.yml` files with the new versions:
   - `preprocessing/nextclade/environment.yml`
   - `ingest/environment.yml`
   - `ena-submission/environment.yml`
3. **Keep ruff in sync**: If updating ruff in `ena-submission/environment.yml`, also update it in `.pre-commit-config.yaml` to match
4. **Pin all dependencies**: All dependencies should use exact version pinning (e.g., `=1.2.3`) rather than minimum version constraints (e.g., `>=1.2.3`) to ensure reproducible builds
5. **Run pre-commit**: After updating ruff or other linting tools, run pre-commit on all files to catch any new linting issues:
   ```bash
   pre-commit run --all-files
   ```
