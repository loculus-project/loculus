# 4. Solution Strategy

1. Deploy one SILO/LAPIS pair per configured view key.
2. Render each view's SQL query and schema with `loculus-config-adapter`.
3. In the view importer, download `/get-released-data` for every configured source organism.
4. Run `legacy-ndjson-transformer` once per source organism.
5. Register one DuckDB table-like view per organism.
6. Cast schema-known source columns inside generated DuckDB views.
7. Execute the admin-provided SQL, optionally attach unaligned sequence fields for returned `accessionVersion` values, and write `data.ndjson.zst`.
8. Let SILO import that file and LAPIS serve it through the backend query API.
