# 20. Implemented Pathogen Preview Mapping

The ReVSeq preview config uses the dashboard Nextclade datasets documented in
`20_dashboardPathogenDatasets.md`. Public datasets are referenced by Nextclade
dataset name. Dashboard-only HPIV and seasonal-coronavirus datasets are bundled
inside the preprocessing image and link out to the pinned ReVSeq-dashboard
GitHub dataset directories for Nextclade Web.

The preview dataset is restricted to ENA `sequence` records from `PRJEB83635`.
The current study contains 255 matching consensus sequence records. All matching
records are included for the internal-data preview. The 16 influenza A segment
records form two complete eight-segment sample groups; some segments are too
incomplete for official Nextclade segment alignment, so those alignment
messages are warnings rather than release blockers.

| Dashboard target | Loculus organism | Reference | Loculus entries | Notes |
| --- | --- | --- | ---: | --- |
| `sars-cov-2` | `sars-cov-2` | `singleReference` | 60 | Public SARS-CoV-2 dataset; Pango and clade fields enabled. |
| `rsv-a` | `rsv` | `RSV-A` | 54 | RSV multi-reference organism; RSV-A clade field enabled. |
| `rsv-b` | `rsv` | `RSV-B` | 11 | RSV multi-reference organism; RSV-B clade field enabled. |
| `flu-a-h1n1` | `influenza-a` | `H1N1` | 2 | Two eight-segment H1N1 sample entries exist in PRJEB83635. Low-completeness segments are flagged but still submitted and released. |
| `flu-a-h3n2` | `influenza-a` | `H3N2` | 0 | Skipped for PRJEB83635; no matching consensus sequence. |
| `flu-b` | `influenza-b` | `singleReference` | 0 | Skipped for PRJEB83635; no matching consensus sequence. |
| `hmpv` | `hmpv` | `singleReference` | 27 | Public HMPV dataset; clade and legacy clade fields enabled. |
| `hpiv-1` | `hpiv` | `HPIV-1` | 2 | HPIV is a multi-reference organism. |
| `hpiv-2` | `hpiv` | `HPIV-2` | 2 | HPIV is a multi-reference organism. |
| `hpiv-3` | `hpiv` | `HPIV-3` | 55 | HPIV is a multi-reference organism. Non-HPIV records with conflicting scientific names are classified by reference accession instead. |
| `hpiv-4a` | `hpiv` | `HPIV-4a` | 2 | HPIV is a multi-reference organism. |
| `coronavirus-229e` | `seasonal-coronavirus` | `229E` | 4 | Seasonal coronaviruses are a multi-reference organism. |
| `coronavirus-hku1` | `seasonal-coronavirus` | `HKU1` | 6 | Seasonal coronaviruses are a multi-reference organism. |
| `coronavirus-nl63` | `seasonal-coronavirus` | `NL63` | 4 | Seasonal coronaviruses are a multi-reference organism. |
| `coronavirus-oc43` | `seasonal-coronavirus` | `OC43` | 12 | Seasonal coronaviruses are a multi-reference organism. |

The browse tables use `enaSequenceAccession` as the first visible identifier
and sort by `sampleCollectionDate` descending. The submitter-facing `id` remains
accepted in uploaded metadata, but it is hidden from browse/details because it
is not a useful released-data identifier in the ReVSeq preview.

All configured organisms include Nextclade coverage, overall QC score/status,
and the available Nextclade category QC scores (`missingData`, `mixedSites`,
`privateMutations`, `snpClusters`, `frameShifts`, `stopCodons`). The
consensus-only test dataset intentionally omits CRAM/CRAI uploads.

Per-entry audit notes are written to
`test-data/prjeb83635/flagged_entries.tsv`. For the current ENA test data, the
flagged influenza A entries exceed 50% `N` content in most segments; official
segment datasets can align only part of these records, and failed segment
alignment messages are retained as preprocessing warnings.
