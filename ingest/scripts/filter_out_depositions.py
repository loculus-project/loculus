import logging
from dataclasses import dataclass

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
@click.option(
    "--exclude-biosample-accessions",
    required=True,
    type=click.Path(),
)
def filter_out_depositions(
    log_level,
    config_file,
    input_metadata_tsv,
    output_metadata_tsv,
    exclude_insdc_accessions,
    exclude_biosample_accessions,
):
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.INFO)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.info(f"Config: {config}")
    df = pd.read_csv(input_metadata_tsv, sep="\t", dtype=str, keep_default_na=False)
    original_count = len(df)
    with open(exclude_insdc_accessions, encoding="utf-8") as f:
        loculus_insdc_accessions: set = {line.strip().split(".")[0] for line in f}  # Remove version

    with open(exclude_biosample_accessions, encoding="utf-8") as f:
        loculus_biosample_accessions = [line.strip() for line in f]

    filtered_df = df[
        ~df["genbankAccession"].str.split(".").str[0].isin(loculus_insdc_accessions)
    ]  # Filter out all versions of an accession
    filtered_df = filtered_df[~filtered_df["biosampleAccession"].isin(loculus_biosample_accessions)]
    logger.info(f"Filtered out {(original_count - len(filtered_df))} sequences.")
    filtered_df.to_csv(output_metadata_tsv, sep="\t", index=False)


if __name__ == "__main__":
    filter_out_depositions()
