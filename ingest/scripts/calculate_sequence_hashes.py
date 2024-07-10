"""For each downloaded sequences calculate md5 hash and put into JSON"""

import hashlib
import logging

import click
import orjsonl
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

    counter = 0

    with open(input, encoding="utf-8") as f_in:
        records = SeqIO.parse(f_in, "fasta")
        for record in records:
            sequence = str(record.seq)
            hash = hashlib.md5(sequence.encode(), usedforsecurity=False).hexdigest()
            orjsonl.append(output_hashes, {"id": record.id, "hash": hash})
            orjsonl.append(output_sequences, {"id": record.id, "sequence": sequence})
            counter += 1

    logger.info(f"Calculated hashes for {counter} sequences")


if __name__ == "__main__":
    main()
