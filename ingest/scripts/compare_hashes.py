import json
import logging
from collections import defaultdict
from msilib import sequence

import click
import pandas as pd


@click.command()
@click.option("--old-hashes", required=True, type=click.Path(exists=True))
@click.option("--metadata", required=True, type=click.Path(exists=True))
@click.option("--to-submit", required=True, type=click.Path())
@click.option("--to-revise", required=True, type=click.Path())
@click.option("--unchanged", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    old_hashes: str,
    sequence_hashes: str,
    metadata: str,
    to_submit: str,
    to_revise: str,
    unchanged: str,
    log_level: str,
) -> None:
    logging.basicConfig(level=log_level)

    old_hashes = json.load(open(old_hashes))
    metadata = pd.read_csv(metadata, sep="\t", dtype=str)

    # Read old_hashes into dict from json

    # For new sequences check if they are already published
    # If not published: submit
    # If published:
    #   Check 

    # For each row in metadata:
    # Look at latest hash accession
    # Doesn't exist? Submit
    # Exists?
        # If hashes equal: unchanged
        # Otherwise: revise

if __name__ == "__main__":
    main()
