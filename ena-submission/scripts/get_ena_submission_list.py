from call_loculus import get_released_data
from submission_db import in_submission_table, DBConfig

import os
import json
import logging
from dataclasses import dataclass
from typing import List, Dict
from pathlib import Path

import click
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass
class Config:
    organisms: List[Dict[str, str]]
    organism: str
    backend_url: str
    keycloak_token_url: str
    keycloak_client_id: str
    username: str
    password: str
    ena_specific_metadata: List[str]
    db_username: str
    db_password: str
    db_host: str


def get_db_config(config: Config):
    db_password = os.getenv("DB_PASSWORD")
    if not db_password:
        db_password = config.db_password

    db_username = os.getenv("DB_USERNAME")
    if not db_username:
        db_username = config.db_username

    db_host = os.getenv("DB_HOST")
    if not db_host:
        db_host = config.db_host

    db_params = {
        "username": db_username,
        "password": db_password,
        "host": db_host,
    }

    return DBConfig(**db_params)


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
    "--output-file",
    required=False,
    type=click.Path(),
)
def get_ena_submission_list(log_level, config_file, output_file):
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)

    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {
            key: full_config.get(key, []) for key in Config.__annotations__
        }
        config = Config(**relevant_config)
    logger.info(f"Config: {config}")

    db_config = get_db_config(config)

    entries_to_submit = {}
    for organism in config.organisms:
        config.organism = organism
        config.ena_specific_metadata = [
            value["name"] for value in config.organisms[organism]["externalMetadata"]
        ]
        logging.info(f"Getting released sequences for organism: {organism}")
        entries = get_released_data(config, remove_if_has_ena_specific_metadata=True)

        for key, item in entries.items():
            accession, version = key.split(".")
            if not in_submission_table(accession, version, db_config):
                entries_to_submit[key] = item

    if entries_to_submit:
        Path(output_file).write_text(json.dumps(entries_to_submit))
    else:
        logging.info("No sequences found to submit to ENA")
        Path(output_file).write_text("")


if __name__ == "__main__":
    get_ena_submission_list()
