"""Script to rename fields and transform values prior to submission to Loculus"""

# Needs to be configurable via yaml file
# Start off with a simple mapping
# Add transformations that can be applied to certain fields
# Like separation of country into country and division

import hashlib
import json
import logging
from dataclasses import dataclass
from pathlib import Path

import click
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


@dataclass
class Config:
    compound_country_field: str
    fasta_id_field: str
    rename: dict[str, str]
    keep: list[str]
    segmented: bool


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--segments", required=False, type=click.Path())
@click.option("--sequence-hashes", required=True, type=click.Path(exists=True))
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
    sequence_hashes: str,
    output: str,
    log_level: str,
) -> None:
    logger.setLevel(log_level)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.debug(config)

    logger.info(f"Reading metadata from {input}")
    df = pd.read_csv(input, sep="\t", dtype=str, keep_default_na=False)
    metadata: list[dict[str, str]] = df.to_dict(orient="records")

    sequence_hashes: dict[str, str] = {
        record["id"]: record["hash"] for record in orjsonl.load(sequence_hashes)
    }

    if config.segmented:
        # Segments are a tsv file with the first column being the fasta id
        # and the second being the segment
        segments_dict: dict[str, str] = {}
        with open(segments, encoding="utf-8") as file:
            for line in file:
                if line.startswith("seqName"):
                    continue
                fasta_id, segment = line.strip().split("\t")
                segments_dict[fasta_id] = segment

    for record in metadata:
        # Transform the metadata
        try:
            record["division"] = record[config.compound_country_field].split(":", 1)[1].strip()
        except IndexError:
            record["division"] = ""
        record["country"] = record[config.compound_country_field].split(":", 1)[0].strip()
        record["submissionId"] = record[config.fasta_id_field]
        record["insdcAccessionBase"] = record[config.fasta_id_field].split(".", 1)[0]
        record["insdcVersion"] = record[config.fasta_id_field].split(".", 1)[1]
        if config.segmented:
            record["segment"] = segments_dict.get(record[config.fasta_id_field], "")

    # Get rid of all records without segment
    # TODO: Log the ones that are missing
    if config.segmented:
        metadata = [record for record in metadata if record["segment"]]

    for record in metadata:
        for from_key, to_key in config.rename.items():
            val = record.pop(from_key)
            record[to_key] = val

    keys_to_keep = set(config.rename.values()) | set(config.keep)
    if config.segmented:
        keys_to_keep.add("segment")
    for record in metadata:
        for key in list(record.keys()):
            if key not in keys_to_keep:
                record.pop(key)

    # Calculate overall hash of metadata + sequence
    for record in metadata:
        fasta_id_field = config.fasta_id_field
        if config.fasta_id_field in config.rename:
            fasta_id_field = config.rename[config.fasta_id_field]
        sequence_hash = sequence_hashes.get(record[fasta_id_field], "")
        if not sequence_hash:
            msg = f"No hash found for {record[config.fasta_id_field]}"
            raise ValueError(msg)

        # Hash of all metadata fields should be the same if
        # 1. field is not in keys_to_keep and
        # 2. field is in keys_to_keep but is "" or None
        filtered_record = {k: str(v) for k, v in record.items() if v is not None and str(v)}

        metadata_dump = json.dumps(filtered_record, sort_keys=True)
        prehash = metadata_dump + sequence_hash

        record["hash"] = hashlib.md5(prehash.encode(), usedforsecurity=False).hexdigest()

    meta_dict = {rec[fasta_id_field]: rec for rec in metadata}

    Path(output).write_text(json.dumps(meta_dict, indent=4, sort_keys=True), encoding="utf-8")

    logging.info(f"Saved metadata for {len(metadata)} sequences")


if __name__ == "__main__":
    main()
