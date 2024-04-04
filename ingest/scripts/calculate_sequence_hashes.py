"""Script to rename fields and transform values prior to submission to Loculus"""

# Needs to be configurable via yaml file
# Start off with a simple mapping
# Add transformations that can be applied to certain fields
# Like separation of country into country and division

import hashlib
import logging

import click
import pandas as pd
from Bio import SeqIO


@click.command()
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--output", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(input: str, output: str, log_level: str) -> None:
    logging.basicConfig(level=log_level)

    results = {}

    with open(input) as f:
        records = SeqIO.parse(f, "fasta")
        for record in records:
            results[record.id] = hashlib.md5(str(record.seq).encode()).hexdigest()

    df = pd.Series(results).reset_index().rename(columns={"index": "accession", 0: "md5"})
    df.to_csv(output, sep="\t", index=False)


if __name__ == "__main__":
    main()
