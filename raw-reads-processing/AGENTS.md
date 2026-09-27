Run ruff from this directory, not from the repository root:

```sh
cd raw-reads-processing && ruff check . && ruff format --diff .
```

`pyproject.toml` here replaces the root `ruff.toml` rather than extending it, so a different
set of rules applies, and the two disagree in both directions. CI (`raw-reads-processing-unit-tests.yaml`)
runs from this directory with the ruff version pinned in `environment.yml`, so a newer
ruff will report findings CI does not.

