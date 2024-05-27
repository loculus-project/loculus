"""Get segment details for each sequence - in INSDC this is in the fasta description."""

from pathlib import Path
import re
import logging
import pandas as pd
from dataclasses import dataclass

import click
from Bio import SeqIO
import yaml


@dataclass
class Config:
    segmented: str
    nucleotideSequences: list[str]


logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input-seq", required=True, type=click.Path(exists=True))
@click.option("--input-metadata", required=True, type=click.Path(exists=True))
@click.option("--output-seq", required=True, type=click.Path())
@click.option("--output-metadata", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    config_file: str,
    input_seq: str,
    input_metadata: str,
    output_seq: str,
    output_metadata: str,
    log_level: str,
) -> None:
    logger.setLevel(log_level)

    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)

    def write_to_fasta(data, filename):
        if not data:
            Path(filename).touch()
            return
        with open(filename, "a") as file:
            for record in data:
                file.write(f">{record.id}\n{record.seq}\n")

    if not config.segmented:
        logger.error("Error: tried to get segment for non-segmented virus")
    else:
        metadata_df = pd.read_csv(input_metadata, sep="\t", dtype=str, keep_default_na=False)
        number_of_records = len(metadata_df)
        logging.info(f"Found {number_of_records} sequences")

        # Discard all sequences with unclear segment annotations
        # Append segment to end of NCBI accession ID to conform with LAPIS formatting
        metadata_df["segment"] = None
        segmented_seq = {}
        processed_seq = []
        with open(input_seq) as f:
            records = SeqIO.parse(f, "fasta")
            for record in records:
                for segment in config.nucleotideSequences:
                    re_input = re.compile(".*segment {0}.*".format(segment), re.IGNORECASE)
                    found_segment = re_input.search(record.description)
                    if found_segment:
                        metadata_df.loc[
                            metadata_df["genbank_accession"] == record.id, "segment"
                        ] = segment
                        segmented_seq[record.id] = record
                        processed_seq.append(record)

        metadata_df = metadata_df.dropna(subset=["segment"])

        logging.info(
            f"Discarded {number_of_records - len(metadata_df)} sequences that did not have segment"
            "information."
        )

        write_to_fasta(processed_seq, output_seq)
        metadata_df.to_csv(output_metadata, sep="\t")


if __name__ == "__main__":
    main()
