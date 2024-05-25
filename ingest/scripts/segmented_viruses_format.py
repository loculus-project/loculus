"""For each downloaded sequences calculate md5 hash and put into JSON"""

from pathlib import Path
import re
import logging
import pandas as pd
import shutil
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
        logger.debug("No segments found, assuming single-segment virus")
        with open(input_seq) as f:
            records = SeqIO.parse(f, "fasta")
            write_to_fasta(records, output_seq)
        shutil.copy(input_metadata, output_metadata)
    else:
        metadata_df = pd.read_csv(input_metadata, sep="\t", dtype=str, keep_default_na=False)
        number_of_records = len(metadata_df)

        # Discard all sequences with unclear segment annotations
        # Append segment to end of NCBI accession ID to conform with LAPIS formatting
        metadata_df["segment"] = None
        segmented_seq = {}
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

        metadata_df = metadata_df.dropna(subset=["segment"])
        logging.info(f"Found {number_of_records} sequences")
        number_of_segmented_records = len(metadata_df)
        logging.info(
            f"Discarded {number_of_records - len(metadata_df)} sequences that did not have segment information"
        )

        # Group sequences according to isolate and collection date
        # Add joint_accession value: concatenated list of NCBI accession values
        metadata_df["joint_accession"] = None
        grouped = metadata_df.groupby(["ncbi_isolate_name", "ncbi_collection_date"])
        processed_seq = []

        def group_edit(isolate_group):
            accession_list = isolate_group["genbank_accession"]
            segments = isolate_group["segment"]
            joint_accession = accession_list.str.cat(sep="")
            metadata_df.loc[
                (metadata_df["ncbi_isolate_name"] == isolate)
                & (metadata_df["ncbi_collection_date"] == date),
                "joint_accession",
            ] = joint_accession
            for i, acc in enumerate(accession_list):
                record = segmented_seq[acc]
                record.id = joint_accession + "_" + segments.iloc[i]
                processed_seq.append(record)

        def single_edit(isolate_group):
            accession_list = isolate_group["genbank_accession"]
            segments = isolate_group["segment"]
            metadata_df.loc[
                (metadata_df["ncbi_isolate_name"] == isolate)
                & (metadata_df["ncbi_collection_date"] == date),
                "joint_accession",
            ] = accession_list
            for i, acc in enumerate(accession_list):
                record = segmented_seq[acc]
                record.id = acc + "_" + segments.iloc[i]
                processed_seq.append(record)

        for g in grouped.groups.keys():
            isolate, date = g
            isolate_group = metadata_df.loc[
                (metadata_df["ncbi_isolate_name"] == isolate)
                & (metadata_df["ncbi_collection_date"] == date)
            ]
            if isolate:
                if len(isolate_group) > len(config.nucleotideSequences):
                    logging.warn(
                        f"Found {len(isolate_group)} sequences for isolate: {isolate}, {date} "
                        "uploading segments individually."
                    )
                    single_edit(isolate_group)
                group_edit(isolate_group)
            else:
                # treat each segment separately as joining not possible
                single_edit(isolate_group)

        logging.info(
            f"Total of {len(metadata_df["joint_accession"].unique())} joint sequences after joining"
        )
        if number_of_segmented_records // len(config.nucleotideSequences) > len(
            metadata_df["joint_accession"].unique()
        ):
            raise ValueError(
                {
                    "ERROR: After join there are less records than expected if all records have"
                    " data for all segments - stopping as this indicates a join error!"
                }
            )

        write_to_fasta(processed_seq, output_seq)
        metadata_df.to_csv(output_metadata, sep="\t")


if __name__ == "__main__":
    main()
