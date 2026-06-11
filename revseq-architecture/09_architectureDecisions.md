# 9. Architecture Decisions

## ADR 1: Submit Directly to Pathogen Organisms

Direct submission avoids a staging/projection workflow and makes the first
preview easier to validate. The ENA script routes records directly to the
matching dashboard organism before submission.

## ADR 2: Use Nextclade for Searchable Sequences

Mutation filters and lineage/clade fields require aligned sequence data and
annotations. The existing Loculus Nextclade preprocessing pipeline already
provides this behavior, so ReVSeq uses it instead of a custom pass-through
pipeline.

## ADR 3: Model RSV-A and RSV-B as One RSV Organism

RSV-A and RSV-B are configured as references under one `rsv` organism. This lets
users view RSV data together while still selecting a reference before
suborganism-specific mutation searches.

## ADR 4: Model Influenza as Whole-Genome Multi-Segment Organisms

Influenza A and B are configured as eight-segment organisms. Influenza A uses
H1N1 and H3N2 references for each segment; influenza B uses the official
single-reference segment datasets. This preserves sample-level Loculus entries
while allowing each ENA segment record to be aligned and QC-scored by the
appropriate official Nextclade segment dataset.

## ADR 5: Keep the Preview Consensus-Only

Consensus FASTA is submitted as sequence data. CRAM/CRAI and raw FASTQ handling
are deferred so the current preview can validate pathogen configuration,
Nextclade metadata, LAPIS availability, and website visibility with a small
dataset.
