# 8. Crosscutting Concepts

## Typed generated source views

Admins should not have to write casts for every field. The importer reads the manual output schema and casts source columns with known names inside generated DuckDB views. This avoids type conflicts when different JSON files infer different types.

## Manual output schema

The schema remains explicit because SILO needs field types, indexes, display names, default ordering, and feature flags. SQL output and schema must stay aligned.

## Naming

Organism keys become quoted DuckDB view names, so queries can use source names like `"ebola-sudan"` safely.

## Sequence namespace

Views can opt into unaligned nucleotide sequences. Non-segmented organisms use the `main` segment, segmented organisms use biological segment names such as `L`, `M`, and `S`, and sparse rows are allowed when a row has no sequence for a view segment.

## Synthetic references

Sequence-enabled views render placeholder reference genomes with sequence `N`. They exist to declare segment names for unaligned LAPIS endpoints; aligned sequence, mutation, insertion, and amino acid endpoints remain disabled.

## Normalized fields

View SQL can normalize source-specific fields, for example `geoLocCountry` and `country` into `country`, or `sampleCollectionDate` and `date` into `date`.
