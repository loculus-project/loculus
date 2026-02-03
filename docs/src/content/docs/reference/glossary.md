---
title: Glossary
description: Glossary of terms used in Loculus
---

### Accession

An accession is the unique identifier of a [sequence entry](#sequence-entry). The `accession` itself does not contain the [version](#version) number. The field that concatenates the accession and the version (`<accession>.<version>`) is called `accessionVersion`.

### Access key (S3)

See [S3 credentials](#s3-credentials).

### Aligned sequence

An aligned sequence is a sequence that has been aligned to a [reference sequence](#reference-sequences). I.e., it is a sequence that has the same length as the reference sequence. It is the task of the [preprocessing pipeline](#preprocessing-pipeline) to perform the alignment.

### Backend

The "Loculus backend" is the central server service of Loculus and responsible for managing submissions and ensuring data persistence. Among other things, it offers APIs to submit and revise data. For querying and retrieving data, [LAPIS](#lapis) is usually used. The backend is written in Kotlin and uses the Spring framework.

### Deletion

A deletion is a type of [mutation](#mutation) where a nucleotide or amino acid is present in a reference sequence but not present in the sample sequence. The notation for a deletion in the case of a single-segmented nucleotide sequence is `<base of reference genome><position>-` (e.g., C100-). A mutation in the case of a [multi-segmented](#segment) nucleotide sequence or an amino acid sequence is further prefixed with the segment or gene name by adding `<segment/gene name>:` (e.g., E:S100-).

### File category

File categories are categories of files submitted or created with the [file sharing feature](#file-sharing-feature). Additional files can be attached to a sequence entry, and every file needs to be within a predefined category. A category can be for example `rawReads` for files of raw reads.

### File ID

As part of the [file sharing feature](#file-sharing-feature), every file that is submitted gets an ID, which is the file ID.
It uniquely identifies this file and can be used to attach the file to a sequence entry.
This does not apply to sequence and metadata files supplied as part of the bulk submission.

### File sharing feature

The file sharing feature can be enabled for an [organism](#organism). If it is enabled, users can submit files into preconfigured [file categories](#file-category), per sequence. The files are then associated to this sequence and can be downloaded later on in the sequence detail view.

### Insertion

An insertion is a type of [mutation](#mutation) where one or more nucleotides or amino acids are present in a sample sequence but not in a reference sequence. The notation for an insertion in the case of a single-segmented nucleotide sequence is `ins_<position>:<inserted bases>` (e.g., ins_100:AAT). An insertion in the case of a [multi-segmented](#segment) nucleotide sequence or an amino acid sequence further contains `<segment/gene name>:` in front of the position (e.g., ins_E:100:AAT).

### Instance

An instance is a specific deployment of Loculus. Each instance operates independently, with its own set of data, user management, and [preprocessing pipelines](#preprocessing-pipeline).

### Keycloak

Keycloak is an [open-source identity and access management software](https://github.com/keycloak/keycloak). Loculus uses it to manage user accounts and authentication.

### LAPIS

LAPIS is an [open-source software](https://github.com/GenSpectrum/LAPIS) for querying genomic sequences. It provides convenient APIs to filter and download data and get aggregated information. It uses [SILO](#silo) for the main computations. Users may directly use the LAPIS APIs to retrieve data and there is an [R package](https://github.com/GenSpectrum/lapisR) under development. In Loculus, there is a LAPIS instance for each [organism](#organism).

### Metadata

Metadata refers to sequence entry-specific information. Some metadata are provided by the submitters (typical fields include sampling location and time and information about the host), whereas others metadata can be derived from a sequence by the [preprocessing pipeline](#preprocessing-pipeline) (e.g., the lineage) or appended by Loculus (e.g., the submission date). Metadata fields are configurable and different Loculus instances or different organisms within an instance may have different fields.

### Mutation

A mutation is a change in the nucleotide or amino acid sequence of a sample relative to the [reference sequence](#reference-sequences). We distinguish between [substitutions](#substitution), [deletions](#deletion) and [insertions](#insertion).

### Nextclade

Nextclade is an [open-source software for sequence alignment](https://github.com/nextstrain/nextclade), clade and mutation calling and sequence quality checks for viral data. Loculus provides a [preprocessing pipeline](#preprocessing-pipeline) that uses Nextclade.

### Nucleotide sequence and amino acid sequences

Users upload [unaligned nucleotide sequences](#unaligned-sequence). The preprocessing pipeline [aligns](#aligned-sequence) the sequences to an [organism](#organism)-specific [reference genome](#reference-sequences) and translates them to amino acid sequences.

### Organism

A Loculus instance is capable of storing data from multiple organisms. Organisms are independent of each other: they may have different [metadata](#metadata) fields, use different [preprocessing pipelines](#preprocessing-pipeline) and different [reference sequences](#reference-sequences).

### Preprocessing pipeline

A preprocessing pipeline takes submitter-provided data for a specific [organism](#organism), adds alignments, translations, and annotations, and identifies errors both in [metadata](#metadata) and sequences.

### Processed data

Processed data is generated by the [preprocessing pipeline](#preprocessing-pipeline) based on the [unprocessed data](#unprocessed-data) and contain both sequence and metadata. Processed data usually includes derived information such as sequence alignments, translations and lineages. The processing pipeline will also "clean" the unprocessed data (typically this entails formatting metadata fields in a standard way and flagging potential errors in the metadata). Users can usually only see the processed data.

### Reference sequences

Each organism has its own reference sequence(s) which are used for [alignment](#aligned-sequence), enabling easier comparison of sequences. It is customary to choose a reference sequence which has been accepted as a standard by the research community.

### Revision

A revision adds an updated version of a [sequence entry](#sequence-entry).

### Revocation

A revocation adds a new version that declares a [sequence entry](#sequence-entry) to be revoked. Revoked sequences are still publicly available but are highlighted as revoked.

### S3 (Simple Storage Service)

S3 refers to a class of object storage services. It is hosted by several cloud provider (e.g., [AWS S3](https://aws.amazon.com/s3/), [Cloudflare R2](https://www.cloudflare.com/developer-platform/solutions/s3-compatible-object-storage/), [Hetzner Object Storage](https://www.hetzner.com/storage/object-storage/)) and can be self-hosted (e.g., with [Garage](https://garagehq.deuxfleurs.fr/)). Loculus uses it for the [file sharing feature](#file-sharing-feature).

### S3 credentials

S3 credentials consist of two parts: an Access Key ID (public) and a Secret Access Key (private). Together, they function much like a username and password. Unlike a single account login, however, you can create multiple key pairs in S3, each with its own permissions and scope of access.

An Access Key ID might look like: `AKIAIOSFODNN7EXAMPLE`

A Secret Key might look like: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`

### Schema

A schema is a part of the configuration and describes the data structure of an instance. It includes the list of organisms and, for each [organism](#organism), the available [metadata](#metadata) fields and [segments](#segment).

### Secret key (S3)

See [S3 credentials](#s3-credentials).

### Segment

A segment refers to a part of a genome. Some viruses only have one segment (e.g., SARS-CoV-2 and mpox) while others have multiple (e.g., Influenza A has 8 segments). Loculus supports both single- and multi-segmented [organisms](#organism). In terms of the data structure, each segment is a nucleotide sequence; i.e., for a multi-segmented organism, there are multiple nucleotide sequences per sequence entry.

### Sequence entry

A sequence entry consists of a genome sequence (or sequences if the organisms has a segmented genome) and associated [metadata](#metadata). It is the main entity of the Loculus application. Users submit sequence entries and search for sequence entries. Each sequence entry has its own [accession](#accession). Changes to sequence entries are [versioned](#version), meaning that a sequence entry can have multiple versions.

### SILO

SILO is an [open-source query engine](https://github.com/GenSpectrum/LAPIS-SILO) for genomic sequences. It is usually used together with [LAPIS](#lapis) which provides more convenient APIs. In Loculus, there is a SILO instance for each [organism](#organism).

### Submission

A submission adds new [sequence entries](#sequence-entry). See also [revision](#revision) and [revocation](#revocation).

### Submitter

A submitter is a user who submitted (or revised or revoked) a sequence.

### Submitting group

In Loculus, every [sequence entry](#sequence-entry) belongs to a submitting group. A submitting group can have one or more users and a user may be member of multiple groups. A member of a group may submit new sequences or revise or revoke existing sequences on behalf of the group.

### Substitution

A substitution is a type of [mutation](#mutation) where at a given position in a sample a nucleotide or amino acid differs from the reference sequence. The notation for a mutation in the case of a single-segmented nucleotide sequence is `<base of reference genome><position><base of the sequence>` (e.g., C100T). A mutation in the case of a [multi-segmented](#segment) nucleotide sequence or an amino acid sequence is further prefixed with the segment or gene name by adding `<segment/gene name>:` (e.g., E:S100K).

### Superuser

A superuser is a user role. Superusers have the privileges to act on behalf of any [submitting group](#submitting-group). This role is designed to be used by curators.

### Unaligned sequence

An unaligned sequence is a sequence that has not undergone [alignment](#aligned-sequence). It may or may not have the same length as the [reference sequence](#reference-sequences). Generally users upload unaligned sequences.

### Unprocessed data

The unprocessed data consists of the original submissions, including unaligned sequences and their accompanying metadata. Unprocessed data needs to be processed by the [preprocessing pipeline](#preprocessing-pipeline). Users can usually only see the processed data.

### Version

[Sequence entries](#sequence-entry) are versioned and every revision creates a new version. The first version is 1.

### Website

The "Loculus website" is the frontend part of Loculus. It interacts with the [backend](#backend) and [LAPIS](#lapis) through their APIs. The website is written in TypeScript and uses the frameworks Astro and React.
