# This script collects the results of the ENA submission and uploads the results to Loculus

import json
import logging
import threading
import time
from datetime import datetime
from typing import Any

import pytz
from psycopg2.pool import SimpleConnectionPool

from .call_loculus import submit_external_metadata
from .config import Config
from .notifications import SlackConfig, send_slack_notification, slack_conn_init
from .submission_db_helper import (
    StatusAll,
    db_init,
    find_conditions_in_db,
    find_stuck_in_submission_db,
    update_db_where_conditions,
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
        db_config, table_name="project_table", conditions=project_id
    )
    if len(corresponding_project) == 1:
        data["externalMetadata"]["bioprojectAccession"] = corresponding_project[0]["result"][
            "bioproject_accession"
        ]
    else:
        raise Exception
    # Check corresponding entry in the sample table for (accession, version)
    corresponding_sample = find_conditions_in_db(
        db_config, table_name="sample_table", conditions=seq_key
    )
    if len(corresponding_sample) == 1:
        data["externalMetadata"]["biosampleAccession"] = corresponding_sample[0]["result"][
            "biosample_accession"
        ]
    else:
        raise Exception
    # Check corresponding entry in the assembly table for (accession, version)
    corresponding_assembly = find_conditions_in_db(
        db_config, table_name="assembly_table", conditions=seq_key
    )
    if len(corresponding_assembly) == 1:
        # TODO(https://github.com/loculus-project/loculus/issues/2945):
        # Add gcaAccession to values.yaml
        # data["externalMetadata"]["gcaAccession"] = corresponding_assembly[0]["result"][
        #     "gca_accession"
        # ]
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


def get_external_metadata_and_send_to_loculus(
    db_config: SimpleConnectionPool, config: Config, retry_number=3
):
    # Get external metadata
    conditions = {"status_all": StatusAll.SUBMITTED_ALL}
    submitted_all = find_conditions_in_db(
        db_config, table_name="submission_table", conditions=conditions
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
            update_values = {
                "status_all": StatusAll.SENT_TO_LOCULUS,
                "finished_at": datetime.now(tz=pytz.utc),
                "external_metadata": json.dumps(data["externalMetadata"]),
            }
            number_rows_updated = 0
            tries = 0
            while number_rows_updated != 1 and tries < retry_number:
                if tries > 0:
                    logger.warning(
                        f"External Metadata Update succeeded but db update failed - reentry DB update #{tries}."
                    )
                number_rows_updated = update_db_where_conditions(
                    db_config,
                    table_name="submission_table",
                    conditions=seq_key,
                    update_values=update_values,
                )
                tries += 1
            if number_rows_updated == 1:
                logger.info(f"External metadata update for {entry['accession']} succeeded!")
        except:
            logger.error(f"ExternalMetadata update failed for {accession}")
            update_values = {
                "status_all": StatusAll.HAS_ERRORS_EXT_METADATA_UPLOAD,
                "started_at": datetime.now(tz=pytz.utc),
            }
            number_rows_updated = 0
            tries = 0
            while number_rows_updated != 1 and tries < retry_number:
                if tries > 0:
                    # If state not correctly added retry
                    logger.warning(
                        f"External metadata update creation failed and DB update failed - reentry DB update #{tries}."
                    )
                number_rows_updated = update_db_where_conditions(
                    db_config,
                    table_name="submission_table",
                    conditions=seq_key,
                    update_values=update_values,
                )
                tries += 1
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

    1. Find all entries in submission_table in state HAS_ERRORS_EXT_METADATA_UPLOAD over time_threshold
    2. If time since last slack_notification is over slack_time_threshold send notification
    """
    entries_with_errors = find_stuck_in_submission_db(
        db_config,
        time_threshold=time_threshold,
    )
    if len(entries_with_errors) > 0:
        error_msg = (
            f"{config.backend_url}: ENA Submission pipeline found {len(entries_with_errors)} entries"
            f" in submission_table in status HAS_ERRORS_EXT_METADATA_UPLOAD for over {time_threshold}m"
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
            print("upload_external_metadata stopped due to exception in another task")
            return
        logger.debug("Checking for external metadata to upload to Loculus")
        get_external_metadata_and_send_to_loculus(db_config, config)
        upload_handle_errors(
            db_config,
            config,
            slack_config,
        )
        time.sleep(config.time_between_iterations)


if __name__ == "__main__":
    upload_external_metadata()
