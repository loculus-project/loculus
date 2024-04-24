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
import pandas as pd
import yaml


@dataclass
class Config:
    compound_country_field: str
    fasta_id_field: str
    rename: dict[str, str]
    keep: list[str]


def split_authors(authors: str) -> str:
    """Split authors by each second comma, then split by comma and reverse
    So Xi,L.,Yu,X. becomes L. Xi, X. Yu
    Where first name and last name are separated by no-break space"""
    single_split = authors.split(",")
    result = []

    for i in range(0, len(single_split), 2):
        if i + 1 < len(single_split):
            result.append(single_split[i + 1].strip() + "\u00a0" + single_split[i].strip())
        else:
            result.append(single_split[i].strip())

    return ", ".join(result)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--input", required=True, type=click.Path(exists=True))
@click.option("--sequence-hashes", required=True, type=click.Path(exists=True))
@click.option("--output", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(config_file: str, input: str, sequence_hashes: str, output: str, log_level: str) -> None:
    logging.basicConfig(level=log_level)
    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)
    logging.debug(config)
    # Read sequence hashes
    df = pd.read_csv(input, sep="\t", dtype=str, keep_default_na=False).sort_values(
        by=config.compound_country_field
    )
    # Turn tsv into list of objects
    metadata: list[dict[str, str]] = df.to_dict(orient="records")

    hashes: dict[str, str] = json.loads(Path(sequence_hashes).read_text())

    for record in metadata:
        # Transform the metadata
        try:
            record["division"] = record[config.compound_country_field].split(":", 1)[1].strip()
        except IndexError:
            record["division"] = ""
        record["country"] = record[config.compound_country_field].split(":", 1)[0].strip()
        record["submissionId"] = record[config.fasta_id_field]
        record["insdc_accession_base"] = record[config.fasta_id_field].split(".", 1)[0]
        record["insdc_version"] = record[config.fasta_id_field].split(".", 1)[1]
        record["ncbi_submitter_names"] = split_authors(record["ncbi_submitter_names"])

    # Rename the fields
    for record in metadata:
        for from_key, to_key in config.rename.items():
            val = record.pop(from_key)
            record[to_key] = val

    # Keep only the fields that are not in either `rename` or `keep`
    keys_to_keep = set(config.rename.values()) | set(config.keep)
    for record in metadata:
        for key in list(record.keys()):
            if key not in keys_to_keep:
                record.pop(key)

    # Calculate overall hash of metadata + sequence
    for record in metadata:
        # Add the hashes to the metadata
        sequence_hash = hashes.get(record[config.rename[config.fasta_id_field]], "")
        if sequence_hash == "":
            logging.warning(f"No hash found for {record[config.fasta_id_field]}")

        metadata_dump = json.dumps(record, sort_keys=True)
        prehash = metadata_dump + sequence_hash

        record["hash"] = hashlib.md5(prehash.encode()).hexdigest()

    # Save the metadata
    Path(output).write_text(json.dumps(metadata, indent=4))


if __name__ == "__main__":
    main()
