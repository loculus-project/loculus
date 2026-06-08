# 2. Constraints

- Do not change core Loculus backend, website, LAPIS, or SILO behavior for this
  project.
- Use existing Loculus configuration and preprocessing mechanisms where
  possible.
- Use the existing Nextclade preprocessing pipeline for sequence alignment,
  lineage/clade metadata, and mutation search.
- Do not introduce additional bioinformatics tools without an explicit decision.
- Disable SeqSets and Data Use Terms for the ReVSeq preview.
- Use direct pathogen submissions for the initial preview instead of a staging
  organism.
- Store consensus sequences as Loculus sequence data, not as separate
  downloadable FASTA attachments.
- Omit CRAM/CRAI uploads in the current space-saving preview.
