# This script adds all approved sequences to the submission_table
# - this should trigger the submission process.

import base64
import json
import logging
import os
import time
from dataclasses import dataclass

import click
import requests
import yaml
from requests.auth import HTTPBasicAuth
from submission_db_helper import (
    SubmissionTableEntry,
    add_to_submission_table,
    get_db_config,
    in_submission_table,
)

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass
class Config:
    organisms: list[dict[str, str]]
    organism: str
    db_username: str
    db_password: str
    db_host: str
    github_username: str
    github_pat: str
    github_url: str


def upload_sequences(db_config, sequences_to_upload):
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        if in_submission_table(accession, version, db_config):
            continue
        entry = {
            "accession": accession,
            "version": version,
            "group_id": data["metadata"]["groupId"],
            "organism": data["organism"],
            "metadata": json.dumps(data["metadata"]),
            "aligned_nucleotide_sequences": json.dumps(data["alignedNucleotideSequences"]),
        }
        submission_table_entry = SubmissionTableEntry(**entry)
        add_to_submission_table(db_config, submission_table_entry)
        logger.info(f"Uploaded {full_accession} to submission_table")


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
    "--input-file",
    required=False,
    type=click.Path(),
)
def trigger_submission_to_ena(log_level, config_file, input_file=None):
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.INFO)

    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.info(f"Config: {config}")

    db_config = get_db_config(config.db_password, config.db_username, config.db_host)

    if input_file:
        # Get sequences to upload from a file
        sequences_to_upload: dict = json.load(open(input_file, encoding="utf-8"))
        upload_sequences(db_config, sequences_to_upload)
        return

    while True:
        # In a loop get approved sequences uploaded to Github and upload to submission_table
        github_username = os.getenv("GITHUB_USERNAME")
        if not github_username:
            github_username = config.github_username

        github_pat = os.getenv("GITHUB_PAT")
        if not github_pat:
            github_pat = config.github_pat

        response = requests.get(
            config.github_url,
            auth=HTTPBasicAuth(github_username, github_pat),
            timeout=10,
        )

        if response.status_code == 200:
            file_info = response.json()
            sequences_to_upload = json.loads(base64.b64decode(file_info["content"]).decode("utf-8"))
        else:
            error_msg = f"Failed to retrieve file: {response.status_code}"
            raise Exception(error_msg)
        upload_sequences(db_config, sequences_to_upload)
        time.sleep(30)  # Sleep for 30seconds to not overwhelm github


if __name__ == "__main__":
    trigger_submission_to_ena()
