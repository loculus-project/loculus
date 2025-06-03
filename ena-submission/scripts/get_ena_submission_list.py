import json
import logging
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import click
from ena_deposition.call_loculus import fetch_released_entries
from ena_deposition.config import Config, get_config
from ena_deposition.notifications import (
    SlackConfig,
    notify,
    slack_conn_init,
    upload_file_with_comment,
)
from ena_deposition.submission_db_helper import TableName, db_init, find_conditions_in_db
from psycopg2.pool import SimpleConnectionPool

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)

Accession = str
AccessionVersion = str


@dataclass
class SubmissionResults:
    entries_to_submit: dict[AccessionVersion, dict[str, Any]]
    entries_with_ext_metadata_to_submit: dict[AccessionVersion, dict[str, Any]]


def filter_for_submission(
    config: Config,
    db_config: SimpleConnectionPool,
    entries_iterator: Iterator[dict[str, Any]],
    organism: str,
    ena_specific_metadata: list[str],
) -> SubmissionResults:
    """
    Filter data in state APPROVED_FOR_RELEASE:
    - data must be state "OPEN" for use
    - data must not already exist in ENA or be in the submission process.
    To prevent this we need to make sure:
        - data was not submitted by the config.ingest_pipeline_submission_group
        - data is not in submission_table
        - as an extra check we discard all sequences with ena-specific-metadata fields
        (if users uploaded correctly this should not be needed)
    """
    data_dict: dict[Accession, dict[str, Any]] = {}
    data_dict_with_external_metadata: dict[Accession, dict[str, Any]] = {}
    for entry in entries_iterator:
        accession_version = entry["metadata"]["accessionVersion"]
        accession, version = entry["metadata"]["accessionVersion"].split(".")
        if entry["metadata"]["dataUseTerms"] != "OPEN":
            continue
        if entry["metadata"]["groupId"] == config.ingest_pipeline_submission_group:
            continue
        other_versions_in_db = find_conditions_in_db(
            db_config, table_name=TableName.SUBMISSION_TABLE, conditions={"accession": accession}
        )
        other_versions_list = sorted([entry["version"] for entry in other_versions_in_db])
        if other_versions_list and int(other_versions_list[-1]) >= int(version):
            # If the latest version in the db is greater or equal than the current version, ignore
            continue
        if accession in data_dict and data_dict[accession]["version"] >= version:
            # If the accession is already in the dict and the version is greater or equal, ignore
            continue
        if (
            accession in data_dict_with_external_metadata
            and data_dict_with_external_metadata[accession]["version"] >= version
        ):
            continue
        entry["organism"] = organism
        if any(entry["metadata"].get(field, False) for field in ena_specific_metadata):
            logger.warning(
                f"Found sequence: {accession_version} with ena-specific-metadata fields and not "
                f"submitted by us or {config.ingest_pipeline_submission_group}."
            )
            data_dict_with_external_metadata[accession] = entry
            continue
        data_dict[accession] = entry
    return SubmissionResults(
        entries_to_submit={f"{key}.{data['version']}": data for key, data in data_dict.items()},
        entries_with_ext_metadata_to_submit={
            f"{key}.{data['version']}": data
            for key, data in data_dict_with_external_metadata.items()
        },
    )


def send_slack_notification_with_file(
    slack_config: SlackConfig,
    message: str,
    entries_to_submit: dict[AccessionVersion, dict[str, Any]],
    output_file,
) -> None:
    len_entries = len(entries_to_submit)
    logger.info(f"Writing {len_entries} sequences to {output_file}")
    Path(output_file).write_text(json.dumps(entries_to_submit), encoding="utf-8")

    logger.info("Sending slack notification with file")
    if not slack_config.slack_hook:
        logger.info("Could not find slack hook, cannot send message")
        return
    try:
        response = upload_file_with_comment(slack_config, output_file, message)
        if not response.get("ok", False):
            raise Exception
    except Exception as e:
        logger.error(f"Error uploading file to slack: {e}")
        notify(slack_config, message + f" - file upload to slack failed with Error {e}")


@click.command()
@click.option(
    "--config-file",
    required=True,
    type=click.Path(exists=True),
)
def get_ena_submission_list(config_file):
    """
    Get a list of all sequences in state APPROVED_FOR_RELEASE without insdc-specific
    metadata fields and not already in the ena_submission.submission_table.
    """
    config: Config = get_config(config_file)

    logger.setLevel(config.log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logger.info(f"Config: {config}")

    output_file_suffix = "ena_submission_list.json"

    db_config = db_init(
        db_password_default=config.db_password,
        db_username_default=config.db_username,
        db_url_default=config.db_url,
    )
    slack_config = slack_conn_init(
        slack_hook_default=config.slack_hook,
        slack_token_default=config.slack_token,
        slack_channel_id_default=config.slack_channel_id,
    )

    all_entries_to_submit: dict[AccessionVersion, dict[str, Any]] = {}
    for organism in config.organisms:
        ena_specific_metadata = [
            value["name"] for value in config.organisms[organism]["externalMetadata"]
        ]
        logger.info(f"Getting released sequences for organism: {organism}")

        released_entries = fetch_released_entries(config, organism)
        submission_results = filter_for_submission(
            config, db_config, released_entries, organism, ena_specific_metadata
        )
        if submission_results.entries_to_submit:
            logger.info(
                f"Found {len(submission_results.entries_to_submit)} sequences to submit to ENA"
            )
            message = (
                f"{config.backend_url}: {organism} - ENA Submission pipeline wants to submit "
                f"{len(submission_results.entries_to_submit)} sequences"
            )
            output_file = f"{organism}_{output_file_suffix}"
            send_slack_notification_with_file(
                slack_config, message, submission_results.entries_to_submit, output_file
            )
        if submission_results.entries_with_ext_metadata_to_submit:
            message = (
                f"{config.backend_url}: {organism} - ENA Submission pipeline found "
                f"{len(submission_results.entries_with_ext_metadata_to_submit)} sequences with"
                " ena-specific-metadata fields"
                " and not submitted by us or ingested from the INSDC, this might be a user error."
                " If you think this is accurate ensure bioproject and biosample are set correctly."
                " Bioprojects should be public and SRA accessions should also include bioprojects"
                " and biosamples."
            )
            output_file = f"{organism}_with_ena_fields_{output_file_suffix}"
            send_slack_notification_with_file(
                slack_config,
                message,
                submission_results.entries_with_ext_metadata_to_submit,
                output_file,
            )
        all_entries_to_submit.update(submission_results.entries_to_submit)

    if not all_entries_to_submit:
        comment = f"{config.backend_url}: No sequences found to submit to ENA"
        logger.info(comment)
        notify(slack_config, comment)


if __name__ == "__main__":
    get_ena_submission_list()
