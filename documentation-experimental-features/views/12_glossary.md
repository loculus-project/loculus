# 12. Glossary

| Term | Meaning |
|---|---|
| View | SQL-backed dataset materialized into its own SILO/LAPIS instance. |
| Source organism | Organism whose released data is downloaded and exposed as a DuckDB source view. |
| Admin SQL | The configured SQL query that defines the view output. |
| Generated source view | DuckDB view created by the importer for one source organism. |
| Manual schema | YAML schema supplied with the view and rendered as SILO database config. |
| Materialization | Rebuilding `data.ndjson.zst` from source releases and SQL output. |
| Co-infection view | View that selects records linked by group and isolate name across real organisms. |
| Sequence namespace | View-level segment names used for unaligned nucleotide sequence fields. |
