# Pipeline to ingest data from INSDC into loculus

## Overview

1. Download data from INSDC
2. Filtering
3. Turn into FASTA/Metadata
4. Upload to loculus

## Deployment

In production the ingest pipeline runs in a docker container that takes a config file as input.

We use the Snakemake workflow management system which also uses different config files:

- `profiles/default/config.yaml` sets default command line options while running Snakemake.
- `config/config.yaml` turns into a config dict in the `Snakefile` (attributes defined in this file become global variables in the `Snakefile`).

TLDR: The `Snakefile` contains workflows defined as rules with required input and expected output files. By default Snakemake takes the first rule as the target one and then constructs a graph of dependencies (a DAG) required to produce the expected output of the first rule. The target rule can be specified using `snakemake {rule}`

## Local Development

Install micromamba, if you are on a mac:

```
brew install micromamba
```

Then configure micromamba

```
micromamba shell init --shell zsh --root-prefix=~/micromamba
source ~/.zshrc
```

Then activate the loculus-ingest environment

```
micromamba create -f environment.yml --platform osx-64 --rc-file .mambarc
micromamba activate loculus-ingest
```

Then run snakemake using `snakemake` or `snakemake {rule}`.

Note that by default the pipeline will submit sequences to main. If you want to change this to another branch (that has a preview tag) you can modify the `backend_url` and `keycloak_token_url` arguments in the `config.yaml` file. They are of the form `https://backend-{branch_name}.loculus.org/` and `https://authentication-{branch_name}.loculus.org`. Alternatively, if you are running the backend locally you can also specify the local backend port: `http://localhost:8079` and the local keyclock port: `http://localhost:8083`.
