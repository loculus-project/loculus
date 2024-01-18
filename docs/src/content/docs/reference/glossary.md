---
title: Glossary
description: Glossary of terms used in Loculus
---

**Sequence entry**: A sequence entry consists of a genome sequence (or sequences if the organisms has a segmented genome) and associated metadata. It is the main entity of the Loculus application. Users submit sequence entries and search for sequence entries. Each sequence entry has its own accession. Changes to sequence entries are versioned, meaning that a sequence entry can have multiple versions.

**Accession**: An accession is the unique identifier of a sequence entry. The `accession` itself does not contain the version number. The field that concatenates the accession and the version (`<accession>.<version>`) is called `accessionVer` or `accessionVersion` (TODO: await result from PHA4GE poll).

**Submission ID**: When users upload sequence entries, they have to provide a submission ID to link the entries in the metadata file and the FASTA file. Each submission ID must be unique within the submission, but re-use across submissions is acceptable.

**Preprocessing pipeline**: A preprocessing pipeline takes submitter-provided data for a specific organism, adds alignments, translations, and annotations, and identifies errors both in metadata and sequences. See [Preprocessing Pipeline: Specification](../preprocessing/specification.md) for details.

**Nucleotide sequence and amino acid sequences**: Users upload unaligned nucleotide sequences. The preprocessing pipeline aligns the sequences against an organism-specific reference genome and translates them to amino acid sequences.

**Data Use Terms**:
When submitting data, the user may choose to restrict the usage of that data for a certain time period (up to a maximum of one year).
These data use terms are associated with the accession and apply to all versions of that accession.
The period can be _shortened_ by any member of the group.
Extending the restriction time is not permitted.
After the restricted period, the data use terms will be changed to open use.

## Abbreviations

- AA = amino acid
- QC = quality control
- Seq = sequence

## Further Reading

[Runtime View](../backend/docs/runtime_view.md): a detailed description of the whole submission flow.
