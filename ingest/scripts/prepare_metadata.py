"""Script to rename fields and transform values prior to submission to Loculus"""

# Needs to be configurable via yaml file
# Start off with a simple mapping
# Add transformations that can be applied to certain fields
# Like separation of country into country and division

import csv
import hashlib
import json
import logging
from dataclasses import dataclass

import click
import orjson
import orjsonl
import pandas as pd
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)

FastaIdField = str


@dataclass
class Config:
    compound_country_field: str
    fasta_id_field: str
    rename: dict[str, str]
    keep: list[str]
    segmented: bool


def resolve_host_information(record: dict[str, str]) -> dict[str, str]:
    """Create a new host field and populate it from hostTaxonId or
    hostNameScientific (falling back to the empty string) to be consistent
    with how direct submissions specify the host organism. Any existing
    hostTaxonId, hostNameScientific, and hostNameCommon fields on the
    record will be removed.

    This should be done after computing the hash for a record to not trigger
    revisions for all INSDC data
    """
    host = record.get("hostTaxonId") or record.get("hostNameScientific")
    record.pop("hostTaxonId", None)
    record.pop("hostNameScientific", None)
    record.pop("hostNameCommon", None)
    record["host"] = host

    return record


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--segments", required=False, type=click.Path())
@click.option("--sequence-hashes-file", required=True, type=click.Path(exists=True))
@click.option("--output", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(
    config_file: str,
    input: str,
    segments: str | None,
    sequence_hashes_file: str,
    output: str,
    log_level: str,
) -> None:
    logger.setLevel(log_level)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.debug(config)

    sequence_hashes: dict[FastaIdField, str] = {
        record["id"]: record["hash"] for record in orjsonl.load(sequence_hashes_file)
    }

    segments_dict: dict[FastaIdField, dict[str, str]] = {}
    segmented_fields: list[str] = []
    if segments:
        segment_df = pd.read_csv(segments, sep="\t")
        segmented_fields = list(segment_df.columns)
        for row in segment_df.to_dict(orient="records"):
            segments_dict[row["seqName"]] = row

    keys_to_keep = set(config.rename.values()) | set(config.keep)
    if config.segmented:
        keys_to_keep.add("segment")
    fasta_id_field = config.rename.get(config.fasta_id_field, config.fasta_id_field)

    # One record at a time: holding every row (as a DataFrame, then as dicts) took ~4.8 GB for ~3M
    # SARS-CoV-2 records; only the sequence hashes need to be in memory.
    logger.info(f"Reading metadata from {input}")
    count = 0
    with (
        open(input, encoding="utf-8", newline="") as metadata_file,
        open(output, "wb") as output_file,
    ):
        reader = csv.DictReader(
            metadata_file, delimiter="\t", quoting=csv.QUOTE_NONE, escapechar="\\"
        )
        for row in reader:
            record = transform(row, config, segments_dict, segmented_fields)
            # Get rid of all records without segment
            if config.segmented and not record["segment"]:
                continue
            rename_and_filter(record, config, keys_to_keep)
            record["hash"] = metadata_hash(record, config, sequence_hashes, fasta_id_field)

            # for segmented organisms, this has to happen in `heuristic_group_segments.py`
            # and `override_group_segments.py`
            if not config.segmented:
                resolve_host_information(record)

            output_file.write(orjson.dumps({"id": record[fasta_id_field], "metadata": record}))
            output_file.write(b"\n")
            count += 1

    logger.info(f"Saved metadata for {count} sequences")


def transform(
    record: dict[str, str],
    config: Config,
    segments_dict: dict[FastaIdField, dict[str, str]],
    segmented_fields: list[str],
) -> dict[str, str]:
    try:
        record["division"] = record[config.compound_country_field].split(":", 1)[1].strip()
    except IndexError:
        record["division"] = ""
    record["country"] = record[config.compound_country_field].split(":", 1)[0].strip()
    record["id"] = record[config.fasta_id_field]
    record["insdcAccessionBase"] = record[config.fasta_id_field].split(".", 1)[0]
    record["insdcVersion"] = record[config.fasta_id_field].split(".", 1)[1]
    if segmented_fields:
        results_dic = segments_dict.get(record[config.fasta_id_field], {})
        for key in segmented_fields:
            record[key] = results_dic.get(key, "")
    return record


def rename_and_filter(record: dict[str, str], config: Config, keys_to_keep: set[str]) -> None:
    for from_key, to_key in config.rename.items():
        # segment is a required field for the ingest grouping scripts
        # Keep segment field if config.segmented even if it is specified to be renamed
        val = (
            record.get(from_key)
            if (from_key == "segment" and config.segmented)
            else record.pop(from_key)
        )
        record[to_key] = val
    for key in list(record.keys()):
        if key not in keys_to_keep:
            record.pop(key)


def metadata_hash(
    record: dict[str, str],
    config: Config,
    sequence_hashes: dict[FastaIdField, str],
    fasta_id_field: str,
) -> str:
    """Hash of metadata + sequence"""
    sequence_hash = sequence_hashes.get(record[fasta_id_field], "")
    if not sequence_hash:
        msg = f"No hash found for {record[config.fasta_id_field]}"
        raise ValueError(msg)

    # Hash of all metadata fields should be the same if
    # 1. field is not in keys_to_keep and
    # 2. field is in keys_to_keep but is "" or None
    filtered_record = {k: str(v) for k, v in record.items() if v is not None and str(v)}

    # rename "id" to "submissionId" for back-compatibility with old hashes
    filtered_record["submissionId"] = filtered_record.pop("id")

    metadata_dump = json.dumps(filtered_record, sort_keys=True)
    prehash = metadata_dump + sequence_hash
    return hashlib.md5(prehash.encode(), usedforsecurity=False).hexdigest()


if __name__ == "__main__":
    main()
