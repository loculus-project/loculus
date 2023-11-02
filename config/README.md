# Config

SILO/LAPIS, the website and the backend need a config file (called "database config" in SILO) that are mostly similar,
but slightly different.
This contains a script to generate the config files for each of the three from a given, common config file.

It's main purpose is to add metadata fields that are common and required for any Pathoplexus instance.
Those fields are set by the backend before exporting the data to SILO.
So in the context of preprocessing in the backend those fields must not be present,
since they are internal to the database.

In the context of searching for sequences, those fields will always be present, since the backend adds them.
So SILO, LAPIS and the website should have them configured.

## Config file

The input config file is a yaml file. See the example config file in the tests
or the schema in the implementation for the required schema.

## Usage

```bash
npm run generateConfig -- --inputFile ../website/tests/config/config.yml --outputDir ../website/tests/config
```
