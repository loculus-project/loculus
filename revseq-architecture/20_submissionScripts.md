# 20. Submission Scripts

`scripts/revseq/prepare_ena_upload_files.py` prepares the ENA-derived preview
dataset. It queries ENA `sequence` records for project `PRJEB83635`, classifies
records against the configured ReVSeq dashboard pathogens, and writes flat
per-organism upload files under `test-data/`.

The generated dataset is consensus-only. The script writes `metadata.tsv` and
`sequences.fasta` equivalents for each organism as
`<organism>-metadata.tsv` and `<organism>-sequences.fasta`, normalizes ENA
collection dates such as `02-Mar-2010` and `Nov-2009` to ISO dates, and groups
influenza segment records from the same ENA sample into one Loculus entry via
the `fastaIds` metadata column.

There is no projection step in the current ReVSeq preview. Records are
submitted directly to the target organism.
