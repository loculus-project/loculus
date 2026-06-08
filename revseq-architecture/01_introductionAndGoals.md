# 1. Introduction and Goals

The ReVSeq Loculus instance is a portal for already preprocessed respiratory
virus data. It stores metadata and consensus sequences so that the data can be
searched through Loculus, LAPIS, and SILO.

The current preview supports all pathogens configured in the ReVSeq dashboard:
SARS-CoV-2, RSV-A/B, whole-genome influenza A/B, HMPV, HPIV-1/2/3/4a, and
seasonal coronaviruses 229E/HKU1/NL63/OC43. Public Nextclade datasets are used
where available. Dashboard-only HPIV and seasonal coronavirus datasets are
bundled into the preprocessing image from the pinned dashboard dataset source.

## Goals

- Upload metadata and consensus FASTA.
- Run Loculus' existing Nextclade preprocessing for lineage/clade annotation,
  sequence alignment, and mutation search.
- Make released records searchable through Loculus and available through LAPIS.
- Keep changes outside Loculus core backend, website, LAPIS, and SILO code.
- Provide a reproducible ENA-derived preview dataset containing all matching
  consensus `sequence` records from ReVSeq project `PRJEB83635`.

## Non-Goals

- Processing raw FASTQ files.
- Generating consensus sequences or CRAM files inside Loculus.
- Uploading CRAM/CRAI files in the space-saving preview.
- Integrating a separate respiratory-virus workflow runtime.
