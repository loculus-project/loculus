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


@dataclass
class Config:
    compound_country_field: str
    fasta_id_field: str
    rename: dict[str, str]
    keep: list[str]


def hash_row_with_columns(row: pd.Series) -> str:
    items = sorted((f"{col}_{val}" for col, val in row.items()))
    row_string = "".join(items)
    return hashlib.md5(row_string.encode()).hexdigest()


def split_authors(authors: str) -> str:
    """Split authors by each second comma, then split by comma and reverse
    So Xi,L.,Yu,X. becomes L. Xi, X. Yu
    Where first name and last name are separated by no-break space"""
    single_split = authors.split(",")
    result = []

    for i in range(0, len(single_split), 2):
        if i + 1 < len(single_split):
            result.append(single_split[i + 1].strip() + "\u00a0" + single_split[i].strip())
        else:
            result.append(single_split[i].strip())

    return ", ".join(result)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--sequence-hashes", required=True, type=click.Path(exists=True))
@click.option("--output", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(config_file: str, input: str, sequence_hashes: str, output: str, log_level: str) -> None:
    logging.basicConfig(level=log_level)
    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)
    logging.debug(config)
    # Read sequence hashes
    hash_df = pd.read_csv(sequence_hashes, sep="\t", dtype=str)
    df = pd.read_csv(input, sep="\t", dtype=str).sort_values(by=config.compound_country_field)

    # Join the two dataframes on respective indexes
    # df: fasta_id_field, and hash_df: accession
    # But don't set the index
    df = df.merge(hash_df, left_on=config.fasta_id_field, right_on="accession", how="inner")
    
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
    logging.debug(df["ncbi_submitter_names"])
    df["ncbi_submitter_names"] = df["ncbi_submitter_names"].map(lambda x: split_authors(str(x)))
    df = df.rename(columns=config.rename)
    # Drop columns that are neither a value of `rename` nor in `keep`
    df = df.drop(columns=set(df.columns) - set(config.rename.values()) - set(config.keep))
    # Create a metadata hash that is independent of the order of the columns
    df["hash"] = df.apply(hash_row_with_columns, axis=1)
    df.to_csv(output, sep="\t", index=False)


if __name__ == "__main__":
    main()
