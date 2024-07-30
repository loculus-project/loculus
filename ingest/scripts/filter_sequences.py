"""filters sequences by fasta header."""

import logging
import re
from dataclasses import dataclass

import click
import yaml
from Bio import SeqIO


@dataclass
class Config:
    filter_fasta_headers: str


logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@click.command(help="Parse fasta header, only keep if fits regex filter_fasta_headers")
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input-seq", required=True, type=click.Path(exists=True))
@click.option("--output-seq", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    config_file: str,
    input_seq: str,
    output_seq: str,
    log_level: str,
) -> None:
    logger.setLevel(log_level)

    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)

    # Discard all sequences without filter_fasta_headers in their header
    discarded = 0
    found = 0
    with open(output_seq, "a") as output_file:
        with open(input_seq) as f:
            records = SeqIO.parse(f, "fasta")
            for record in records:
                found_segment = re.search(config.filter_fasta_headers, record.description)
                if found_segment:
                    found += 1
                    output_file.write(f">{record.id}\n{record.seq}\n")
                else:
                    discarded += 1

        logging.info(
            f"Discarded {discarded} out of {discarded + found} sequences, as they did not contain the filter_fasta_headers: {config.filter_fasta_headers}."
        )


if __name__ == "__main__":
    main()
