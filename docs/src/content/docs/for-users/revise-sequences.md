---
title: Revise sequences
---

Sequences can be corrected or updated after they have been submitted to Loculus. Submitting these changes ("revisions") will cause the [version](../../reference/glossary/#version) of the sequence to be incremented, and previous versions of the metadata and sequence data can always be accessed via previous version numbers.

The process of submitting revisions is very similar to original submission. The main difference is that you must provide an `accession` column in the metadata file, which contains the Loculus [accession number(s)](../../reference/glossary/#accession) assigned when the sequences were submitted originally.

## Downloading originally submitted data for revision

If you no longer have the original files you submitted, you can download them from Loculus. Note that Loculus stores your originally submitted data separately from the processed data shown on the website, so this download gives you the exact data you need for revisions.

1. Navigate to your group's **Released sequences** page
2. Filter or select specific sequences you want to revise
3. Click the **Download originally submitted data** button on the top-right.

This downloads a zip file containing:

- `metadata.tsv` - your original metadata with an `accession` column already included
- `sequences.fasta` - your original unaligned sequences (if the organism supports sequence files)

You can then edit these files as needed and resubmit them as a revision. The download is limited to 500 sequences at a time.

## Preparing the metadata file

The metadata file should include all the metadata fields that were originally included, **both** those that you wish to update and that should remain the same. (Not including a metadata column will set its value to 'empty'.)

The metadata file should only have rows of data for the sequences in the FASTA file. It needs to include an `accession` column, which includes the Loculus accessions assigned at initial submission. You should also include the `id` column, which will match the sequence ids in your FASTA file. (In the case of segmented organisms, the FASTA ids will additionally contain segment suffix, e.g. `_L` for segment L)

## Reusing previously uploaded files

For organisms that support file uploads (e.g. raw reads), you do not need to re-upload files that should stay attached to an entry. When you download the originally submitted data, the `metadata.tsv` includes one column per file category named `existingFiles_<category>` (for example `existingFiles_raw_reads`). Each cell lists the files currently attached to that entry as a `|`-separated list of `name:fileId` pairs, for example:

```
reads_1.fastq:8d8ac610-566d-4ef0-9c22-186b2a5ed793 | reads_2.fastq:41ad1234-566d-4ef0-9c22-186b2a5ed111
```

When revising, you control these files by editing the column:

- **Keep files** – leave the column untouched.
- **Remove a file** – delete its `name:fileId` entry from the cell.
- **Remove all files** – empty the cell.
- **Add files** – upload a folder of new files exactly as during an original submission. New uploads are added alongside the files kept in the column. If an uploaded file has the same name and category as a kept file, the newly uploaded file takes priority.

You can only reference files that belong to your group.

## Preparing the FASTA file

Create a FASTA file that contains only the sequences you'd like to revise, with whatever changes you'd like to make. There is no reason to edit the sequence names in the FASTA file, as long as they still match those in your metadata file.

Even if you are not revising the sequence, you must provide a FASTA file that matches the metadata file you are uploading. It should only contain the sequences that are in the metadata file (if this is fewer than your original submission), and does not otherwise need to be edited.

## Submitting the revision

To submit a revision, navigate to the `Submit` section of the Loculus website using the link in the top-right corner of the website. Select the correct organism if requested, or ensure you're submitting to the correct organism database via the drop-down on the top-left of the website.

Just as with an original submission, drag and drop (or select) the files where you have made the appropriate revisions. Press 'Submit'.

You will be directed to the same processing page as you're taken to during initial submission, where you can view the sequences and their changes before releasing them. Once released, these changes will appear in the database after a few minutes, with the version numbers incremented.
