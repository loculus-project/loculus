# 1. Introduction and Goals

## What this describes

Loculus can define cross-organism views. A view is configured with an SQL query, a manual SILO/LAPIS schema, and optional unaligned nucleotide sequence settings. The view importer downloads released data from source organisms, transforms it to NDJSON, evaluates the SQL with DuckDB, attaches configured unaligned sequences by `accessionVersion`, and feeds the result into a dedicated SILO/LAPIS instance.

The first views are `overview`, `real-organisms`, `test-organisms`, and `co-infections`.

## Goals

1. Let admins define metadata-first views without changing Python code for each view.
2. Support simple SQL over per-organism source tables.
3. Normalize common fields across organisms with different metadata names.
4. Serve each view through the normal search UI and backend query API.
5. Keep SILO/LAPIS input explicit through a manual schema.
6. Make preview fixtures include useful default views.
7. Support opt-in unaligned nucleotide sequence retrieval for views.

## Non-goals

- Inferring the SILO schema from SQL output.
- Aligned nucleotide sequence, mutation, insertion, or amino acid views.
- Providing a full admin-panel editor for views.
- Making views a replacement for organism databases.
