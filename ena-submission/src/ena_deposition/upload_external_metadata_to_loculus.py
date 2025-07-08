# This script collects the results of the ENA submission and uploads the results to Loculus

import json
import logging
import threading
import time
from datetime import datetime
from typing import Any

import pytz
from psycopg2.pool import SimpleConnectionPool

from ena_deposition.call_loculus import submit_external_metadata

from .config import Config
from .notifications import SlackConfig, send_slack_notification, slack_conn_init
from .submission_db_helper import (
    StatusAll,
    TableName,
    db_init,
    find_conditions_in_db,
    find_stuck_in_submission_db,
    update_with_retry,
)

logger = logging.getLogger(__name__)


def get_results(
    db_config: SimpleConnectionPool, conditions: dict[str, Any], table_name: TableName
) -> dict[str, Any]:
    entry = find_conditions_in_db(
        db_config, table_name=table_name, conditions=conditions
    )
    if len(entry) == 1 and table_name == TableName.PROJECT_TABLE:
        return {"bioprojectAccession": entry[0]["result"]["bioproject_accession"]}
    if len(entry) == 1 and table_name == TableName.SAMPLE_TABLE:
        return {"biosampleAccession": entry[0]["result"]["biosample_accession"]}
    if len(entry) == 1 and table_name == TableName.ASSEMBLY_TABLE:
        data = {}
        data["gcaAccession"] = entry[0]["result"]["gca_accession"]
        insdc_accession_keys = [
            key
            for key in entry[0]["result"]
            if key.startswith("insdc_accession_full")
        ]
        segments = [key[len("insdc_accession_full") :] for key in insdc_accession_keys]
        for segment in segments:
            data["insdcAccessionBase" + segment] = entry[0]["result"][
                "insdc_accession" + segment
            ]
            data["insdcAccessionFull" + segment] = entry[0]["result"][
                "insdc_accession_full" + segment
            ]
        return data
    msg = f"Expected 1 record in {table_name}, but found {len(entry)} records."
    raise ValueError(msg)


def get_external_metadata(
    db_config: SimpleConnectionPool, entry: dict[str, Any], strict: bool = False
) -> dict[str, Any]:
    accession = entry["accession"]
    data = {
        "accession": accession,
        "version": entry["version"],
        "externalMetadata": {},
    }
    project_id = {"project_id": entry["project_id"]}
    seq_key = {"accession": accession, "version": entry["version"]}

    for (table_name, key) in [
        (TableName.PROJECT_TABLE, project_id),
        (TableName.SAMPLE_TABLE, seq_key),
        (TableName.ASSEMBLY_TABLE, seq_key),
    ]:
        try:
            data["externalMetadata"].update(get_results(db_config, key, table_name))
        except Exception as e:
            if strict:
                msg = f"Failed to get {table_name} results for {accession}"
                logger.error(msg)
                raise ValueError(msg) from e
    return data


def get_external_metadata_and_send_to_loculus(db_config: SimpleConnectionPool, config: Config):
    # Collect entries that may have new external metadata available
    submitted_some = []
    for status in (
        StatusAll.SUBMITTED_PROJECT,
        StatusAll.SUBMITTED_SAMPLE,
        StatusAll.SUBMITTING_ASSEMBLY,
    ):
        submitted_some.extend(
            find_conditions_in_db(
                db_config,
                table_name=TableName.SUBMISSION_TABLE,
                conditions={"status_all": status},
            )
        )

    for entry in submitted_some:
        accession = entry["accession"]
        data = get_external_metadata(db_config, entry)
        seq_key = {"accession": accession, "version": entry["version"]}

        try:
            changed = False
            if not entry["external_metadata"] and data["externalMetadata"]:
                changed = True
            for key, value in data["externalMetadata"].items():
                if entry["external_metadata"].get(key) != value:
                    changed = True

            if not changed:
                continue

            submit_external_metadata(
                data,
                config,
                entry["organism"],
            )
            logger.info(f"Partial external metadata update for {accession} succeeded")
            update_with_retry(
                db_config,
                conditions=seq_key,
                update_values={
                    "external_metadata": json.dumps(data["externalMetadata"]),
                },
                table_name=TableName.SUBMISSION_TABLE,
            )
        except Exception:
            logger.info(f"Partial external metadata update failed for {accession}")
            continue

    # Collect entries that have all external metadata available
    conditions = {"status_all": StatusAll.SUBMITTED_ALL}
    submitted_all = find_conditions_in_db(
        db_config, table_name=TableName.SUBMISSION_TABLE, conditions=conditions
    )

    for entry in submitted_all:
        accession = entry["accession"]
        data = get_external_metadata(db_config, entry, strict=True)
        seq_key = {"accession": accession, "version": entry["version"]}

        try:
            submit_external_metadata(
                data,
                config,
                entry["organism"],
            )
            update_with_retry(
                db_config,
                conditions=seq_key,
                update_values={
                    "status_all": StatusAll.SENT_TO_LOCULUS,
                    "finished_at": datetime.now(tz=pytz.utc),
                    "external_metadata": json.dumps(data["externalMetadata"]),
                },
                table_name=TableName.SUBMISSION_TABLE,
                reraise=False
            )
        except Exception as e:
            logger.exception(f"Error submitting external metadata for {accession}: {e}")
            update_with_retry(
                db_config=db_config,
                conditions=seq_key,
                update_values={
                    "status_all": StatusAll.HAS_ERRORS_EXT_METADATA_UPLOAD,
                    "started_at": datetime.now(tz=pytz.utc),
                },
                table_name=TableName.SUBMISSION_TABLE,
            )
            continue


def upload_handle_errors(
    db_config: SimpleConnectionPool,
    config: Config,
    slack_config: SlackConfig,
    time_threshold: int = 15,
    slack_time_threshold: int = 12,
):
    """
    - time_threshold: (minutes)
    - slack_time_threshold: (hours)

    1. Find all entries in submission_table in state HAS_ERRORS_EXT_METADATA_UPLOAD
       over time_threshold
    2. If time since last slack_notification is over slack_time_threshold send notification
    """
    entries_with_errors = find_stuck_in_submission_db(
        db_config,
        time_threshold=time_threshold,
    )
    if len(entries_with_errors) > 0:
        error_msg = (
            f"{config.backend_url}: ENA Submission pipeline found {len(entries_with_errors)} "
            f"entries in submission_table in status HAS_ERRORS_EXT_METADATA_UPLOAD "
            f"for over {time_threshold}"
        )
        send_slack_notification(
            error_msg,
            slack_config,
            time=datetime.now(tz=pytz.utc),
            time_threshold=slack_time_threshold,
        )


def upload_external_metadata(config: Config, stop_event: threading.Event):
    db_config = db_init(config.db_password, config.db_username, config.db_url)
    slack_config = slack_conn_init(
        slack_hook_default=config.slack_hook,
        slack_token_default=config.slack_token,
        slack_channel_id_default=config.slack_channel_id,
    )

    while True:
        if stop_event.is_set():
            logger.warning("upload_external_metadata stopped due to exception in another task")
            return
        logger.debug("Checking for external metadata to upload to Loculus")
        get_external_metadata_and_send_to_loculus(db_config, config)
        upload_handle_errors(
            db_config,
            config,
            slack_config,
        )
        time.sleep(config.time_between_iterations)
