# This script adds all approved sequences to the submission_table
# - this should trigger the submission process.

import json
import logging
import threading
import time
from typing import Any

import requests
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from .config import Config
from .db_helper import (
    db_init,
)
from .db_tables import Submission

logger = logging.getLogger(__name__)


def upload_sequences(session: Session, sequences_to_upload: dict[str, Any]):
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        stmt = select(Submission).where(
            Submission.accession == accession, Submission.version == int(version)
        )
        submission_table_entry = session.scalars(stmt).all()
        if len(submission_table_entry) > 0:
            continue
        try:
            session.add(
                Submission(
                    accession=accession,
                    version=int(version),
                    group_id=data["metadata"]["groupId"],
                    organism=data["organism"],
                    metadata_=data["metadata"],
                    unaligned_nucleotide_sequences=data["unalignedNucleotideSequences"]
                )
            )
            session.commit()
            logger.info(f"Inserted {full_accession} into submission_table")
        except Exception as e:
            session.rollback()
            logger.error(f"Error adding entry to sample_table for {accession}.{version}: {e}. ")
            continue


def trigger_submission_to_ena(config: Config, stop_event: threading.Event, input_file=None):
    engine = db_init(config.db_password, config.db_username, config.db_url)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    if input_file:
        # Get sequences to upload from a file
        with open(input_file, encoding="utf-8") as json_file:
            sequences_to_upload: dict[str, Any] = json.load(json_file)
            with session_local() as session:
                upload_sequences(session, sequences_to_upload)
            return

    while True:
        if stop_event.is_set():
            logger.warning("trigger_submission_to_ena stopped due to exception in another task")
            return
        logger.debug("Checking for new sequences to upload to submission_table")
        # In a loop get approved sequences uploaded to Github and upload to submission_table
        with session_local() as session:
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
                upload_sequences(session, sequences_to_upload)
            except Exception as upload_error:
                logger.error(f"Failed to upload sequences: {upload_error}")
            finally:
                time.sleep(
                    config.min_between_github_requests * 60
                )  # Sleep for x min to not overwhelm github
