import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import click
import yaml
from call_loculus import get_released_data
from notifications import get_slack_config, notify, upload_file_with_comment
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
    slack_hook: str
    slack_token: str
    slack_channel_id: str


def get_data_for_submission(config, entries, db_config):
    """
    Filter data in state APPROVED_FOR_RELEASE:
    - data must be state "OPEN" for use
    - data must not already exist in ENA or be in the submission process.
    To prevent this we need to make sure:
        - data was not submitted by the config.ingest_pipeline_submitter
        - data is not in submission_table
        - as an extra check we discard all sequences with ena-specific-metadata fields
        (if users uploaded correctly this should not be needed)
    """
    data_dict: dict[str, Any] = {}
    for key, item in entries.items():
        accession, version = key.split(".")
        if item["metadata"]["dataUseTerms"] != "OPEN":
            continue
        if item["metadata"]["submitter"] == config.ingest_pipeline_submitter:
            continue
        fields = [1 if item["metadata"][field] else 0 for field in config.ena_specific_metadata]
        if in_submission_table(accession, version, db_config):
            continue
        if sum(fields) > 0:
            logging.warn(
                f"Found sequence: {key} with ena-specific-metadata fields and not submitted by us ",
                f"or {config.ingest_pipeline_submitter}. Potential user error: discarding sequence.",
            )
            continue
        data_dict[key] = item
    return data_dict


def send_slack_notification(config: Config, output_file: str):
    slack_config = get_slack_config(
        slack_hook_default=config.slack_hook,
        slack_token_default=config.slack_token,
        slack_channel_id_default=config.slack_channel_id,
    )
    if not slack_config.slack_hook:
        logging.info("Could not find slack hook cannot send message")

    if slack_config.slack_hook:
        comment = (
            f"{config.backend_url}: ENA Submission pipeline wants to submit the following sequences"
        )
        try:
            response = upload_file_with_comment(slack_config, output_file, comment)
            if not response.get("ok", False):
                raise Exception
        except Exception as e:
            notify(slack_config, comment + f" - file upload to slack failed with Error {e}")


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
        entries_to_submit.update(get_data_for_submission(config, all_entries, db_config))

    if entries_to_submit:
        Path(output_file).write_text(json.dumps(entries_to_submit))
        send_slack_notification(config, output_file)
    else:
        logging.info("No sequences found to submit to ENA")
        Path(output_file).write_text("")


if __name__ == "__main__":
    get_ena_submission_list()
