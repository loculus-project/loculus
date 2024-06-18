"""Get segment details for each sequence - in INSDC this is in the fasta description."""

import logging
import re
from dataclasses import dataclass
from pathlib import Path

import click
import pandas as pd
import yaml
from Bio import SeqIO


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


def write_fasta_id_only(data, filename):
    if not data:
        Path(filename).touch()
        return
    with open(filename, "a") as file:
        for record in data:
            file.write(f">{record.id}\n{record.seq}\n")


@click.command(help="Parse segment details from fasta header, add to metadata, write id_only fasta")
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

    if not config.segmented:
        raise ValueError({"ERROR: tried to get segment for non-segmented virus"})
    else:
        metadata_df = pd.read_csv(input_metadata, sep="\t", dtype=str, keep_default_na=False)
        number_of_records = len(metadata_df)
        logging.info(f"Found {number_of_records} sequences")

        # Discard all sequences with unclear segment annotations
        # Append segment to end of NCBI accession ID to conform with Loculus formatting
        metadata_df["segment"] = None
        segmented_seq = {}
        processed_seq = []
        with open(input_seq) as f:
            records = SeqIO.parse(f, "fasta")
            for record in records:
                for segment in config.nucleotide_sequences:
                    re_input = re.compile(
                        f".*segment {segment}.*", re.IGNORECASE
                    )  # FIXME: Brittle regex: matches both `L` and `L1` for segment `L`
                    found_segment = re_input.search(
                        record.description
                    )  # FIXME: Doesn't handle multiple matches
                    if found_segment:
                        metadata_df.loc[
                            metadata_df["genbank_accession"] == record.id, "segment"
                        ] = segment
                        segmented_seq[record.id] = record
                        processed_seq.append(record)
                        break

        final_metadata = metadata_df.dropna(subset=["segment"])
        sequences_without_segment_info = number_of_records - len(final_metadata)

        logging.info(
            f"Discarded {sequences_without_segment_info} sequences "
            "that did not have segment information."
        )

        # FIXME: Stream to file instead of loading all sequences into memory
        write_fasta_id_only(processed_seq, output_seq)
        final_metadata.to_csv(output_metadata, sep="\t")


if __name__ == "__main__":
    main()
