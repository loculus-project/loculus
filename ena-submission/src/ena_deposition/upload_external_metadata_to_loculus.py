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


def get_bioproject_accession_from_db(
    db_config: SimpleConnectionPool, project_id: str
) -> dict[str, str]:
    entry = find_conditions_in_db(
        db_config,
        table_name=TableName.PROJECT_TABLE,
        conditions={"project_id": project_id},
    )
    if len(entry) != 1:
        return {}
    return {"bioprojectAccession": entry[0]["result"]["bioproject_accession"]}


def get_biosample_accession_from_db(
    db_config: SimpleConnectionPool, accession: str, version: str
) -> dict[str, str]:
    entry = find_conditions_in_db(
        db_config,
        table_name=TableName.SAMPLE_TABLE,
        conditions={"accession": accession, "version": version},
    )
    if len(entry) != 1:
        return {}
    return {"biosampleAccession": entry[0]["result"]["biosample_accession"]}


def get_assembly_accessions_from_db(
    db_config: SimpleConnectionPool, accession: str, version: str
) -> tuple[dict[str, str], bool]:
    entry = find_conditions_in_db(
        db_config,
        table_name=TableName.ASSEMBLY_TABLE,
        conditions={"accession": accession, "version": version},
    )
    if len(entry) != 1:
        msg = f"Expected 1 record in {TableName.ASSEMBLY_TABLE}, but found {len(entry)} records."
        raise ValueError(msg)

    data = {}
    result = entry[0]["result"]
    all_present = True

    gca = result.get("gca_accession")
    if gca is not None:
        data["gcaAccession"] = gca
    else:
        all_present = False

    segment_names = result["segment_order"]
    for segment in segment_names:
        segment_suffix = f"_{segment}" if len(segment_names) > 1 else ""
        if base_key := f"insdc_accession_base{segment_suffix}" in result:
            data[f"insdcAccessionBase{segment_suffix}"] = result[base_key]
        else:
            all_present = False
        if full_key := f"insdc_accession_full{segment_suffix}" in result:
            data[f"insdcAccessionFull{segment_suffix}"] = result[full_key]
        else:
            all_present = False

    return data, all_present


def get_external_metadata(
    db_config: SimpleConnectionPool, entry: dict[str, Any]
) -> tuple[dict[str, Any], bool]:
    accession = entry["accession"]
    version = entry["version"]

    bioproject_accession = get_bioproject_accession_from_db(db_config, entry["project_id"])
    biosample_accession = get_biosample_accession_from_db(db_config, accession, version)
    assembly_accession, all_assemblies_present = get_assembly_accessions_from_db(
        db_config, accession, version
    )

    return {
        "accession": accession,
        "version": version,
        "externalMetadata": {
            **bioproject_accession,
            **biosample_accession,
            **assembly_accession,
        },
    }, all([bioproject_accession, biosample_accession, all_assemblies_present])


def get_external_metadata_and_send_to_loculus(
    db_config: SimpleConnectionPool, config: Config
) -> None:
    for status in (
        StatusAll.SUBMITTED_PROJECT,
        StatusAll.SUBMITTED_SAMPLE,
        StatusAll.SUBMITTING_ASSEMBLY,
        StatusAll.SUBMITTED_ALL,
    ):
        for entry in find_conditions_in_db(
            db_config,
            table_name=TableName.SUBMISSION_TABLE,
            conditions={"status_all": status},
        ):
            accession = entry["accession"]
            version = entry["version"]
            accession_version = f"{accession}.{version}"
            data, all_present = get_external_metadata(db_config, entry)
            seq_key = {"accession": accession, "version": version}

            # Is there something to submit?
            # a) there must be external metadata to submit
            # b) the external metadata must differ from what is already in the database
            if data.get("externalMetadata") is not None and (
                not entry.get("external_metadata")
                or any(
                    entry["external_metadata"].get(key) != value
                    for key, value in data.get("externalMetadata", {}).items()
                )
            ):
                try:
                    submit_external_metadata(
                        data,
                        config,
                        entry["organism"],
                    )
                    logger.info(
                        f"External metadata update for {accession_version} succeeded. "
                        f"Old data: {entry.get('external_metadata')}, "
                        f"new data: {data['externalMetadata']}"
                    )
                except Exception as e:
                    logger.exception(
                        f"Submitting external metadata to backend failed for "
                        f"{accession_version}: {e}"
                    )
                    continue
                try:
                    update_with_retry(
                        db_config,
                        conditions=seq_key,
                        update_values={
                            "external_metadata": json.dumps(data["externalMetadata"]),
                        },
                        table_name=TableName.SUBMISSION_TABLE,
                    )
                except Exception as e:
                    logger.exception(
                        f"Failed to add new state of submitted external metadata to db for "
                        f"{accession_version}: {e}"
                    )
                    continue
            else:
                logger.info(
                    f"No external metadata to submit for {accession_version} "
                    f"or no changes detected. "
                    f"data: {data}, entry: {entry}"
                )
            if status == StatusAll.SUBMITTED_ALL and all_present:
                try:
                    update_with_retry(
                        db_config,
                        conditions=seq_key,
                        update_values={
                            "status_all": StatusAll.SENT_TO_LOCULUS,
                            "finished_at": datetime.now(tz=pytz.utc),
                        },
                        table_name=TableName.SUBMISSION_TABLE,
                    )
                except Exception as e:
                    logger.exception(
                        f"Failed to update status_all for {accession_version} to "
                        f"{StatusAll.SENT_TO_LOCULUS}: {e}"
                    )


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
