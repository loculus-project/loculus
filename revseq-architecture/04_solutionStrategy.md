# 4. Solution Strategy

Submit already preprocessed records directly to pathogen-specific Loculus
organisms:

- Single-reference pathogens go to one Loculus organism per dashboard target.
- RSV records go to one `rsv` organism where Nextclade assigns each sequence to
  RSV-A or RSV-B.
- Influenza A records go to one multi-segment `influenza-a` organism. ENA
  segment records from the same sample are submitted as one Loculus entry via
  the `fastaIds` column, and Nextclade assigns each segment against the H1N1 or
  H3N2 segment dataset.
- Influenza B records go to one multi-segment `influenza-b` organism, also
  grouped by sample with one sequence per segment.
- HPIV records go to one `hpiv` organism where Nextclade assigns HPIV-1,
  HPIV-2, HPIV-3, or HPIV-4a.
- Seasonal coronavirus records go to one `seasonal-coronavirus` organism where
  Nextclade assigns 229E, HKU1, NL63, or OC43.

Consensus FASTA is submitted as the Loculus sequence file so it can be aligned,
indexed, and searched. CRAM/CRAI uploads are disabled in the preview to keep the
test dataset small.

The ENA script queries project `PRJEB83635`, classifies all matching consensus
records, and writes per-organism `metadata.tsv` and `sequences.fasta` files. It
normalizes ENA collection dates into backend-compatible ISO dates where
possible and documents configured targets that have no matching project
sequence.
