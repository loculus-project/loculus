# 14. Config Schema

## View config

| Field | Meaning |
|---|---|
| `displayName` | Human-facing name shown in navigation, pages, and API docs. |
| `query` | DuckDB SQL query executed against generated source views. |
| `schema` | Manual SILO/LAPIS schema for the query output. |
| `tableColumns` | Default visible columns in the website browse table. |
| `sequenceData.unalignedNucleotideSequences.enabled` | Enables unaligned nucleotide sequence output for this view. |
| `sequenceData.unalignedNucleotideSequences.segments` | View-level segment names, usually `main` for non-segmented organisms and biological segment names for segmented organisms. |
| `sequenceData.unalignedNucleotideSequences.sourceSegments` | Optional mapping from view segment to organism-specific source segment name. |
| `lapisUrl` | Upstream LAPIS URL used by the backend query proxy. |

## Example

```yaml
views:
  overview:
    displayName: Overview
    query: |
      select accessionVersion, accession, geoLocCountry as country
      from "enteroviruses"
      union all
      select accessionVersion, accession, country as country
      from "dummy-organism"
    sequenceData:
      unalignedNucleotideSequences:
        enabled: true
        segments:
          - main
    schema: |
      schema:
        instanceName: Overview
        opennessLevel: OPEN
        metadata:
          - name: accessionVersion
            type: string
          - name: accession
            type: string
          - name: country
            type: string
        primaryKey: accessionVersion
    tableColumns:
      - country
    lapisUrl: "http://loculus-lapis-service-overview:8080"
```
