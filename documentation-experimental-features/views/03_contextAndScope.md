# 3. Context and Scope

## Context

The original overview table was a dedicated special case with a fixed preprocessing script. That made it hard to add another cross-organism view or adjust fields without code changes.

The new model moves the core view definition into instance config:

- `query`: SQL run by DuckDB;
- `schema`: manual SILO database config for the query output;
- `tableColumns`: default website table columns;
- `sequenceData`: optional unaligned nucleotide segment configuration;
- `lapisUrl`: backend proxy target for the deployed view.

## In scope

- Downloading released metadata from configured source organisms.
- Running SQL over transformed source data.
- Attaching configured unaligned nucleotide sequences to selected rows by `accessionVersion`.
- Producing `data.ndjson.zst` for SILO.
- Exposing the resulting LAPIS instance as a normal query key.

## Out of scope

- View authoring UI.
- Automatic schema inference.
- Incremental SQL execution.
- Secret or private-data views.
