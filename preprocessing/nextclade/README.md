# Preprocessing Pipeline

This preprocessing pipeline is still a work in progress. It requests unaligned nucleotide sequences from `/extract-unprocessed-data` and submits the results of a Nextclade run to `/submit-processed-data`.

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

### Start directly

1. Install `conda`/`mamba`/`micromamba`: see e.g. [micromamba installation docs](https://mamba.readthedocs.io/en/latest/micromamba-installation.html#umamba-install)
2. Install environment:

   ```bash
   mamba env create -n loculus-nextclade -f environment.yml
   ```

3. Start backend (see [backend README](../backend/README.md))
4. Submit sequences to backend

   ```bash
   curl -X 'POST' 'http://localhost:8079/submit?username=testuser' \
       -H 'accept: application/json' \
       -H 'Content-Type: multipart/form-data'  \
       -F 'metadataFile=@testdata/metadata.tsv;type=text/tab-separated-values' \
       -F 'sequenceFile=@testdata/sequences.fasta'
   ```

5. Run pipeline

   ```bash
   mamba activate loculus-nextclade
   pip install -e .
   prepro
   ```

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

When deployed on kubernetes the preprocessing pipeline reads in config files which are created by `loculus/kubernetes/loculus/templates/loculus-preprocessing-config.yaml`. When run locally the pipeline uses only the default values defined in `preprocessing/nextclade/src/loculus_preprocessing/config.py`. When running the preprocessing pipeline locally it makes sense to create a local config file using the command:

```
../../generate_local_test_config.sh
```

and use this in the pipeline as follows:

```
prepro --config-file=../../temp/preprocessing-config.{organism}.yaml --keep-tmp-dir
```

Additionally, the `--keep-tmp-dir` is useful for debugging issues. The results of nextclade run will be stored in the temp directory, as well as a file called `submission_requests.json` which contains a log of the full submit requests that are sent to the backend.

## Preprocessing Checks

### Type Check

Preprocessing checks that the type of each metadata field corresponds to the expected `type` value seen in the config. If no type is given we assume the metadata field should be of type string.

### Required value Check

Additionally, we check that if a field is required, e.g. `required` is true that that field is not None.

### Custom Preprocessing Functions

If no additional `preprocessing` field is specified we assume that field uses the `identity` function, i.e. the output should be the same as the input. If a specific `type` is given the input will be converted to that type.

However, the `preprocessing` field can be customized to take an arbitrary number of input metadata fields, perform a function on them and then output the desired metadata field. We have defined the following preprocessing functions but more can be added for your own custom instance.

0. `identity`: Return the input field in the desired type.
1. `process_date`: Take a date string and return a date field in the "%Y-%m-%d" format
2. `parse_timestamp`: Take a timestamp e.g. 2022-11-01T00:00:00Z and return that field in the "%Y-%m-%d" format
3. `concatenate`: Take multiple metadata fields (including the accessionVersion) and concatenate them in the order specified by the `arg.order` parameter, fields will first be processed based on their `arg.type` (the order of the types should correspond to the order of fields specified by the order argument).
4. `process_options`: Only accept input that is in `args.options`, this check is case-insensitive. If input value is not in options return null.

Using these functions in your `values.yaml` will look like:

```
- name: sampleCollectionDate
   type: date
   preprocessing:
      function: process_date
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
