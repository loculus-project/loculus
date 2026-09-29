import csv
import json
import logging
from dataclasses import dataclass

import click
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
    segmented: bool
    db_password: str
    db_username: str
    db_host: str


@click.command()
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
@click.option(
    "--config-file",
    required=True,
    type=click.Path(exists=True),
)
@click.option(
    "--input-metadata-tsv",
    required=True,
    type=click.Path(exists=True),
)
@click.option(
    "--output-metadata-tsv",
    required=True,
    type=click.Path(),
)
@click.option(
    "--exclude-insdc-accessions",
    required=True,
    type=click.Path(),
)
def filter_out_depositions(
    log_level,
    config_file,
    input_metadata_tsv,
    output_metadata_tsv,
    exclude_insdc_accessions,
):
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.INFO)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.info(f"Config: {config}")
    with open(exclude_insdc_accessions, encoding="utf-8") as file:
        data = json.load(file)
        loculus_insdc_accessions: set = {
            line.strip().split(".")[0] for line in data["insdcAccessions"]
        }  # Remove version
        loculus_biosample_accessions = set(data["biosampleAccessions"])

    # Row by row: reading the whole TSV into a DataFrame took ~3.3 GB for ~3M SARS-CoV-2 records.
    # Same bytes as the pandas read/write it replaces: no quoting, backslash escapes, and quotes left as they are
    # (quotechar=None; the csv module would otherwise escape them).
    dialect = {"delimiter": "\t", "quoting": csv.QUOTE_NONE, "escapechar": "\\", "quotechar": None}
    original_count = kept_count = 0
    with (
        open(input_metadata_tsv, encoding="utf-8", newline="") as input_file,
        open(output_metadata_tsv, "w", encoding="utf-8", newline="") as output_file,
    ):
        reader = csv.reader(input_file, **dialect)
        writer = csv.writer(output_file, lineterminator="\n", **dialect)
        header = next(reader)
        writer.writerow(header)
        accession_column = header.index("genbankAccession")
        biosample_column = header.index("biosampleAccession")
        for row in reader:
            original_count += 1
            # Filter out all versions of an accession
            if row[accession_column].split(".")[0] in loculus_insdc_accessions:
                continue
            if row[biosample_column] in loculus_biosample_accessions:
                continue
            writer.writerow(row)
            kept_count += 1
    logger.info(f"Filtered out {(original_count - kept_count)} sequences.")


if __name__ == "__main__":
    filter_out_depositions()
