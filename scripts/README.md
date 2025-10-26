# Scripts

Utility scripts for repository maintenance.

## check_conda_versions.py

Checks for updates to conda packages in `environment.yml` files.

**Usage:**
```bash
python3 scripts/check_conda_versions.py
```

**Requirements:**
- micromamba (or conda/mamba)
- Python 3.6+

**What it does:**
- Scans all `environment.yml` files in the repository
- Queries conda-forge and bioconda channels for latest versions
- Reports which packages have updates available
- Shows current version vs latest version for each package

**Files checked:**
- `preprocessing/nextclade/environment.yml`
- `ingest/environment.yml`
- `ena-submission/environment.yml`

After running this script and identifying updates:
1. Update the version numbers in the `environment.yml` files
2. If ruff was updated, also update `.pre-commit-config.yaml`
3. Run `pre-commit run --all-files` to catch any new linting issues
4. Commit the changes with a descriptive message

See also: `AGENTS.md` for more details on the update process.
