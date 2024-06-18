"""Script to group segments together into sequence entries prior to submission to Loculus"""

import hashlib
import json
import logging
from dataclasses import dataclass
from pathlib import Path
import click
import pandas as pd
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass(frozen=True)
class Config:
    compound_country_field: str
    fasta_id_field: str
    segment_specific_fields: list[str]
    nucleotide_sequences: list[str]
    segmented: bool


def add_joint_accession(
    isolate_group: str,
    metadata_df: pd.DataFrame,
    segmented_seq: dict,
    processed_seq: dict,
    single=False,
):
    """
    This function does two things:
    1. It edits the metadata_df by calculating and adding the joint_accession of each isolate_group.
    2. It creates a new dictionary: processed_seq, this maps the joint_accession (concatenated with
        the segment name) to the correct record. The joint_accession is used as the submissionID.

    If `single` is True this means we cannot actually join the segments and each joint_accession
    is just the insdc_accession_full combined with the segment name for the processed_seq dict.

    Args:
        isolate_group: The isolate group identifier.
        metadata_df: The metadata DataFrame containing the isolate group's information.
        segmented_seq: Map from insdc_accession_full of segments to their sequence record.
        processed_seq: Map from joint_accession of grouped segments to their group metadata.
        single: True if sequences should not be grouped.
    """
    accession_list = metadata_df.loc[isolate_group, "insdc_accession_full"]
    segments = metadata_df.loc[isolate_group, "segment"]
    joint_accession = accession_list.str.cat(sep="")
    if single:
        metadata_df.loc[isolate_group, "joint_accession"] = accession_list
    else:
        metadata_df.loc[isolate_group, "joint_accession"] = joint_accession
    for i, acc in enumerate(accession_list):
        record = segmented_seq[acc]
        id = acc + "_" + segments.iloc[i] if single else joint_accession + "_" + segments.iloc[i]
        processed_seq[id] = record


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
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.debug(config)
    logger.info(f"Reading metadata from {input_metadata}")
    metadata_df: pd.DataFrame = pd.read_json(input_metadata, dtype=str, orient="index")
    metadata_df.reset_index(inplace=True)
    metadata_df.rename(columns={"index": "submissionId"}, inplace=True)
    number_of_segmented_records = len(metadata_df)

    if not config.segmented:
        raise ValueError({"ERROR: tried to get segment for non-segmented virus"})

    segments: list[str] = config.nucleotide_sequences if config.nucleotide_sequences else []
    # Group sequences according to isolate, collection date and isolate specific values
    isolate_specific_cols = [
        "specimen_collector_sample_id",
        "sample_collection_date",
    ] + list(
        set(metadata_df.columns)
        - set(config.segment_specific_fields)
        - set(["hash", "submissionId", "segment"])
    )
    grouped = metadata_df.groupby(isolate_specific_cols)
    # Add joint_accession value: concatenated list of NCBI accession values
    metadata_df["joint_accession"] = ""

    processed_seq = {}
    with open(input_seq, encoding="utf-8") as file:
        segmented_seq = json.load(file)

    # Disable ruff rule
    for g in grouped.groups:  # noqa: PLR1702
        args = g
        isolate = args[0]
        isolate_group = grouped.get_group((args))
        # If isolate is not given do not group segments
        if isolate:
            if len(isolate_group) > len(config.nucleotide_sequences):
                logging.warn(
                    f"Found {len(isolate_group)} sequences for isolate: {isolate} "
                    "uploading segments individually."
                )
                add_joint_accession(
                    grouped.groups[args],
                    metadata_df,
                    segmented_seq,
                    processed_seq,
                    single=True,
                )
            elif len(isolate_group["segment"]) != len(isolate_group["segment"].unique()):
                logging.warn(
                    f"Found multiple copies of a segment for isolate: {isolate} "
                    "uploading segments individually."
                )
                add_joint_accession(
                    grouped.groups[args],
                    metadata_df,
                    segmented_seq,
                    processed_seq,
                    single=True,
                )
            else:
                add_joint_accession(grouped.groups[args], metadata_df, segmented_seq, processed_seq)
        else:
            # treat each segment separately as joining not possible
            add_joint_accession(
                grouped.groups[args],
                metadata_df,
                segmented_seq,
                processed_seq,
                single=True,
            )
    logging.info(
        f"Total of {len(metadata_df["joint_accession"].unique())} joint sequences after joining"
    )
    if number_of_segmented_records // len(config.nucleotide_sequences) > len(
        metadata_df["joint_accession"].unique()
    ):
        raise ValueError(
            {
                "ERROR: After join there are less records than expected if all records have"
                " data for all segments - stopping as this indicates a join error!"
            }
        )
    ## Add segment_specific_fields metadata for the segments
    metadata: list[dict[str, str]] = []
    for acc in metadata_df["joint_accession"].unique():
        table = metadata_df.loc[metadata_df["joint_accession"] == acc]
        new_row = {}
        for col in metadata_df.columns:
            if col not in config.segment_specific_fields and col not in [
                "hash",
                "submissionId",
                "segment",
            ]:
                new_row[col] = table[col].unique()[0]
        for field in config.segment_specific_fields:
            try:
                for segment in segments:
                    if len(table.loc[table["segment"] == segment]) > 0:
                        new_row[field + "_" + segment] = table.loc[
                            table["segment"] == segment, field
                        ].iloc[0]
                    else:
                        new_row[field + "_" + segment] = ""
            except Exception as e:
                logger.warn(f"Unable to find field: {field}, for table: {table}. Exception: {e}")
        new_row["hash"] = hashlib.md5("".join(table["hash"]).encode()).hexdigest()
        new_row["submissionId"] = new_row["joint_accession"]
        metadata.append(new_row)
    meta_dict = {rec["joint_accession"]: rec for rec in metadata}
    Path(output_metadata).write_text(json.dumps(meta_dict, indent=4), encoding="utf-8")
    Path(output_seq).write_text(json.dumps(processed_seq, indent=4), encoding="utf-8")
    logging.info(f"Saved metadata for {len(metadata)} sequences")


if __name__ == "__main__":
    main()
