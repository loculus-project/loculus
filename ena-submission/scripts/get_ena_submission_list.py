import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import click
import yaml
from call_loculus import get_released_data
from submission_db import get_db_config, in_submission_table

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
    ingest_pipeline_submitter: str
    db_username: str
    db_password: str
    db_host: str


def get_data_for_submission(config, entries):
    data_dict: dict[str, Any] = {}
    for key, item in entries.items():
        if item["metadata"]["dataUseTerms"] != "OPEN":
            continue
        if item["metadata"]["submitter"] == config.ingest_pipeline_submitter:
            continue
        fields = [1 if item["metadata"][field] else 0 for field in config.ena_specific_metadata]
        if sum(fields) > 0:
            logging.warn(
                f"Found sequence: {key} with ena-specific-metadata fields and not submitted by ",
                f"{config.ingest_pipeline_submitter}. This looks like a user error - discarding sequence.",
            )
        else:
            data_dict[key] = item
    return data_dict


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
    """
    Get a list of all sequences in state APPROVED_FOR_RELEASE without insdc-specific
    metadata fields and not already in the ena_submission.submission_table.
    """
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)

    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.info(f"Config: {config}")

    db_config = get_db_config(
        db_password_default=config.db_password,
        db_username_default=config.db_username,
        db_host_default=config.db_host,
    )

    entries_to_submit = {}
    for organism in config.organisms:
        config.ena_specific_metadata = [
            value["name"] for value in config.organisms[organism]["externalMetadata"]
        ]
        logging.info(f"Getting released sequences for organism: {organism}")

        all_entries = get_released_data(config, organism)
        entries = get_data_for_submission(config, all_entries)

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
