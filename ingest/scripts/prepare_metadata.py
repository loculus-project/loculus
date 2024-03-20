"""Script to rename fields and transform values prior to submission to Loculus"""

# Needs to be configurable via yaml file
# Start off with a simple mapping
# Add transformations that can be applied to certain fields
# Like separation of country into country and division

import hashlib
import logging
from dataclasses import dataclass

import click
import pandas as pd
import yaml

logging.basicConfig(level=logging.DEBUG)


@dataclass
class Config:
    compound_country_field: str
    fasta_id_field: str
    rename: dict[str, str]
    keep: list[str]


def hash_row_with_columns(row: pd.Series) -> str:
    items = sorted((f"{col}_{val}" for col, val in row.items()))
    row_string = "".join(items)
    return hashlib.sha256(row_string.encode()).hexdigest()


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--output", required=True, type=click.Path())
def main(config_file: str, input: str, output: str):
    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)
    logging.debug(config)
    df = pd.read_csv(input, sep="\t").sort_values(by=config.compound_country_field)
    logging.debug(df.columns)
    df["division"] = df[config.compound_country_field].str.split(":", n=1).str[1].str.strip()
    logging.debug(df["division"].unique())
    df["country"] = df[config.compound_country_field].str.split(":", n=1).str[0].str.strip()
    logging.debug(df["country"].unique())
    df["submissionId"] = df[config.fasta_id_field]
    logging.debug(df["submissionId"].unique())
    df["insdc_accession_base"] = df[config.fasta_id_field].str.split(".", n=1).str[0]
    logging.debug(df["insdc_accession_base"])
    df["insdc_version"] = df[config.fasta_id_field].str.split(".", n=1).str[1]
    logging.debug(df["insdc_version"].unique())
    df = df.rename(columns=config.rename)
    # Drop columns that are neither a value of `rename` nor in `keep`
    df = df.drop(columns=set(df.columns) - set(config.rename.values()) - set(config.keep))
    # Create a metadata hash that is independent of the order of the columns
    df["metadata_hash"] = df.apply(hash_row_with_columns, axis=1)
    df.to_csv(output, sep="\t", index=False)


if __name__ == "__main__":
    main()
