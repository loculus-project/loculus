---
title: What is a preprocessing pipeline?
---

Before submitted user data is available for review and release, it is first processed by a [preprocessing pipeline](../../reference/glossary/#preprocessing-pipeline). The preprocessing pipelines hold most of the organism- and domain-specific logic within a Loculus instance. They take the submitted input data and, as a minimum, validate them to ensure that the submitted data follow the defined format. Additionally, they can clean the data and enrich them by adding annotations and sequence alignments.

Using an [existing pipeline](../existing-preprocessing-pipelines/) is the fastest way to get started with Loculus, but it is also easy to develop new pipelines that use custom tooling and logic. For a very brief guide on how to build a new pipeline, please see [here](../build-new-preprocessing-pipeline/).

## Tasks

The preprocessing pipeline receives the user submitted data and then validates and enriches this data.
While the exact functionality depends on the specific pipeline, generally a pipeline will do the following things:

**Parsing:** The preprocessing pipeline receives the input data as strings and transforms them into the right format. For example, assuming there is a field `age` of type `integer`, given an input `{"age": "2"}` the preprocessing pipeline should transform it to `{"age": 2}` (simple type conversion). In another case, assuming there is a field `sequencingDate` of type `date`, the preprocessing pipeline might transform `{"sequencingDate": "30 August 2023"}` to the expected format of `{"sequencingDate": "2023-08-30"}`.

**Validation:** The preprocessing pipeline checks the input data and emits errors or warnings. As mentioned above, the only constraint is that the output of the preprocessing pipeline conforms to the right (technical) format. Otherwise, a pipeline may be generous (e.g., allow every value in the "country" field) or be more restrictive (e.g., only allow a fixed set of values in the "country" field).

**Alignment and translations:** The submitter only provides unaligned nucleotide sequences. If you want to allow searching by nucleotide and amino acid mutations, the preprocessing pipeline needs to perform the alignment and compute the translations to amino acid sequences.

**Annotation:** The preprocessing pipeline can add annotations such as clade/lineage classifications.

**Quality control (QC):** The preprocessing pipeline should check the quality of the sequences (and the metadata).

## Pipeline versions

As the preprocessing logic might change over time, preprocessing pipelines are versioned (You specify the pipeline version under `<organismConfig>.preprocessing.version`).
The backend keeps track of which sequences have successfully been processed with which pipeline version.
Once all data for an organism has successfully been processed with a new version, that version will also automatically be served to users.
