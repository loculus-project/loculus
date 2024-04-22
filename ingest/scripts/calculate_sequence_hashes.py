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

    df = pd.Series(results).reset_index().rename(columns={"index": "accession", 0: "sequence_md5"})
    df.to_csv(output, sep="\t", index=False)


if __name__ == "__main__":
    main()
