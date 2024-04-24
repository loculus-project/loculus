"""For each downloaded sequences calculate md5 hash and put into JSON
"""
import hashlib
import json
import logging
from pathlib import Path

import click
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
    
    # Save results to JSON
    Path(output).write_text(json.dumps(results, indent=4))



if __name__ == "__main__":
    main()
