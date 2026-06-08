# 6. Runtime View

## Data Preparation

1. The operator runs `scripts/revseq/prepare_ena_upload_files.py`.
2. The script queries ENA `sequence` records for project `PRJEB83635`.
3. It classifies matching records against the ReVSeq dashboard pathogen
   references, preferring reference accessions in the ENA description when
   available.
4. It writes one flat upload pair per populated Loculus organism under
   `test-data/`: `<organism>-metadata.tsv` and
   `<organism>-sequences.fasta`.
5. It groups influenza segment records from the same ENA sample into one
   Loculus entry using `fastaIds`.

## Preview Seeding

1. The public preview uses the Helm `revseqSeed` job.
2. The job downloads the flat files from this branch's `test-data/` directory.
3. It logs in with the configured test account, creates or reuses one preview
   group, submits each populated organism, waits for preprocessing, and
   approves processed records.
4. Released records become searchable in organism-specific LAPIS instances and
   in the metadata-only `overview` LAPIS instance.

Automated INSDC ingest is disabled for ReVSeq previews.
