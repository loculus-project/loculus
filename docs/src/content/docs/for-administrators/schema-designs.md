---
title: Schema designs
description: Different ways to design the schema of a Loculus instance
---

Loculus is very flexible in its data model and there are different ways to design the [schema](../../introduction/glossary#schema). Technically, a Loculus instance can have one or multiple organisms and each organism has

-   a set of metadata fields
-   a set of unaligned nucleotide sequences
-   a set of aligned nucleotide sequences
-   a set of aligned amino acid sequences

The different nucleotide sequences are called segments and the different amino acid sequences are called genes but they do not need to be biological segments and genes. If there is only one nucleotide sequence, it may but does not need to have a name. If there are multiple nucleotide sequences, they must be named. The amino acid sequences must always be named.

Importantly, it is not required that the aligned nucleotide sequences are actual alignments of the unaligned nucleotide sequences. An aligned nucleotide sequence just means that there is a reference sequence and that all sequences are of the same length, and that it is possible to query it by mutations.

Below, we provide a few example models and use cases. We have not tried all of them at this moment and it might not be straightforward to configure them. Please feel free to reach out if you are interested in discussing whether Loculus is suitable for your use case.

## Example schemas

### Multiple clearly separated organisms, each with one reference

This is the typical model for Loculus. The Loculus instance contains one or more organisms, with all sequences of an organism aligned to a single organism-specific reference. Users submit an unaligned nucleotide sequence for a particular organism and the preprocessing pipeline aligns it against that organism's configured reference genome.

This is a good model if:

-   Each sample (taken from the host) only has one (possibly multi-segmented) sequence.
-   For each organism, it is clear which reference genome to use.
-   There is a proper processing pipeline for each organism.
-   Users are expected to analyze the organisms independently (e.g., users don’t desire a table containing sequences from different organisms).

### One organism for everything

On the opposite end of the spectrum, it is possible to only have one “technical organism” in Loculus to store all the data. There are multiple “technical segments” with each segment storing the sequence of a different “actual organism”. Users submit a multi-segment file (e.g., a FASTA containing`>sample1_covid`,`>sample1_rsv-a`, ...).

This is a good model if:

-   Samples are sequenced with a multi-pathogen panel and may contain sequences from one or multiple pathogens (i.e., co-infections).
-   Sequences of different organisms share the same (sampling and host) metadata.
-   Users want to see co-infection data (e.g., a sequence details page listing all sequences from the sample).

### Multiple references for an organism

An organism has one unaligned sequence (per segment) but multiple aligned ones. Users submit an unaligned nucleotide sequence and the processing pipeline aligns it against all multiple references.

This is a good model if there are multiple reference genomes for an organism.

### No alignments at all

It is also possible to use Loculus without defining any aligned nucleotide or amino acid sequences but just use it to share metadata and unaligned nucleotide sequences.
