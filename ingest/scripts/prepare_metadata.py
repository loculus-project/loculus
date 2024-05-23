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
    segment_specific: list[str]
    nucleotideSequences: list[str] | None = None


def split_authors(authors: str) -> str:
    """Split authors by each second comma, then split by comma and reverse
    So Xi,L.,Yu,X. becomes L. Xi, X. Yu
    Where first name and last name are separated by no-break space"""
    single_split = sorted(authors.split(","))
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
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, None) for key in Config.__annotations__}
        config = Config(**relevant_config)
        single_segment: bool = not config.nucleotideSequences or (
            len(config.nucleotideSequences) == 1 and config.nucleotideSequences[0] == "main"
        )
    logger.debug(config)

    logger.info(f"Reading metadata from {input}")
    df = pd.read_csv(input, sep="\t", dtype=str, keep_default_na=False)
    metadata: list[dict[str, str]] = df.to_dict(orient="records")

    sequence_hashes_dict: dict[str, str] = json.loads(Path(sequence_hashes).read_text())

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

    for record in metadata:
        for from_key, to_key in config.rename.items():
            val = record.pop(from_key)
            record[to_key] = val

    keys_to_keep = set(config.rename.values()) | set(config.keep)
    for record in metadata:
        for key in list(record.keys()):
            if key not in keys_to_keep:
                record.pop(key)

    if not single_segment:
        segments: list[str] = config.nucleotideSequences if config.nucleotideSequences else []
        selected_dict = pd.DataFrame(metadata)

        metadata_joined: list[dict[str, str]] = []

        ## Group metadata again and merge segments
        for acc in selected_dict["joint_accession"].unique():
            table = selected_dict.loc[selected_dict["joint_accession"] == acc]
            new_row = {}
            for col in selected_dict.columns:
                if col not in config.segment_specific:
                    if len(table[col].unique()) != 1:
                        # TODO(Handle this case better)
                        logger.warn(
                            "Isolate: %s unique value: %s is not shared across segments, values: %s"
                            % (acc, col, table[col].unique())
                        )
                    new_row[col] = table[col].unique()[0]
            for field in config.segment_specific:
                try:
                    for segment in segments:
                        if len(table.loc[table["segment"] == segment]) > 0:
                            new_row[field + "_" + segment] = table.loc[
                                table["segment"] == segment, field
                            ].iloc[0]
                        else:
                            new_row[field + "_" + segment] = None
                except:
                    logger.warn("Unable to find field: %s, for table: %s" % (field, table))
            new_row["submissionId"] = new_row["joint_accession"]
            metadata_joined.append(new_row)

        metadata = metadata_joined

        seq_key = "joint_accession"
    else:
        seq_key = config.rename[config.fasta_id_field]

    # Calculate overall hash of metadata + sequence
    for record in metadata:
        sequence_hash = sequence_hashes_dict.get(record[seq_key], "")
        if sequence_hash == "":
            raise ValueError(f"No hash found for {record[seq_key]}")

        metadata_dump = json.dumps(record, sort_keys=True)
        prehash = metadata_dump + sequence_hash

        record["hash"] = hashlib.md5(prehash.encode()).hexdigest()

    meta_dict = {rec[seq_key]: rec for rec in metadata}

    Path(output).write_text(json.dumps(meta_dict, indent=4))

    logging.info(f"Saved metadata for {len(metadata)} sequences")


if __name__ == "__main__":
    main()
