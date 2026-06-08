# 20. Nextclade Preprocessing

ReVSeq uses the existing Loculus Nextclade preprocessing image with
configuration and small preprocessing extensions for dashboard datasets.

SARS-CoV-2:

- Dataset: `nextstrain/sars-cov-2/wuhan-hu-1/orfs`
- Derived metadata: Pango lineage and Nextclade clade.

RSV:

- Dataset: `nextstrain/rsv/a/EPI_ISL_412866`
- Dataset: `nextstrain/rsv/b/EPI_ISL_1653999`
- Dataset tag: `2026-04-14--11-55-23Z`
- Assignment: Nextclade alignment chooses `RSV-A` or `RSV-B`.
- Derived metadata: genotype plus RSV-A or RSV-B clade.

Influenza A:

- Datasets: official H1N1pdm and H3N2 Nextclade datasets for PB2, PB1, PA,
  HA, NP, NA, M (`mp`), and NS.
- Dataset tag: `2026-04-14--11-55-23Z`
- Assignment: Nextclade alignment chooses `H1N1` or `H3N2` for each segment.
- Derived metadata: sample-level subtype, per-segment assigned reference,
  available HA clade/legacy-clade/subclade fields, segment lengths, and
  per-segment QC.

Influenza B:

- Datasets: official influenza B Nextclade datasets for PB2, PB1, PA, HA, NP,
  NA, M (`mp`), and NS.
- Dataset tags: non-HA/NA segments use `2026-01-14--08-53-00Z`; HA and NA use
  `2026-04-14--11-55-23Z`.
- Derived metadata: per-segment assigned reference, HA lineage/clade fields,
  segment lengths, and per-segment QC.

HMPV:

- Dataset: `nextstrain/hmpv/all-clades/NC_039199`
- Dataset tag: `2026-04-14--11-55-23Z`
- Derived metadata: clade and legacy clade fields.

HPIV and seasonal coronaviruses:

- Datasets: bundled from the pinned ReVSeq dashboard datasets under
  `preprocessing/nextclade/revseq-datasets/`.
- Derived metadata: Nextclade coverage and QC fields. The bundled source
  datasets do not expose clade/tree metadata fields.

All organisms record available Nextclade coverage, overall QC score/status, and
category QC scores. Optional missing Nextclade values are preserved as nulls
rather than the string `"None"`, so absent optional QC categories do not block
release. ENA dates in `DD-Mon-YYYY` and `Mon-YYYY` formats are normalized during
preprocessing.
