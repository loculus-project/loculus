"""Script to group segments together into sequence entries prior to submission to Loculus
given a json with known groups. This should be run before the heuristic grouping script.

The ungrouped sequences are used as input for the heuristic grouping script.

This script will group segments as specified in the groups JSON regardless of the metadata fields,
but will log a warning if metadata fields differ and log an error if segments are duplicated
- in this case the segments in that group will not be submitted.

Example output for a single isolate with 3 segments:
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
    "submissionId": "KJ682796.1.L/KJ682809.1.M/KJ682819.1.S"
}}"""

import hashlib
import json
import logging
import pathlib
from dataclasses import dataclass
from typing import Any, Final

import click
import orjsonl  # type: ignore
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)

type Accession = str
type InsdcAccession = str
type SubmissionId = str
type GroupName = str


@dataclass(frozen=True)
class Config:
    compound_country_field: str
    fasta_id_field: str
    insdc_segment_specific_fields: list[str]  # Fields that can vary between segments in a group
    nucleotide_sequences: list[str]
    segmented: bool


@dataclass
class Groups:
    accession_to_group: dict[InsdcAccession, GroupName]
    override_groups: dict[GroupName, list[InsdcAccession]]
    found_groups: dict[GroupName, list[dict[str, Any]]]


# submissionId is actually NCBI accession
INTRINSICALLY_SEGMENT_SPECIFIC_FIELDS: Final = {"segment", "submissionId"}


def sort_authors(authors: str) -> str:
    """Sort authors alphabetically"""
    return "; ".join(sorted([author.strip() for author in authors.split(";")]))


def get_metadata_of_group(
    record_list: list[dict],
    config: Config,
    different_values_log: dict[str, int],
    segment_map: dict[str, dict[str, str]],
) -> dict[str, Any]:
    all_fields = sorted(record_list[0]["metadata"].keys())
    # Metadata fields can vary between segments w/o indicating being from different assemblies
    insdc_segment_specific_fields = set(config.insdc_segment_specific_fields)
    insdc_segment_specific_fields.add("hash")

    # Fields that in principle should be identical for all segments of the same assembly
    shared_fields = sorted(
        set(all_fields) - insdc_segment_specific_fields - INTRINSICALLY_SEGMENT_SPECIFIC_FIELDS
    )

    grouped_metadata = {}
    for key in shared_fields:
        if key in {"authors", "authorAffiliations"}:
            values = [sort_authors(d["metadata"][key]) for d in record_list]
        else:
            values = [d["metadata"][key] for d in record_list]
        if len(set(values)) > 1:
            different_values_log[key] = different_values_log.get(key, 0) + 1
            if len(set(values)) == 2 and "" in set(values):  # noqa: PLR2004
                grouped_metadata[key] = next(iter(set(values) - {""}))
                continue
            if key in {"authors", "authorAffiliations"}:
                grouped_metadata[key] = values[0]
                continue
            orjsonl.append(
                "results/warnings.ndjson",
                {
                    "accessions": [record["id"] for record in record_list],
                    "field": key,
                    "values": values,
                },
            )
        grouped_metadata[key] = record_list[0]["metadata"][key]
    for field in insdc_segment_specific_fields:
        for segment in config.nucleotide_sequences:
            grouped_metadata[f"{field}_{segment}"] = (
                segment_map[segment][field] if segment in segment_map else ""
            )

    joint_key = "/".join(
        [
            f"{segment_map[segment]['insdcAccessionFull']}.{segment}"
            for segment in config.nucleotide_sequences
            if segment in segment_map
        ]
    )
    grouped_metadata["submissionId"] = joint_key

    # Hash of all metadata fields should be the same if
    # 1. field is not in keys_to_keep and
    # 2. field is in keys_to_keep but is "" or None
    filtered_record = {k: str(v) for k, v in grouped_metadata.items() if v is not None and str(v)}

    grouped_metadata["hash"] = hashlib.md5(
        json.dumps(filtered_record, sort_keys=True).encode(), usedforsecurity=False
    ).hexdigest()

    return grouped_metadata


def group_records(
    record_list: list[dict],
    output_metadata_path: str,
    fasta_id_map: dict[str, str],
    config: Config,
    different_values_log: dict[str, int],
) -> None:
    # Assert that all records are from a different segment
    for segment in config.nucleotide_sequences:
        if len([record for record in record_list if record["metadata"]["segment"] == segment]) > 1:
            # TODO(#3589): Raise an error after duplicate segments can be removed
            logger.error(
                "Cannot group multiple records from the same segment"
                + ", ".join([record["id"] for record in record_list])
            )
            # write record list to a file
            orjsonl.append("results/errors.ndjson", record_list)
            return
    segment_map = {record["metadata"]["segment"]: record["metadata"] for record in record_list}

    grouped_metadata = get_metadata_of_group(record_list, config, different_values_log, segment_map)
    joint_key = grouped_metadata["submissionId"]

    for segment in segment_map:
        accession = segment_map[segment]["insdcAccessionFull"]
        fasta_id_map[accession] = f"{joint_key}_{segment}"

    orjsonl.append(output_metadata_path, {"id": joint_key, "metadata": grouped_metadata})


