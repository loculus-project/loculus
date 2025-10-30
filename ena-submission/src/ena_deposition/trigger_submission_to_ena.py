# This script adds all approved sequences to the submission_table
# - this should trigger the submission process.

import json
import logging
import threading
import time
from typing import Any

import requests
from psycopg2.pool import SimpleConnectionPool

from .config import Config
from .submission_db_helper import (
    SubmissionTableEntry,
    add_to_submission_table,
    db_init,
    in_submission_table,
)

logger = logging.getLogger(__name__)


def upload_sequences(db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]):
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        if in_submission_table(db_config, {"accession": accession, "version": version}):
            continue
        entry = {
            "accession": accession,
            "version": version,
            "group_id": data["metadata"]["groupId"],
            "organism": data["organism"],
            "metadata": json.dumps(data["metadata"]),
            "unaligned_nucleotide_sequences": json.dumps(data["unalignedNucleotideSequences"]),
        }
        submission_table_entry = SubmissionTableEntry(**entry)
        add_to_submission_table(db_config, submission_table_entry)
        logger.info(f"Inserted {full_accession} into submission_table")


def trigger_submission_to_ena(config: Config, stop_event: threading.Event, input_file=None):
    db_config = db_init(config.db_password, config.db_username, config.db_url)

    if input_file:
        # Get sequences to upload from a file
        with open(input_file, encoding="utf-8") as json_file:
            sequences_to_upload: dict[str, Any] = json.load(json_file)
            upload_sequences(db_config, sequences_to_upload)
            return

    while True:
        if stop_event.is_set():
            logger.warning("trigger_submission_to_ena stopped due to exception in another task")
            return
        logger.debug("Checking for new sequences to upload to submission_table")
        # In a loop get approved sequences uploaded to Github and upload to submission_table
        try:
            response = requests.get(
                config.approved_list_url,
                timeout=60,
            )
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to retrieve file due to requests exception: {e}")
            time.sleep(config.min_between_github_requests * 60)
            continue
        try:
            sequences_to_upload = response.json()
            upload_sequences(db_config, sequences_to_upload)
        except Exception as upload_error:
            logger.error(f"Failed to upload sequences: {upload_error}")
        finally:
            time.sleep(
                config.min_between_github_requests * 60
            )  # Sleep for x min to not overwhelm github
