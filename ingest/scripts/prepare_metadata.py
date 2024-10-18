"""Script to rename fields and transform values prior to submission to Loculus"""

# Needs to be configurable via yaml file
# Start off with a simple mapping
# Add transformations that can be applied to certain fields
# Like separation of country into country and division

import hashlib
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

import click
import orjsonl
import pandas as pd
import pycountry
import unidecode
import yaml
from fuzzywuzzy import process, fuzz

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
    country_codes: dict[str, str]
    min_score: int
    administrative_divisions: list[str]


def format_geo_loc_admin2(division: str, matched_geo_loc_admin1: str) -> str:
    """Remove the matched geo_loc_admin1 from the division string and return the rest"""
    replaced_string = division.replace(matched_geo_loc_admin1, "").strip().rstrip(",")
    geo_loc_admin2 = [x.strip() for x in replaced_string.split(",") if x.strip()]
    return ", ".join(geo_loc_admin2)


def fuzzy_match_geo_loc_admin1(query: str, geo_loc_admin1_list: list[str], config: Config) -> str:
    """Return highest fuzzy match of query to items in list
    if score of match>= min_score, match range is 0-100"""
    for admin_region in config.administrative_divisions:
        if admin_region.lower() in query.lower():
            query = query.lower().replace(admin_region.lower(), "")
            break
    match, score = process.extractOne(query, geo_loc_admin1_list, scorer=fuzz.partial_ratio)
    if score >= config.min_score:
        return match
    return ""


def get_geoloc(input_string: str, config: Config) -> tuple[str, str, str]:
    country = input_string.split(":", 1)[0].strip()
    division = input_string.split(":", 1)[1].strip() if len(input_string.split(":", 1)) == 2 else ""
    country_code = config.country_codes.get(country)
    if country_code:
        # Try to find an exact substring match for subdivision
        try:
            geolocadmin1_options = [
                unidecode.unidecode(division.name)  # pycountry returns non-ASCII characters
                for division in pycountry.subdivisions.get(country_code=country_code)
            ]
        except Exception as e:
            logger.error(f"Error getting subdivisions for {country}: {e}")
            return country, division, ""
        if not geolocadmin1_options:
            return country, division, ""
        # Try to find an exact substring match subdivision abbreviation
        for option in geolocadmin1_options:
            division_words = [word.strip() for word in division.lower().split(",")]
            if option.lower() in division_words:
                return country, option, format_geo_loc_admin2(division, option)
        try:
            geolocadmin1_abbreviations = {
                division.code: unidecode.unidecode(division.name)
                for division in pycountry.subdivisions.get(country_code=country_code)
            }
            geolocadmin1_abbreviations = {
                abbrev.split("-")[1]: name for abbrev, name in geolocadmin1_abbreviations.items()
            }
        except Exception as e:
            logger.error(f"Error getting subdivisions codes for {country}: {e}")
            return country, division, ""
        for option, name in geolocadmin1_abbreviations.items():
            division_words = re.split(r"[,\s]+", division)
            if option in division_words:
                return country, name, format_geo_loc_admin2(division, option)
        # Try to find a fuzzy match for subdivision
        division_words = [name for name in division.split(",") if name]
        for division_word in division_words:
            fuzzy_match = fuzzy_match_geo_loc_admin1(
                division_word, geolocadmin1_options, config
            )
            if fuzzy_match:
                logger.info(f"Fuzzy matched {division_word} to {fuzzy_match}")
                return country, fuzzy_match, format_geo_loc_admin2(division, division_word)
        return country, "", division
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
            record[config.compound_country_field], config
        )
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
