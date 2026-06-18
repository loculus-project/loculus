# 6. Runtime View

## Materialization cycle

1. The importer starts with a rendered SQL query and rendered database config.
2. It downloads released data from each source organism, using ETags to skip unchanged full refreshes.
3. It writes one transformed `<organism>.ndjson.zst` file per source organism.
4. It creates generated DuckDB source views named after organism keys.
5. It executes the configured SQL query.
6. If unaligned sequences are enabled, it copies configured segment fields from transformed source records to matching SQL result rows by `accessionVersion`.
7. It writes `data.ndjson.zst`.
8. SILO preprocessing imports the file and LAPIS serves the resulting view until the next successful materialization.

## Empty and changing sources

If all sources are unchanged, the importer skips the cycle. If one source changed while others returned `304`, the importer refetches all sources so the SQL query sees a consistent snapshot.
