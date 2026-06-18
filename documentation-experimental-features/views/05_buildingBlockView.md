# 5. Building Block View

## Level 1

```
Source organism backends
      |
      v
view silo-importer
  - download released data
  - legacy NDJSON transform
  - DuckDB SQL execution
  - optional sequence attachment
      |
      v
data.ndjson.zst
      |
      v
SILO + LAPIS for the view
      |
      v
Website and /query/{view}/...
```

## Components

| Component | Responsibility |
|---|---|
| Instance `views` config | Stores SQL, manual schema, default table columns, display name, and optional sequence settings. |
| `loculus-config-adapter` | Renders `overview_query.sql`, `database_config.yaml`, `reference_genomes.json`, `view_sequence_config.json`, and SILO preprocessing config for a view. |
| `OverviewImporterRunner` | Downloads all source releases and builds the view input file. |
| `legacy-ndjson-transformer` | Converts released-data records into flat NDJSON records with metadata and sequence fields. |
| DuckDB | Executes generated source views and the configured SQL query. |
| SILO/LAPIS view pods | Index and serve the materialized view. |
| Website config transform | Treats views like organisms for browse pages and navigation. |
| Backend query proxy | Serves the view under `/query/{view}/{versionGroup}/...`. |
