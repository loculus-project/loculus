import logging
from collections import defaultdict
from msilib import sequence

import click
import pandas as pd


@click.command()
@click.option("--old-hashes", required=True, type=click.Path(exists=True))
@click.option("--sequence-hashes", required=True, type=click.Path(exists=True))
@click.option("--metadata", required=True, type=click.Path(exists=True))
@click.option("--to-submit", required=True, type=click.Path())
@click.option("--to-revise", required=True, type=click.Path())
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
    log_level: str,
) -> None:
    logging.basicConfig(level=log_level)

    old_hashes = pd.read_csv(old_hashes,sep="\t", dtype=str)
    sequence_hashes = pd.read_csv(sequence_hashes,sep="\t", dtype=str)
    metadata = pd.read_csv(metadata, sep="\t", dtype=str)

    # Read old_hashes into dict from json

    # For new sequences check if they are already published
    # If not published: submit
    # If published:
    #   Check 




    with open(input) as f:
        records = SeqIO.parse(f, "fasta")
        for record in records:
            results[record.id] = hashlib.md5(str(record.seq).encode()).hexdigest()

    df = pd.Series(results).reset_index().rename(columns={"index": "accession", 0: "md5"})
    df.to_csv(output, sep="\t", index=False)


if __name__ == "__main__":
    main()
