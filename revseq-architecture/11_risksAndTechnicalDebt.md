# 11. Risks and Technical Debt

- Public RSV, influenza, and HMPV dataset configuration pins official Nextclade
  dataset tags from 2026-04-14. Future updates may require refreshing reference
  sequences and gene coordinates.
- The ENA pilot selector depends on the selected ENA sequence accessions
  remaining available.
- HPIV and seasonal coronavirus datasets are bundled from the pinned ReVSeq
  dashboard repository because they are not public Nextclade datasets.
- The current preview is consensus-only. CRAM/CRAI upload and raw FASTQ
  processing still need a separate design step before implementation.
