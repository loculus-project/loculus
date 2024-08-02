"""Script to group segments together into sequence entries prior to submission to Loculus
Example output for a single isolate with 3 segments:
"KJ682796.1.L/KJ682809.1.M/KJ682819.1.S": {
    "ncbi_release_date": "2014-07-06T00:00:00Z",
    "ncbi_sourcedb": "GenBank",
    "authors": "D. Goedhals, F.J. Burt, J.T. Bester, R. Swanepoel",
    "insdc_version_L": "1",
    "insdc_version_M": "1",
    "insdc_version_S": "1",
    "insdc_accession_full_L": "KJ682796.1",
    "insdc_accession_full_M": "KJ682809.1",
    "insdc_accession_full_S": "KJ682819.1",
    "hash_L": "ddbfc33d45267e9c1a08f8f5e76d3e39",
    "hash_M": "f64777883ba9f5293257698255767f2c",
    "hash_S": "f716ed13dca9c8a033d46da2f3dc2ff1",
    "hash": "ce7056d0bd7e3d6d3eca38f56b9d10f8",
    "submissionId": "KJ682796.1.L/KJ682809.1.M/KJ682819.1.S"
},"""

import hashlib
import json
import logging
import pathlib
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import click
import orjsonl
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
    segment_specific_fields: list[str]  # What does this field mean?
    shared_fields: list[
        str
    ]  # Fields that are expected to be identical across all segments for a given isolate
    nucleotide_sequences: list[str]
    segmented: bool


