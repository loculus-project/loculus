# 10. Quality Requirements

| Quality | Requirement |
|---|---|
| Flexibility | Adding a new metadata view should be mostly configuration work. |
| Correctness | A view materialization must use a consistent snapshot across source organisms. |
| Usability | SQL should not require repetitive casts for schema-known fields. |
| Searchability | View schemas must support normal LAPIS search, aggregation, and autocomplete. |
| Operability | Failed materializations must leave the previous SILO input in place until a successful rebuild. |
| Compatibility | Views should appear in the website and query API like organisms where possible. |

