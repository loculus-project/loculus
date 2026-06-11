# Cross-Organism Overview

## Decision

ReVSeq uses an additional metadata-only SILO/LAPIS instance named `overview` to support a browse table across all configured pathogens.

The overview is not added to the normal Loculus `organisms` map. This keeps existing organism-specific backend, preprocessing, SILO/LAPIS, sequence detail lookup, and submission behavior unchanged.

## Runtime Architecture

The Helm value `overview.enabled` controls whether the extra resources are rendered:

- `loculus-silo-overview`
- `loculus-lapis-overview`
- `loculus-lapis-service-overview`
- `lapis-silo-database-config-overview`
- `/overview/` LAPIS ingress routing

The overview SILO importer runs in `SILO_IMPORT_MODE=overview`. It reads released data from each configured organism backend endpoint:

```text
/<organism>/get-released-data?compression=zstd
```

It builds one metadata-only dataset with no sequence columns, runs SILO preprocessing, and serves it through the overview LAPIS instance.

## Metadata Model

The overview schema contains common Loculus metadata plus selected ReVSeq shared fields:

- organism key and display name
- accession/version fields
- submit/release fields
- ENA/source accessions
- collection date and country
- generic `clade`
- shared Nextclade QC fields

The generic `clade` field is derived per organism from configured candidate fields. For example, SARS-CoV-2 uses `pangoLineage` before `nextcladeClade`, RSV uses `genotype` before RSV clade fields, HPIV uses `hpivType`, and seasonal coronaviruses use `seasonalCoronavirusType`.

## Website Behavior

The website has a separate `/overview` route and top-navigation item. It reuses the existing search table but disables sequence-specific behavior on this page:

- no mutation search
- no sequence preview modal
- no sequence/linkout tool menu
- metadata downloads remain available

Rows link to the existing `/seq/<accessionVersion>` detail pages. Detail lookup still searches only normal organisms.

## Preview Verification

As of 2026-06-05, the local ReVSeq preview imports 241 overview records from the populated organism-specific released data:

| Organism | Records |
| --- | ---: |
| HMPV | 27 |
| HPIV | 61 |
| Influenza A | 2 |
| RSV | 65 |
| SARS-CoV-2 | 60 |
| Seasonal coronaviruses | 26 |

Influenza B is configured but currently has no populated records in the preview
data because PRJEB83635 has no matching influenza B consensus sequence.
