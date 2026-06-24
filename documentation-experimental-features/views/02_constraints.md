# 2. Constraints

1. Views are metadata-first; sequence output is limited to configured unaligned nucleotide segments.
2. The source data comes from each organism's `/get-released-data` endpoint.
3. The legacy NDJSON transformer remains the normalization step before DuckDB reads source files.
4. DuckDB infers JSON types per source file, so generated source views cast schema-known fields to stable types.
5. The output schema is written manually in the view config.
6. Every deployed view needs its own SILO and LAPIS instance.
7. Empty source organisms must still be usable in `UNION ALL` queries.
8. Aligned sequence, mutation, insertion, and amino acid endpoints are not generated for views.
