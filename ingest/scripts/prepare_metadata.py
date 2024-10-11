"""Script to rename fields and transform values prior to submission to Loculus"""

# Needs to be configurable via yaml file
# Start off with a simple mapping
# Add transformations that can be applied to certain fields
# Like separation of country into country and division

import ast
import hashlib
import json
import logging
import re
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
    parse_list: list[str]
    usa_states: dict[str, str]
    india_states: list[str]
    china_provinces: list[str]



def reformat_authors_from_genbank_to_loculus(authors: str, insdc_accession_base: str) -> str:
    """Split authors by each second comma, then split by comma and reverse
    So "['Xi,L.', 'Yu,X.']" becomes  Xi, L.; Yu, X.;
    Where first name and last name are separated by no-break space"""

    if not authors:
        return ""
    authors_list = ast.literal_eval(authors)
    formatted_authors = []

    for author in authors_list:
        author_single_white_space = re.sub(r"\s\s+", " ", author)
        names = [a for a in author_single_white_space.split(",") if a]
        if len(names) == 2:
            author_formatted = f"{names[1].strip()}, {names[0].strip()}"
        elif len(names) == 1:
            author_formatted = f"{names[0].strip()}, "
        else:
            msg = (
                f"{insdc_accession_base}: Unexpected number of commas in author {author} "
                f"in {authors}, not adding author to authors list"
            )
            logger.error(msg)
            continue
        formatted_authors.append(author_formatted)
    return "; ".join(formatted_authors) + ";"


def list_to_string(string_list: str) -> str:
    if not string_list:
        return ""
    _list = ast.literal_eval(string_list)
    return ",".join(_list)


def get_geoloc(input_string: str, config: Config) -> tuple[str, str, str]:
    country = input_string.split(":", 1)[0].strip()
    if len(input_string.split(":", 1)) < 2:
        return country, "", ""
    division = input_string.split(":", 1)[1].strip()

    if country == "USA":
        for state, abbr in config.usa_states.items():
            if state.lower() in division or abbr in division:
                geo_loc_admin1 = state
                geo_loc_admin2 = division
                return country, geo_loc_admin1, geo_loc_admin2
    if country == "India":
        for state in config.india_states:
            if state.lower() in division:
                geo_loc_admin1 = state
                geo_loc_admin2 = division
                return country, geo_loc_admin1, geo_loc_admin2
    if country == "China":
        for state in config.china_provinces:
            if state.lower() in division:
                geo_loc_admin1 = state
                geo_loc_admin2 = division
                return country, geo_loc_admin1, geo_loc_admin2

    return country, division, ""


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
        record["country"], record["geoLocAdmin1"], record["geoLocAdmin2"] = get_geoloc(
            record[config.compound_country_field]
        )
        record["submissionId"] = record[config.fasta_id_field]
        record["insdcAccessionBase"] = record[config.fasta_id_field].split(".", 1)[0]
        record["insdcVersion"] = record[config.fasta_id_field].split(".", 1)[1]
        record["ncbiSubmitterNames"] = reformat_authors_from_genbank_to_loculus(
            record["ncbiSubmitterNames"], record["insdcAccessionBase"]
        )
        if config.segmented:
            record["segment"] = segments_dict.get(record[config.fasta_id_field], "")
        for field in config.parse_list:
            record[field] = list_to_string(record[field])

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
