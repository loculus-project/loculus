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


def get_external_metadata(db_config: SimpleConnectionPool, entry: dict[str, Any]) -> dict[str, Any]:
    accession = entry["accession"]
    data = {
        "accession": accession,
        "version": entry["version"],
        "externalMetadata": {},
    }
    project_id = {"project_id": entry["project_id"]}
    seq_key = {"accession": accession, "version": entry["version"]}

    # Get corresponding entry in the project table for (group_id, organism)
    corresponding_project = find_conditions_in_db(
        db_config, table_name=TableName.PROJECT_TABLE, conditions=project_id
    )
    if len(corresponding_project) == 1:
        data["externalMetadata"]["bioprojectAccession"] = corresponding_project[0]["result"][
            "bioproject_accession"
        ]
    else:
        raise Exception
    # Check corresponding entry in the sample table for (accession, version)
    corresponding_sample = find_conditions_in_db(
        db_config, table_name=TableName.SAMPLE_TABLE, conditions=seq_key
    )
    if len(corresponding_sample) == 1:
        data["externalMetadata"]["biosampleAccession"] = corresponding_sample[0]["result"][
            "biosample_accession"
        ]
    else:
        raise Exception
    # Check corresponding entry in the assembly table for (accession, version)
    corresponding_assembly = find_conditions_in_db(
        db_config, table_name=TableName.ASSEMBLY_TABLE, conditions=seq_key
    )
    if len(corresponding_assembly) == 1:
        data["externalMetadata"]["gcaAccession"] = corresponding_assembly[0]["result"][
            "gca_accession"
        ]
        insdc_accession_keys = [
            key
            for key in corresponding_assembly[0]["result"]
            if key.startswith("insdc_accession_full")
        ]
        segments = [key[len("insdc_accession_full") :] for key in insdc_accession_keys]
        for segment in segments:
            data["externalMetadata"]["insdcAccessionBase" + segment] = corresponding_assembly[0][
                "result"
            ]["insdc_accession" + segment]
            data["externalMetadata"]["insdcAccessionFull" + segment] = corresponding_assembly[0][
                "result"
            ]["insdc_accession_full" + segment]
    else:
        raise Exception
    return data


def get_external_metadata_and_send_to_loculus(db_config: SimpleConnectionPool, config: Config):
    # Get external metadata
    conditions = {"status_all": StatusAll.SUBMITTED_ALL}
    submitted_all = find_conditions_in_db(
        db_config, table_name=TableName.SUBMISSION_TABLE, conditions=conditions
    )
    for entry in submitted_all:
        accession = entry["accession"]
        data = get_external_metadata(db_config, entry)
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
