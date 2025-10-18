"""Script to group segments together into sequence entries prior to submission to Loculus
Example ndjson output for a single isolate with 3 segments:
{"id": "KJ682796.1.L/KJ682809.1.M/KJ682819.1.S",
"metadata": {
    "ncbiReleaseDate": "2014-07-06T00:00:00Z",
    "ncbiSourceDb": "GenBank",
    "authors": "D. Goedhals, F.J. Burt, J.T. Bester, R. Swanepoel",
    "insdcVersion_L": "1",
    "insdcVersion_M": "1",
    "insdcVersion_S": "1",
    "insdcAccessionFull_L": "KJ682796.1",
    "insdcAccessionFull_M": "KJ682809.1",
    "insdcAccessionFull_S": "KJ682819.1",
    "hash_L": "ddbfc33d45267e9c1a08f8f5e76d3e39",
    "hash_M": "f64777883ba9f5293257698255767f2c",
    "hash_S": "f716ed13dca9c8a033d46da2f3dc2ff1",
    "hash": "ce7056d0bd7e3d6d3eca38f56b9d10f8",
    "id": "KJ682796.1.L/KJ682809.1.M/KJ682819.1.S"
}}"""

import hashlib
import json
import logging
import pathlib
from collections import defaultdict
from dataclasses import dataclass
from typing import Final

import click
import orjsonl
import yaml


def sort_authors(authors: str) -> str:
    """Sort authors alphabetically"""
    return "; ".join(sorted([author.strip() for author in authors.split(";")]))


def values_with_sorted_authors(values: dict[str, str]) -> dict[str, str]:
    """Sort authors values and return modified values"""
    values_copy = values.copy()
    values_copy["authors"] = sort_authors(values_copy["authors"])
    return values_copy


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
    insdc_segment_specific_fields: list[str]  # Fields that can vary between segments in a group
    nucleotide_sequences: list[str]
    segmented: bool


# id is actually NCBI accession
INTRINSICALLY_SEGMENT_SPECIFIC_FIELDS: Final = {"segment", "id"}


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

    number_of_segmented_records = 0
    segment_metadata: dict[str, dict[str, str]] = {}
    for record in orjsonl.stream(input_metadata):
        segment_metadata[record["id"]] = record["metadata"]
        number_of_segmented_records += 1
    logger.info(f"Found {number_of_segmented_records} individual segments in metadata file")

    # Group segments according to isolate, collection date and isolate specific values
    # These are the fields that are expected to be identical across all segments for a given isolate

    # Dynamically determine the fields that are present in the metadata
    first_row = next(iter(segment_metadata.values()))
    if not first_row:
        msg = "No data found in metadata file"
        raise ValueError(msg)
    all_fields = sorted(first_row.keys())
    logger.debug(f"All metadata fields: {all_fields}")

    # Metadata fields can vary between segments w/o indicating being from different assemblies
    insdc_segment_specific_fields = set(config.insdc_segment_specific_fields)
    insdc_segment_specific_fields.add("hash")

    # Fields that in principle should be identical for all segments of the same assembly
    shared_fields = sorted(
        set(all_fields) - insdc_segment_specific_fields - INTRINSICALLY_SEGMENT_SPECIFIC_FIELDS
    )
    logger.debug(f"Shared metadata fields: {shared_fields}")

    # Build equivalence classes based on shared fields
    # Use shared fields as the key to group the data
    type SegmentName = str
    type Accession = str
    type EquivalenceClasses = dict[tuple[str, str], dict[SegmentName, list[Accession]]]

    equivalence_classes: EquivalenceClasses = defaultdict(lambda: defaultdict(list))
    for accession, values in segment_metadata.items():
        # Author order sometimes varies among segments from same isolate
        # Example: JX999734.1 (L) and JX999735.1 (M)
        modified_values = values_with_sorted_authors(values)
        group_key = str(
            tuple((field, value) for field in shared_fields if (value := modified_values[field]))
        )
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
    logger.info(f"Total of {number_of_groups} groups left after merging")
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

    # Map from original accession to the new concatenated accession
    fasta_id_map: dict[Accession, Accession] = {}

    count = 0

    for group in grouped_accessions:
        # Create key by concatenating all accession numbers with their segments
        # e.g. AF1234_S/AF1235_M/AF1236_L
        # Sort the segments per config.nucleotide_sequences
        row = {}
        segments_list = [
                f"{group[segment]}.{segment}"
                for segment in config.nucleotide_sequences
                if segment in group
            ]
        joint_key = "/".join(
            segments_list
        )
        segments_list_str = ", ".join(segments_list)
        for segment, accession in group.items():
            fasta_id_map[accession] = f"{joint_key}_{segment}"

        for field in shared_fields:
            values = {segment: segment_metadata[group[segment]][field] for segment in group}
            deduplicated_values = sorted(set(values.values()))
            if len(deduplicated_values) > 1:
                if field == "authors":
                    # For authors, we accept different orders
                    logger.info(f"Author orders differ for group {joint_key}: {values}")
                else:
                    msg = f"Assertion failed: values for group must be identical: {values}"
                    raise ValueError(msg)
            row[field] = deduplicated_values[0]

        for field in insdc_segment_specific_fields:
            for segment in config.nucleotide_sequences:
                row[f"{field}_{segment}"] = (
                    segment_metadata[group[segment]][field] if segment in group else ""
                )

        row["id"] = joint_key
        row["fastaId"] = segments_list_str

        # Hash of all metadata fields should be the same if
        # 1. field is not in keys_to_keep and
        # 2. field is in keys_to_keep but is "" or None
        filtered_record = {k: str(v) for k, v in row.items() if v is not None and str(v)}

        # rename "id" to "submissionId" and ignore fastaId for back-compatibility with old hashes
        filtered_record["submissionId"] = filtered_record.pop("id")
        filtered_record.pop("fastaId", None)

        row["hash"] = hashlib.md5(
            json.dumps(filtered_record, sort_keys=True).encode(), usedforsecurity=False
        ).hexdigest()

        orjsonl.append(output_metadata, {"id": joint_key, "metadata": row})
        count += 1

    logger.info(f"Wrote grouped metadata for {count} sequences")

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
    logger.info(f"Wrote {count} sequences")
    logger.info(f"Ignored {count_ignored} sequences as not found in {input_seq}")


if __name__ == "__main__":
    main()
