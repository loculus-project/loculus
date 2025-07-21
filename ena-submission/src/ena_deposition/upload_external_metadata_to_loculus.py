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


def _get_results_of_single_db_record(
    db_config: SimpleConnectionPool,
    table_name: TableName,
    conditions: dict[str, Any],
) -> dict[str, Any]:
    """Helper to get a single record from database with validation."""
    entries = find_conditions_in_db(db_config, table_name=table_name, conditions=conditions)

    if not entries:
        return {}

    if len(entries) > 1:
        msg = (
            f"Expected 1 record in {table_name} for conditions: {conditions}, "
            f"but found {len(entries)} records."
        )
        raise ValueError(msg)

    if not isinstance(entries[0], dict) or "result" not in entries[0]:
        msg = (
            f"Expected a single record with 'result' in {table_name} for conditions: {conditions}, "
            f"but found: {entries[0]}"
        )
        raise ValueError(msg)

    return entries[0]["result"]


def get_bioproject_accession_from_db(
    db_config: SimpleConnectionPool, project_id: str
) -> dict[str, str]:
    result = _get_results_of_single_db_record(
        db_config, TableName.PROJECT_TABLE, {"project_id": project_id}
    )

    if not result or "bioproject_accession" not in result:
        return {}

    return {"bioprojectAccession": result["bioproject_accession"]}


def get_biosample_accession_from_db(
    db_config: SimpleConnectionPool, accession: str, version: str
) -> dict[str, str]:
    result = _get_results_of_single_db_record(
        db_config,
        TableName.SAMPLE_TABLE,
        {"accession": accession, "version": version},
    )

    if not result or "biosample_accession" not in result:
        return {}

    return {"biosampleAccession": result["biosample_accession"]}


def get_assembly_accessions_from_db(
    db_config: SimpleConnectionPool, accession: str, version: str
) -> tuple[dict[str, str], bool]:
    result = _get_results_of_single_db_record(
        db_config,
        TableName.ASSEMBLY_TABLE,
        {"accession": accession, "version": version},
    )

    if not result:
        return {}, False

    data = {}
    all_present = True

    if gca := result.get("gca_accession"):
        data["gcaAccession"] = gca
    else:
        all_present = False

    segment_names = result.get("segment_order", [])
    for segment in segment_names:
        # NOTE: Assume that no multi-segment organism ever has a segment named "main"
        segment_suffix = f"_{segment}" if segment_names != ["main"] else ""

        base_key = f"insdc_accession{segment_suffix}"
        if base_key in result:
            data[f"insdcAccessionBase{segment_suffix}"] = result[base_key]
        else:
            all_present = False

        full_key = f"insdc_accession_full{segment_suffix}"
        if full_key in result:
            data[f"insdcAccessionFull{segment_suffix}"] = result[full_key]
        else:
            all_present = False

    return data, all_present


def get_external_metadata_to_upload(
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
            data, all_present = get_external_metadata_to_upload(db_config, entry)
            seq_key = {"accession": accession, "version": version}

            previously_uploaded: dict[str, Any] = entry.get("external_metadata", {})
            new_external_metadata: dict[str, Any] = data.get("externalMetadata", {})

            if new_external_metadata and (
                not previously_uploaded
                or any(
                    previously_uploaded.get(key) != value
                    for key, value in new_external_metadata.items()
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
                        f"Old data: {previously_uploaded}, "
                        f"new data: {new_external_metadata}"
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
                            "external_metadata": json.dumps(new_external_metadata),
                        },
                        table_name=TableName.SUBMISSION_TABLE,
                    )
                except Exception as e:
                    logger.exception(
                        f"Failed to add new state of submitted external metadata to db for "
                        f"{accession_version}: {e}"
                    )
                    continue
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
                    update_with_retry(
                        db_config,
                        conditions=seq_key,
                        update_values={
                            "status_all": StatusAll.HAS_ERRORS_EXT_METADATA_UPLOAD,
                            "finished_at": datetime.now(tz=pytz.utc),
                        },
                        table_name=TableName.SUBMISSION_TABLE,
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
