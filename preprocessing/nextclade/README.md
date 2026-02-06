# Preprocessing pipeline

This preprocessing pipeline has been developed by the Loculus team. It requests unaligned nucleotide sequences from `/extract-unprocessed-data` and submits the results of performing some metadata checks, and often a Nextclade run, to `/submit-processed-data`. If no nextclade dataset is given only perform metadata checks. The Pipeline can also be configured to generate `embl` files and upload them to the backend.

## Overview

1. Download [Nextclade dataset](https://docs.nextstrain.org/projects/nextclade/en/stable/user/datasets.html) for the pathogen - this is required for the preprocessing pipeline. Follow the steps in the [dataset creation guide](https://github.com/nextstrain/nextclade_data/blob/master/docs/dataset-creation-guide.md) to create a dataset for your pathogen if a dataset does not currently exist.
1. Poll server for new sequences
1. Put sequences into temporary directory
1. Run Nextclade on sequences
1. Parse Nextclade results
1. Delete temporary directory
1. Perform other metadata checks and formatting (see [Preprocessing Checks](#preprocessing-checks))
1. Submit results to server

## Setup

### Installation

1. Install `conda`/`mamba`/`micromamba`: see e.g. [micromamba installation docs](https://mamba.readthedocs.io/en/latest/installation/micromamba-installation.html)
1. Install environment:

   ```sh
   mamba env create -n loculus-nextclade -f environment.yml
   ```

   or 

   ```sh
   micromamba create -f environment.yml
   ```

### Running

1. Start backend (see [backend README](../backend/README.md)), run ingest script to submit sequences from INSDC. (Alternatively you can run `./deploy.py --enablePreprocessing` to start the backend and preprocessing pods in one command.)

1. Run pipeline

   ```bash
   mamba activate loculus-nextclade
   pip install -e .
   prepro
   ```

### Tests

Tests can be run from the same directory

```sh
mamba activate loculus-nextclade
pip install -e '.[test]'
pytest
```

Note that we do not add the tests folder to the docker image. In the CI tests are run using the same mamba environment as the preprocessing docker image but do not use the actual docker image. We chose this approach as it makes the CI tests faster but could potentially lead to the tests using a different program version than used in the docker image.

### Docker

Build:

```bash
docker build  --platform=linux/amd64 --tag nextclade_processing .
```

Run (TODO: port-forwarding):

```bash
docker run -it --platform=linux/amd64 --network host --rm nextclade_processing python main.py
```

## Development

- Install Ruff to lint/format
- Enable type checking. In VSCode this can be done by opening the `User Settings` (Command+shift+P on mac), navigating to `python > analysis: type checking mode` and setting this to `basic`.

When deployed on kubernetes the preprocessing pipeline reads in config files which are created by `loculus/kubernetes/loculus/templates/loculus-preprocessing-config.yaml`. When run locally the pipeline uses only the default values defined in `preprocessing/nextclade/src/loculus_preprocessing/config.py`. When running the preprocessing pipeline locally it makes sense to create a local config file using the command:

```sh
../../generate_local_test_config.sh
```

and use this in the pipeline as follows:

```sh
prepro --config-file=../../website/tests/config/preprocessing-config.{organism}.yaml --keep-tmp-dir
```

Additionally, the `--keep-tmp-dir` is useful for debugging issues. The results of nextclade run will be stored in the temp directory, as well as a file called `submission_requests.json` which contains a log of the full submit requests that are sent to the backend.

## Sequence Assignment/Classification for Sequences with Multiple Segments and/or Multiple References

The preprocessing pipeline is configured to take entries with multiple nucleotide sequences and classify which segment/reference each sequence best aligns to - it returns the identity of each sequence with a sequence name to fastaId map `sequenceNameToFastaId`. This can also be used to identify which reference a sequence best aligns to in the case that multiple references exist. The `sequenceName` uses the segment-reference structure expected by the backend (and query engine):
 - For an organisms without multiple references the `sequenceName` in the name of the segment (the segment name `main` is used for the single segment edge case).
 - For single-segmented, multi-reference organisms the `sequenceName` is the name of the reference.
 - For multi-segment, multi-reference organisms the `sequenceName` is the `{segmentName}-{referenceName}`.
 
Currently the prepro pipeline is configured to only accept one copy of each segment in a submission entry. The classification of sequences to the sequence they best align to can be done using three different algorithms, which algorithm is used is determined by the `segment_classification_method` config field. (Additionally for non-alignment configurations segment classification can be performed by parsing the fastaId):

- `ALIGN`: uses [nextclade run](https://docs.nextstrain.org/projects/nextclade/en/stable/user/nextclade-cli/reference.html#nextclade-run) to align sequences. The algorithm uses the alignment score to classify the sequence. To use this method a nextclade server and dataset must be configured.
- `MINIMIZER`: uses [nextclade sort](https://docs.nextstrain.org/projects/nextclade/en/stable/user/nextclade-cli/reference.html#nextclade-sort) to perform fast local alignment of sequences to a reference (called `dataset`) based on k-mers of the reference that are stored in a minimizer index. Again classification is based on a score. To use this method you need to define a `minimizer index`, see https://github.com/loculus-project/nextclade-sort-minimizers for details. This is the fastest algorithm but might suffer performance issues for highly divergent sequences. The `accepted_dataset_matches` list can be updated to include multiple reference `dataset`s that when matched will result in the same classification.
- `DIAMOND`: uses [diamond blastx](https://github.com/bbuchfink/diamond) to perform pairwise alignment of (auto-translated) nucleotides to protein sequences using BLAST. To use this method you need to define a `diamond database`, see https://github.com/loculus-project/diamond-reference-databases for details. Diamond matches nucleotide sequences to protein translations, if there are multiple proteins in a reference `dataset` a match to any of the proteins should result in a match to the same dataset. This can be accomplished by ensuring each protein in the dataset has the name `{dataset}|CDS|i}` (where `i` is a digit) or alternatively, adding each protein to the `accepted_dataset_matches` list.

## Preprocessing Checks

### Type Check

Preprocessing checks that the type of each metadata field corresponds to the expected `type` value seen in the config. If no type is given we assume the metadata field should be of type string.

### Required value Check

Additionally, we check that if a field is required, e.g. `required` is true that that field is not None.

### Custom Preprocessing Functions

If no additional `preprocessing` field is specified we assume that field uses the `identity` function, i.e. the output should be the same as the input. If a specific `type` is given the input will be converted to that type.

However, the `preprocessing` field can be customized to take an arbitrary number of input metadata fields, perform a function on them and then output the desired metadata field. We have defined the following preprocessing functions but more can be added for your own custom instance.

0. `identity`: Return the input field in the desired type.
1. `parse_and_assert_past_date`: Take a date string and return a date field in the "%Y-%m-%d" format, ensure date is before release_date or today's date. Incomplete dates `%Y` or `%Y-%m` default the unspecified part to `1`.
2. `check_date`: Take a date string and return a date field in the "%Y-%m-%d" format. Incomplete dates `%Y` or `%Y-%m` default the unspecified part to `1`.
3. `parse_timestamp`: Take a timestamp e.g. 2022-11-01T00:00:00Z and return that field in the "%Y-%m-%d" format.
4. `parse_date_into_range`: Takes an incomplete (or complete) date (Just `%Y`, just `%Y-%m` or a full date) and turns it into two date fields: an upper and a lower date for the date range. Can optionally take another date field (the release date) into account, as an upper bound for the date range. For example, a sample collected in "2025-03" and released "2025-03-23" will mean the lower bound for the collection date is 2025-03-01 and the upper bound is the release date, 2025-03-23. To use this function fully, define three metadata fields: one for the plain string, one for the upper bound, one for the lower bound. See example below.
5. `concatenate`: Take multiple metadata fields (including the accessionVersion) and concatenate them in the order specified by the `arg.order` parameter, fields will first be processed based on their `arg.type` (the order of the types should correspond to the order of fields specified by the order argument).
6. `process_options`: Only accept input that is in `args.options`, this check is case-insensitive. If input value is not in options raise an error, or return null if the submitter is in the "insdc_ingest" group.
7. `check_regex`: Validate that the input field matches the pattern in `args.pattern`.
8. `extract_regex`: Extracts a substring from input field using the provided regex `args.pattern` with a `args.capture_group`. For example the pattern `^(?P<segment>[^-]+)-(?P<subtype>[^-]+)$` with capture group `subtype` would extract `HA` from the field `seg1-HA`. Returns an error if the pattern does not match (and internal error if capture group does not exist in pattern). If `arg.uppercase` is added the extracted string will be capitalized.

Using these functions in your `values.yaml` will look like:

```yaml
- name: sampleCollectionDate
   type: date
   preprocessing:
      function: parse_and_assert_past_date
      inputs:
         date: sampleCollectionDate
   required: true
- name: displayName
   preprocessing:
      function: concatenate
      inputs:
         geoLocCountry: geoLocCountry
         sampleCollectionDate: sampleCollectionDate
      args:
         order: [geoLocCountry, accession_version, sampleCollectionDate]
         type: [string, string, date]
- name: country
   preprocessing:
      function: process_options
      inputs:
         input: geoLocCountry
      args:
         options:
            - Argentina
            - Bolivia
            _ Columbia
            -...
```

Example of using the `parse_date_into_range` below. The same function is called three times on three fields, but with different `fieldType` argument. The `sampleCollectionDate` is a required input field, while the other two fields are `noInput`:

```yaml
- name: sampleCollectionDate
  displayName: Collection date
  required: true
  preprocessing:
    function: parse_date_into_range
    inputs:
      date: sampleCollectionDate
      releaseDate: ncbiReleaseDate
    args:
      fieldType: dateRangeString
  notSearchable: true
- name: sampleCollectionDateRangeLower
  displayName: Collection date (lower bound)
  type: date
  noInput: true
  preprocessing:
    function: parse_date_into_range
    inputs:
      date: sampleCollectionDate
      releaseDate: ncbiReleaseDate
    args:
      fieldType: dateRangeLower
- name: sampleCollectionDateRangeUpper
  displayName: Collection date (upper bound)
  type: date
  noInput: true
  preprocessing:
    function: parse_date_into_range
    inputs:
      date: sampleCollectionDate
      releaseDate: ncbiReleaseDate
    args:
      fieldType: dateRangeUpper
```

### Nextclade results

Metadata fields that are created from the results of the nextclade analysis require the input field to be prefaced with `nextclade.` For example:

```yaml
- name: totalSnps
  type: int
  perSegment: true
  displayName: Total SNPs
  preprocessing:
    inputs: {input: nextclade.totalSubstitutions}
```
Note that adding the `perSegment` field will mean that for a multi-segmented organism, preprocessing will create a `totalSnps_<segment>` field for each segment containing the nextclade results of that specific segment. In general, all nextclade metadata fields should be `perSegment`. 

## Deployment

It is possible to run multiple preprocessing pipelines at once, ideally these will be labeled as different versions and point to different `dockerTags` (dockerTags can specify a commit).

If you choose to run multiple preprocessing pipelines with the same version, they will be additionally numbered by their instance, e.g. `loculus-preprocessing-west-nile-v1-0-ff798759b` and `loculus-preprocessing-west-nile-v1-1-ff798759b`. 

To add multiple preprocessing pipelines alter the preprocessing section of the `values.yaml` as follows:

```yaml
   preprocessing:
      -  image: ghcr.io/loculus-project/preprocessing-nextclade
         args:
            - "prepro"
         version: 1
         dockerTag: commit-xxxxx
         configFile:
            nextclade_sequence_and_datasets:
            - name: main # default value, not actually required
               nextclade_dataset_name: nextstrain/wnv/all-lineages
               genes: [capsid, prM, env, NS1, NS2A, NS2B, NS3, NS4A, 2K, NS4B, NS5]
            batch_size: 100
      -  image: ghcr.io/loculus-project/preprocessing-nextclade
         args:
            - "prepro"
         version: 2
         dockerTag: commit-yyyyyyy
         configFile:
            nextclade_sequence_and_datasets:
            - name: main
               nextclade_dataset_name: nextstrain/wnv/all-lineages
               genes: [capsid, prM, env, NS1, NS2A, NS2B, NS3, NS4A, 2K, NS4B, NS5]
            batch_size: 100
```
