---
title: Revise sequences
---

Sequences can be corrected or updated after they have been submitted to Loculus. Submitting these changes ("revisions") will cause the [version](../../reference/glossary/#version) of the sequence to be incremented, and previous versions of the metadata and sequence data can always be accessed via previous version numbers.

The process of submitting revisions is very similar to original submission. The main difference is that you must provide an `accession` column in the metadata file, which contains the Loculus [accession number(s)](../../reference/glossary/#accession) assigned when the sequences were submitted originally.

## Preparing the metadata file

The metadata file needs to include an `accession` column, which contains the Loculus accessions assigned at initial submission. 

For **metadata-only revisions** (no sequence changes):
- Include only the metadata fields you wish to update
- Fields not included in your file will retain their previous values
- To clear a field's value, include the column and leave the value empty
- The `id` column is optional when not providing sequences

For **revisions with sequence changes**:
- Include the `id` column to match sequence ids in your FASTA file
- In the case of segmented organisms, the FASTA ids will additionally contain segment suffix, e.g. `_L` for segment L

## Preparing the FASTA file (optional)

A FASTA file is **only required if you are updating sequences**. For metadata-only revisions, you can skip this step entirely.

If you are revising sequences:
- Create a FASTA file that contains only the sequences you'd like to revise
- Include whatever sequence changes you'd like to make
- Ensure sequence names match the `id` values in your metadata file

## Submitting the revision

To submit a revision, navigate to the `Submit` section of the Loculus website using the link in the top-right corner of the website. Select the correct organism if requested, or ensure you're submitting to the correct organism database via the drop-down on the top-left of the website.

Just as with an original submission, drag and drop (or select) the files where you have made the appropriate revisions. Press 'Submit'.

You will be directed to the same processing page as you're taken to during initial submission, where you can view the sequences and their changes before releasing them. Once released, these changes will appear in the database after a few minutes, with the version numbers incremented.
