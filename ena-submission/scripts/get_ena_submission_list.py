from call_loculus import get_released_data
from submission_db import in_submission_table

import json
import logging
from dataclasses import dataclass
from typing import List
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
    organism: str
    backend_url: str
    keycloak_token_url: str
    keycloak_client_id: str
    username: str
    password: str
    group_name: str
    metadata: List[str]


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
    entries = get_released_data(config, remove_if_has_metadata=True)
    entries_to_submit = {}
    for key, item in entries.items():
        accession, version = key.split(".")
        if not in_submission_table(accession, version):
            entries_to_submit[key] = item

    if entries_to_submit:
        Path(output_file).write_text(json.dumps(entries_to_submit))
    else:
        print("No released sequences found")
        Path(output_file).write_text("")


if __name__ == "__main__":
    get_ena_submission_list()
