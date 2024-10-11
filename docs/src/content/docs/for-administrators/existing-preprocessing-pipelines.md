---
title: Existing preprocessing pipelines
---

[Preprocessing pipelines](../../introduction/glossary/#preprocessing-pipeline) hold most of the organism- and domain-specific logic within a Loculus instance. They take the submitted input data and, as a minimum, validate them to ensure that the submitted data follow the defined format. Additionally, they can clean the data and enrich them by adding annotations and sequence alignments.

The Loculus team maintain a customizable processing pipeline which uses [Nextclade](../../introduction/glossary/#nextclade) to align sequences to a reference and generate statistics, which is discussed in more detail below.

Using an existing pipeline is the fastest way to get started with Loculus, but it is also easy to develop new pipelines that use custom tooling and logic. For a very brief guide on how to build a new pipeline, please see [here](../build-new-preprocessing-pipeline/).

If you have developed a pipeline and would like it to be added to this list, please contact us!

## Nextclade-based pipeline

_Maintained by the Loculus team_

This pipeline supports all [schemas](../introduction/glossary/#schema) where each segment has one unique reference that it should be aligned to, e.g. the [one organism, multi-segment schema](./schema-designs.md#one-organism-for-everything), the [multi-organism schema](./schema-designs.md#multiple-clearly-separated-organisms-each-with-one-reference) and even the [no alignment schema](./schema-designs.md#no-aligments-at-all).

Given a nextclade dataset this pipeline uses [nextclade run](https://docs.nextstrain.org/projects/nextclade/en/stable/user/nextclade-cli/reference.html#nextclade-run) for alignment, mutation calling, and quality checks. When no nextclade dataset is given the pipeline will not do any sequence validation and only perform metadata checks (see below). The pipeline requires a [Nextclade dataset](https://docs.nextstrain.org/projects/nextclade/en/stable/user/datasets.html) with the same reference genome as the one used by Loculus, `nextclade` will also perform clade assignment and phylogenetic placement if the `dataset` includes this information. To use this pipeline for new pathogens, check if there is already an existing nextclade dataset for that pathogen [here](https://github.com/nextstrain/nextclade_data/tree/master/data), or follow the steps in the [dataset creation guide](https://github.com/nextstrain/nextclade_data/blob/master/docs/dataset-creation-guide.md) to create a new dataset. For example for mpox we use [nextstrain/mpox/all-clades](https://github.com/nextstrain/nextclade_data/tree/master/data/nextstrain/mpox/all-clades), defined in the `values.yaml` as:

```yaml
preprocessing:
    - configFile:
          nextclade_dataset_name: nextstrain/mpox/all-clades
```

Additionally the pipeline performs checks on the metadata fields. The checks are defined by custom preprocessing functions in the `values.yaml` file. These checks can be applied to and customized for other metadata fields, see [Preprocessing Checks](https://github.com/loculus-project/loculus/blob/main/preprocessing/nextclade/README.md#preprocessing-checks) for more info.

In the default configuration the pipeline performs:

-   **type checks**: Checks that the type of each metadata field corresponds to the expected `type` value seen in the config (default is string).
-   **required value checks**: Checks that if a field is required, e.g. `required` field in config is true, that that field is not None.
-   **INSDC-accepted country checks**: Using the `process_options` preprocessing function checks that the `geoLocCountry` field is set to an [INSDC-accepted country](https://www.ebi.ac.uk/ena/browser/api/xml/ERC000011) option.

The pipeline also formats metadata fields:

-   **process date**: Takes a date string and returns a date field in the "%Y-%m-%d" format.
-   **parse timestamp**: Takes a timestamp e.g. 2022-11-01T00:00:00Z and returns that field in the "%Y-%m-%d" format.

The code is available on [GitHub](https://github.com/loculus-project/loculus/tree/main/preprocessing/nextclade) under the [AGPL-3.0 license](https://github.com/loculus-project/loculus/blob/main/LICENSE).
