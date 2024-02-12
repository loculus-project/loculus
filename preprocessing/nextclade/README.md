# Rudimentary SARS-CoV-2 Preprocessing Pipeline

This SARS-CoV-2 preprocessing pipeline is only for demonstration purposes. It requests unaligned nucleotide sequences from `/extract-unprocessed-data` and submits the results of a Nextclade run to `/submit-processed-data`.

## Overview

1. Download Nextclade dataset
1. Poll server for new sequences
1. Put sequences into temporary directory
1. Run Nextclade on sequences
1. Parse Nextclade results
1. Delete temporary directory
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
   python main.py
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
- Use `mypy` to check types: `mypy -p src  --python-version 3.12`