SPECIAL_FIELDS: Final = {"segment", "submissionId"}


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

    full_config = yaml.safe_load(pathlib.Path(config_file).read_text(encoding="utf-8"))
    relevant_config = {key: full_config[key] for key in Config.__annotations__}
    config = Config(**relevant_config)
    logger.info(config)

    if not config.segmented:
        raise ValueError({"ERROR: You are running a function that requires segmented data"})

    logger.info(f"Reading metadata from {input_metadata}")
    segments = config.nucleotide_sequences
    number_of_segments = len(segments)

    with open(input_metadata, encoding="utf-8") as file:
        segment_metadata: dict[str, dict[str, str]] = json.load(file)
    number_of_segmented_records = len(segment_metadata.keys())
    logger.info(f"Found {number_of_segmented_records} individual segments in metadata file")

    # Group sequences according to isolate, collection date and isolate specific values
    # These are the fields that are expected to be identical across all segments for a given isolate
    shared_fields = config.shared_fields
    logger.info(f"Fields required to be identical for grouping: {shared_fields}")

    first_row = next(iter(segment_metadata.values()))
    if not first_row:
        msg = "No data found in metadata file"
        raise ValueError(msg)
    all_fields = first_row.keys()

    # Build equivalence classes based on shared fields
    # Use shared fields as the key to group the data
    type SegmentName = str
    type Accession = str
    type EquivalenceClasses = dict[tuple[str, str], dict[SegmentName, list[Accession]]]

    # Creating the nested defaultdict with type hints
    equivalence_classes: EquivalenceClasses = defaultdict(lambda: defaultdict(list))
    for accession, values in segment_metadata.items():
        group_key = tuple((field, values[field]) for field in shared_fields if values[field])
        segment = values["segment"]
        equivalence_classes[group_key][segment].append(accession)

    # TODO: Advanced checks for various sub-classes so we can warn the user if there are issues
    # For example, if there are multiple isolates with the same name and collection date
    # We are being very strict here, but this is a good thing as it will catch errors
    # We can always merge the data later if we need to

    grouped_accessions: list[dict[SegmentName, Accession]] = []
    # Simply check there are no duplicate segments for each group

    for group_key, sequence_group in equivalence_classes.items():
        # Verify that all segments are unique for the group
        unique_per_segment = all(len(accessions) <= 1 for accessions in sequence_group.values())

        if not unique_per_segment:
            logger.warning(
                f"Found multiple copies of a segment for grouping key: {group_key} "
                "uploading segments individually. "
                f"Grouping: {dict(sequence_group)}"
            )
            for segment, accessions in sequence_group.items():
                grouped_accessions.extend([{segment: accession} for accession in accessions])
            continue

        # If all segments are unique, we can group them together
        # We know that all segments are unique, so we can just unnest the list
        grouped_accessions.append(
            {segment: accessions[0] for segment, accessions in sequence_group.items()}
        )

    number_of_groups = len(grouped_accessions)
    group_lower_bound = number_of_segmented_records // number_of_segments
    group_upper_bound = number_of_segmented_records
    logging.info(f"Total of {number_of_groups} groups left after merging")
    if number_of_groups < group_lower_bound:
        raise ValueError(
            {
                "There are too few groups after merging, indicating a problem with the data. "
                f"Expected at least {group_lower_bound} groups (all merged), "
                f"but found {number_of_groups}"
            }
        )
    if number_of_groups > group_upper_bound:
        raise ValueError(
            {
                "There are too many groups after merging, indicating a problem with the data. "
                f"Expected at most {group_upper_bound} groups (all separate), "
                f"but found {number_of_groups}"
            }
        )

    must_identical_fields = set(config.shared_fields)
    segment_specific_fields = set(config.segment_specific_fields).add("hash")

    # These need to be treated specially: always single string, but complex if necessary
    # e.g. "L:2024/nM:2023"
    usually_identical_fields = (
        set(all_fields) - must_identical_fields - segment_specific_fields - SPECIAL_FIELDS
    )

    # Add segment specific metadata for the segments
    metadata: dict[str, dict[str, str]] = {}
    # Map from original accession to the new concatenated accession
    fasta_id_map: dict[Accession, Accession] = {}

    for group in grouped_accessions:
        # Create key by concatenating all accession numbers with their segments
        # e.g. AF1234_S/AF1235_M/AF1236_L
        # Sort the segments per config.nucleotide_sequences
        row = {}
        joint_key = "/".join(
            [
                f"{group[segment]}.{segment}"
                for segment in config.nucleotide_sequences
                if segment in group
            ]
        )
        for segment, accession in group.items():
            fasta_id_map[accession] = f"{joint_key}_{segment}"

        for field in must_identical_fields:
            values = {segment: segment_metadata[group[segment]][field] for segment in group}
            deduplicated_values = set(values.values())
            if len(deduplicated_values) != 1:
                msg = f"Assertion failed: values for group must be identical: {values}"
                raise ValueError(msg)
            row[field] = deduplicated_values.pop()

        for field in segment_specific_fields:
            for segment in config.nucleotide_sequences:
                row[f"{field}_{segment}"] = (
                    segment_metadata[group[segment]][field] if segment in group else ""
                )

        for field in usually_identical_fields:
            values = {segment: segment_metadata[group[segment]][field] for segment in group}
            deduplicated_values = set(values.values())
            if len(deduplicated_values) != 1:
                combined = "\n".join([f"{segment}:{value}" for segment, value in values.items()])
                row[field] = combined
                logger.warning(
                    f"Values for field: {field} in group: {group} are not identical: {values}. "
                    f"Passing combined nested string: {combined!r}"
                )
                continue
            row[field] = deduplicated_values.pop()

        row["submissionId"] = joint_key

        row["hash"] = hashlib.md5(
            json.dumps(row, sort_keys=True).encode(), usedforsecurity=False
        ).hexdigest()

        metadata[joint_key] = row

    Path(output_metadata).write_text(json.dumps(metadata, indent=4), encoding="utf-8")
    logging.info(f"Wrote grouped metadata for {len(metadata)} sequences")

    count = 0
    count_ignored = 0
    for record in orjsonl.stream(input_seq):
        accession = record["id"]
        raw_sequence = record["sequence"]
        if accession not in fasta_id_map:
            logger.warning(f"Accession {accession} not found in input sequence file, skipping")
            count_ignored += 1
            continue
        orjsonl.append(
            output_seq,
            {
                "id": fasta_id_map[accession],
                "sequence": raw_sequence,
            },
        )
        count += 1
    logging.info(f"Wrote {count} sequences")
    logging.info(f"Ignored {count_ignored} sequences as not found in {input_seq}")


if __name__ == "__main__":
    main()
