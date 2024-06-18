"""For each downloaded sequences calculate md5 hash and put into JSON"""

import hashlib
import json
import logging
from pathlib import Path

import click
from Bio import SeqIO


logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@click.command()
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--output-hashes", required=True, type=click.Path())
@click.option("--output-sequences", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(input: str, output_hashes: str, output_sequences: str, log_level: str) -> None:
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    hashes = {}
    sequences = {}

    with open(input) as f:
        records = SeqIO.parse(f, "fasta")
        for record in records:
            hashes[record.id] = hashlib.md5(str(record.seq).encode()).hexdigest()
            sequences[record.id] = str(record.seq)

    logger.info(f"Calculated hashes for {len(hashes)} sequences")

    # Save results to JSON
    Path(output_hashes).write_text(json.dumps(hashes, indent=4))
    Path(output_sequences).write_text(json.dumps(sequences, indent=4))


if __name__ == "__main__":
    main()