def write_grouped_metadata(
    input_metadata_path: str,
    output_ungrouped_metadata_path: str,
    output_grouped_metadata_path: str,
    config: Config,
    groups: Groups,
) -> tuple[dict, set]:
    # Map from original accession to the new concatenated accession
    fasta_id_map: dict[Accession, SubmissionId] = {}
    ungrouped_accessions = set()
    different_values_log = {}
    count_total = 0
    count_ungrouped = 0
    for record in orjsonl.stream(input_metadata_path):
        count_total += 1
        metadata = record["metadata"]
        if metadata["insdcAccessionFull"] not in groups.accession_to_group:
            count_ungrouped += 1
            orjsonl.append(
                output_ungrouped_metadata_path, {"id": record["id"], "metadata": record["metadata"]}
            )
            ungrouped_accessions.add(record["id"])
            continue
        group = groups.accession_to_group[metadata["insdcAccessionFull"]]
        groups.found_groups[group].append(record)
        if len(groups.found_groups[group]) == len(set(groups.override_groups[group])):
            group_records(
                groups.found_groups[group],
                output_grouped_metadata_path,
                fasta_id_map,
                config,
                different_values_log,
            )
            del groups.found_groups[group]

    logger.info(f"Found {count_total} records")
    logger.info(f"Unable to group {count_ungrouped} records")

    # add found_groups without all segments in file
    count_unfilled_groups = 0
    count_missing_tests = 0
    for name, records in groups.found_groups.items():
        count_unfilled_groups += 1
        missing_records = set(groups.override_groups[name]) - {
            record["metadata"]["insdcAccessionFull"] for record in records
        }
        logger.debug(f"{name}: Missing record {missing_records}")
        if len(records) == 0:
            count_missing_tests += 1
            continue
        group_records(
            records, output_grouped_metadata_path, fasta_id_map, config, different_values_log
        )
    logger.info(different_values_log)
    logger.info(f"Found {count_unfilled_groups} groups without all segments")
    logger.info(f"Found {count_missing_tests} groups without any segments")
    return fasta_id_map, ungrouped_accessions


def write_grouped_sequences(
    input_seq_path: str,
    output_ungrouped_seq_path: str,
    output_grouped_seq_path: str,
    fasta_id_map: dict,
    ungrouped_accessions: set,
):
    count_grouped = 0
    count_ungrouped = 0
    count_ignored = 0
    for record in orjsonl.stream(input_seq_path):
        accession = record["id"]
        raw_sequence = record["sequence"]
        if accession in ungrouped_accessions:
            orjsonl.append(output_ungrouped_seq_path, {"id": accession, "sequence": raw_sequence})
            count_ungrouped += 1
            continue
        if accession not in fasta_id_map:
            count_ignored += 1
            continue
        orjsonl.append(
            output_grouped_seq_path,
            {
                "id": fasta_id_map[accession],
                "sequence": raw_sequence,
            },
        )
        count_grouped += 1
    logger.info(f"Wrote {count_grouped} grouped sequences")
    logger.info(f"Wrote {count_ungrouped} ungrouped sequences")
    logger.info(f"Ignored {count_ignored} sequences as not found in {input_seq_path}")


def get_groups_object(groups_json_path: str):
    with open(groups_json_path, encoding="utf-8") as g:
        override_groups = json.load(g)
    logger.info(f"Found {len(override_groups.keys())} source of truth groups")
    accession_to_group = {}
    for group, metadata in override_groups.items():
        for accession in metadata:
            accession_to_group[accession] = group

    found_groups = {group: [] for group in override_groups}

    return Groups(accession_to_group, override_groups, found_groups)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--groups", required=True, type=click.Path(exists=True))
@click.option("--input-seq", required=True, type=click.Path(exists=True))
@click.option("--input-metadata", required=True, type=click.Path(exists=True))
@click.option("--output-seq", required=True, type=click.Path())
@click.option("--output-metadata", required=True, type=click.Path())
@click.option("--output-ungrouped-seq", required=True, type=click.Path())
@click.option("--output-ungrouped-metadata", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(  # noqa: PLR0913, PLR0917
    config_file: str,
    groups: str,
    input_seq: str,
    input_metadata: str,
    output_seq: str,
    output_metadata: str,
    output_ungrouped_seq: str,
    output_ungrouped_metadata: str,
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

    groups: Groups = get_groups_object(groups)

    fasta_id_map, ungrouped_accessions = write_grouped_metadata(
        input_metadata,
        output_ungrouped_metadata,
        output_metadata,
        config,
        groups,
    )

    write_grouped_sequences(
        input_seq, output_ungrouped_seq, output_seq, fasta_id_map, ungrouped_accessions
    )


if __name__ == "__main__":
    main()
