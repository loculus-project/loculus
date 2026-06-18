# 9. Architectural Decisions

## ADR-001: Views are configured in instance config

**Decision.** SQL, schema, display name, table columns, and LAPIS URL live in the DB-backed instance config.

**Consequences.** Fixtures and future admin tooling can define views without changing importer code.

## ADR-002: Use DuckDB for SQL execution

**Decision.** DuckDB reads transformed NDJSON and executes the configured SQL query.

**Consequences.** Admins can express unions, aliases, filters, and joins in SQL while the importer stays generic.

## ADR-003: Keep manual SILO schemas

**Decision.** The view config includes an explicit schema instead of inferring it from SQL output.

**Consequences.** LAPIS/SILO behavior is predictable, but admins must keep SQL output and schema aligned.

## ADR-004: Cast schema-known fields in generated source views

**Decision.** The importer casts fields named in the manual schema before admin SQL runs.

**Consequences.** Admin SQL stays readable. Arbitrary extra fields still need explicit handling if they are not in the schema.

## ADR-005: One SILO/LAPIS pair per view

**Decision.** Each view is materialized into its own query database.

**Consequences.** Views are isolated and can have separate schemas, but each view adds runtime pods and import work.

## ADR-006: Download released data through backend APIs

**Decision.** The importer reads `/get-released-data` for each source organism.

**Consequences.** Views see the same released-data surface as external consumers and do not read the Loculus database directly.

## ADR-007: Support only unaligned nucleotide sequences in views

**Decision.** Views may opt into unaligned nucleotide sequence fields, using `main` for non-segmented organisms and biological segment names for segmented organisms.

**Consequences.** The first sequence-capable views avoid reference-choice, alignment, mutation, and amino acid semantics while still supporting FASTA/JSON sequence retrieval for materialized rows.
