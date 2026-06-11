# 20. Preview and Test Data

The preview dataset is generated from ENA `sequence` records in the ReVSeq
project `PRJEB83635`. It contains all matching consensus assemblies for
configured pathogens and skips configured targets with no matching sequence in
the project.

The public preview is seeded automatically by the Helm `revseqSeed` job. The
job downloads the files below from the branch, submits them through the normal
Loculus API with the test account, waits for preprocessing, and approves the
processed records. Automated INSDC ingest remains disabled.

Expected upload files:

```text
test-data/
  hmpv-metadata.tsv
  hmpv-sequences.fasta
  hpiv-metadata.tsv
  hpiv-sequences.fasta
  influenza-a-metadata.tsv
  influenza-a-sequences.fasta
  rsv-metadata.tsv
  rsv-sequences.fasta
  sars-cov-2-metadata.tsv
  sars-cov-2-sequences.fasta
  seasonal-coronavirus-metadata.tsv
  seasonal-coronavirus-sequences.fasta
```

The `influenza-a-metadata.tsv` file groups all eight segment FASTA records from
the same ENA sample into one Loculus entry using the `fastaIds` column. In the
current PRJEB83635 test data, both H1N1 sample groups are included even though
many segment consensus sequences are mostly `N`; the preview QC configuration
allows these records because this internal dataset should show everything that
is available.

`influenza-b` is configured in Loculus but has no matching PRJEB83635 consensus
records, so there is no influenza B upload file in the current test dataset.

Prepare data:

```bash
python3 scripts/revseq/prepare_ena_upload_files.py \
  --output-dir test-data \
  --clean
```

The preview is considered working when all organisms with matching PRJEB83635
records have released records, metadata filters work, LAPIS returns details
rows for populated organisms, and aligned nucleotide sequences are present where
preprocessing can align the sequence. CRAM/CRAI file uploads are intentionally
omitted in the current space-saving preview.
