
# NCBI taxonomy download
This module retrieves taxonomic information from NCBI's [FTP server](https://ftp.ncbi.nih.gov/pub/taxonomy/) and turns it into a single-table sqlite database to use in preprocessing.


## Setup

1. Install `conda`/`mamba`/`micromamba`: see e.g. [micromamba installation docs](https://mamba.readthedocs.io/en/latest/installation/micromamba-installation.html)
2. Install environment:

```sh
micromamba env create -n loculus-ncbi-taxonomy -f environment.yml
```


### Running

Installing the module provides the `taxonomy-download` command, which can be used to run this module by providing the desired name of the output database:

```bash
micromamba activate loculus-ncbi-taxonomy
pip install -e .
taxonomy-download --output_db <DATABASE_NAME>
```

This will create a database at the specified output file.
The database will have the following schema:

```sql
CREATE TABLE IF NOT EXISTS "taxonomy" (
"tax_id" INTEGER,                 # the taxon ID
  "common_name" TEXT,             # the common name associated with the taxon (can be empty)
  "scientific_name" TEXT,         # the scientific name associated with the taxon
  "parent_id" INTEGER,            # the taxon_id of the taxon's parent in the taxonomy
  "depth" INTEGER                 # how many steps this taxon is removed from the root
);
CREATE UNIQUE INDEX idx_tax_id ON taxonomy(tax_id);
CREATE INDEX idx_parent_id ON taxonomy(parent_id);
CREATE INDEX idx_scientific_name ON taxonomy(scientific_name);
CREATE TABLE sqlite_stat1(tbl,idx,stat);
CREATE TABLE sqlite_stat4(tbl,idx,neq,nlt,ndlt,sample);
```


### Tests

Tests can be run from this directory

```sh
micromamba activate loculus-ncbi-taxonomy
pytest
```
