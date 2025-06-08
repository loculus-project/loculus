import csv
import json
import logging

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


@click.command()
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
@click.option(
    "--insdc-country-code-map",
    required=True,
    type=click.Path(),
)
@click.option(
    "--geonames-tsv",
    required=True,
    type=click.Path(),
)
@click.option(
    "--output-json",
    default="admin1_map.json",
    type=click.Path(),
)
def create_geolocation_json(
    log_level,
    geonames_tsv,
    insdc_country_code_map,
    output_json,
):
    with open(insdc_country_code_map, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
    country_code_map: dict[str, str] = full_config["insdc_country_code_mapping"]
    df = pd.read_csv(
        geonames_tsv,
        sep="\t",
        dtype=str,
        keep_default_na=False,
        quoting=csv.QUOTE_NONE,
        escapechar="\\",
    )

    admin1_map = {}

    for country, code in country_code_map.items():
        # Get rows where the country code matches and feature code is "ADM1"
        country_rows = df[df["country code"] == code]
        admin1 = country_rows[country_rows["feature code"].isin(["ADM1"])]
        admin1_names = admin1["asciiname"].to_list()
        admin1_codes: dict[str, str] = {}
        for _, row in admin1.iterrows():
            # Create a mapping of admin1 code to name
            admin1_codes[row["admin1 code"]] = row["asciiname"]
        admin2 = country_rows[country_rows["feature code"].isin(["ADM2"])]

        admin1_to_admin2 = {}
        for name in admin1_names:
            admin1_to_admin2[name] = []
        for _, row in admin2.iterrows():
            if row["admin1 code"] not in admin1_codes:
                logger.warning(
                    f"Admin2 {row['asciiname']} in {country} does not have a corresponding Admin1"
                )
                continue
            # Create a mapping of admin1 code to admin2 code
            admin1_to_admin2[admin1_codes[row["admin1 code"]]].append(row["asciiname"])
        admin1_map[country] = admin1_to_admin2

    # Write the admin1_map to a JSON file
    with open(output_json, "w", encoding="utf-8") as json_file:
        json.dump(admin1_map, json_file, ensure_ascii=False, indent=4)


if __name__ == "__main__":
    create_geolocation_json()
