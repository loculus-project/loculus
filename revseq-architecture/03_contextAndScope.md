# 3. Context and Scope

## External Systems

- ENA provides source metadata and consensus FASTA records for the pilot
  dataset.
- Nextclade dataset servers provide public SARS-CoV-2, RSV, influenza, and HMPV
  datasets.
- The pinned ReVSeq dashboard repository provides dashboard-only HPIV and
  seasonal coronavirus Nextclade datasets.
- ReVSeq dashboard and analysis clients will later consume Loculus/LAPIS data.

## In Scope

- Loculus instance configuration for all ReVSeq dashboard pathogens.
- ReVSeq-specific submission scripts.
- ENA test data preparation.
- Narrow Nextclade preprocessing improvements for bundled datasets,
  consensus-only submissions, optional QC values, and ENA date formats.

## Out of Scope

- Raw-read upload and processing.
- CRAM/CRAI upload in the current space-saving preview.
- Runtime orchestration for external analysis workflows.
- Dashboard implementation.
- Core Loculus feature changes unrelated to ReVSeq configuration or file
  preprocessing.
