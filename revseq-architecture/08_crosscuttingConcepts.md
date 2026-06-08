# 8. Crosscutting Concepts

## Traceability

Each record stores ENA sequence, run, and sample accessions in searchable
metadata fields. `revseqSourceAccession` points to the ENA sequence accession
used as the source consensus record.

## File Handling

The current preview is consensus-only and disables file uploads. CRAM/CRAI file
handling remains a future extension once storage and retention requirements are
agreed.

## Suborganisms and Segments

RSV, HPIV, and seasonal coronaviruses use Loculus' multi-reference model to
keep related dashboard targets browsable together while preserving the assigned
reference/type field.

Influenza A and B use Loculus' multi-segment model. Segment FASTA records from
the same ENA sample are submitted as one entry, and per-segment Nextclade
configuration aligns and annotates each segment.

## Search

Metadata fields are indexed for country, collection date, ENA accessions, and
lineage/clade/type fields. Mutation search is powered by aligned sequence data
from Nextclade preprocessing and served through organism-specific LAPIS/SILO
instances. The cross-organism overview is metadata-only and intentionally has
no sequence columns or mutation search.
