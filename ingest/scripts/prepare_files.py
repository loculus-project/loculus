import csv
import json
import logging
import sys
from dataclasses import dataclass
from pathlib import Path

import click
import yaml


@dataclass
class Config:
    segmented: str
    nucleotide_sequences: list[str]


logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)

# https://stackoverflow.com/questions/15063936
csv.field_size_limit(sys.maxsize)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--metadata-path", required=True, type=click.Path(exists=True))
@click.option("--sequences-path", required=False, type=click.Path(exists=True))
@click.option("--to-submit-path", required=True, type=click.Path(exists=True))
@click.option("--to-revise-path", required=True, type=click.Path(exists=True))
@click.option("--sequences-submit-path", required=False, type=click.Path())
@click.option("--sequences-revise-path", required=False, type=click.Path())
@click.option("--metadata-submit-path", required=True, type=click.Path())
@click.option("--metadata-revise-path", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    config_file: str,
    metadata_path: str,
    sequences_path: str,
    to_submit_path: str,
    to_revise_path: str,
    sequences_submit_path: str,
    sequences_revise_path: str,
    metadata_submit_path: str,
    metadata_revise_path: str,
    log_level: str,
) -> None:
    logger = logging.getLogger(__name__)
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)

    metadata = json.load(open(metadata_path))
    sequences = json.load(open(sequences_path))
    to_submit = json.load(open(to_submit_path))
    to_revise = json.load(open(to_revise_path))

    metadata_submit = []
    metadata_revise = []
    sequences_submit = {}
    sequences_revise = {}

    for fasta_id in to_submit:
        metadata_submit.append(metadata[fasta_id])
        if config.segmented:
            for nucleotideSequence in config.nucleotide_sequences:
                segmented_fasta_id = fasta_id + "_" + nucleotideSequence
                if segmented_fasta_id in sequences:
                    sequences_submit[segmented_fasta_id] = sequences[segmented_fasta_id]
        else:
            sequences_submit[fasta_id] = sequences[fasta_id]

    for fasta_id, loculus_accession in to_revise.items():
        revise_record = metadata[fasta_id]
        revise_record["accession"] = loculus_accession
        metadata_revise.append(revise_record)
        if config.segmented:
            for nucleotideSequence in config.nucleotide_sequences:
                segmented_fasta_id = fasta_id + "_" + nucleotideSequence
                if segmented_fasta_id in sequences:
                    sequences_revise[segmented_fasta_id] = sequences[segmented_fasta_id]
        else:
            sequences_revise[fasta_id] = sequences[fasta_id]

    def write_to_tsv(data, filename):
        if not data:
            Path(filename).touch()
            return
        keys = data[0].keys()
        with open(filename, "w", newline="") as output_file:
            dict_writer = csv.DictWriter(output_file, keys, delimiter="\t")
            dict_writer.writeheader()
            dict_writer.writerows(data)

    def write_to_fasta(data, filename):
        if not data:
            Path(filename).touch()
            return
        with open(filename, "w") as output_file:
            for fasta_id, sequence in data.items():
                output_file.write(f">{fasta_id}\n{sequence}\n")

    write_to_tsv(metadata_submit, metadata_submit_path)
    write_to_tsv(metadata_revise, metadata_revise_path)
    write_to_fasta(sequences_submit, sequences_submit_path)
    write_to_fasta(sequences_revise, sequences_revise_path)


if __name__ == "__main__":
    main()
