import json
import logging
from pathlib import Path
from typing import Any

import click
from ena_deposition.config import Config, get_config
from ena_deposition.call_loculus import fetch_released_entries
from ena_deposition.notifications import notify, slack_conn_init, upload_file_with_comment
from ena_deposition.submission_db_helper import db_init, in_submission_table
from psycopg2.pool import SimpleConnectionPool

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


def filter_for_submission(
    config: Config, db_config: SimpleConnectionPool, entries: dict[str, str], organism: str
) -> dict[str, Any]:
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
        if in_submission_table(db_config, {"accession": accession, "version": version}):
            continue
        if any(item["metadata"].get(field, False) for field in config.ena_specific_metadata):
            logging.warning(
                f"Found sequence: {key} with ena-specific-metadata fields and not submitted by us ",
                f"or {config.ingest_pipeline_submitter}. Potential user error: discarding sequence.",
            )
            continue
        item["organism"] = organism
        data_dict[key] = item
    return data_dict


def send_slack_notification_with_file(config: Config, output_file: str) -> None:
    slack_config = slack_conn_init(
        slack_hook_default=config.slack_hook,
        slack_token_default=config.slack_token,
        slack_channel_id_default=config.slack_channel_id,
    )
    if not slack_config.slack_hook:
        logging.info("Could not find slack hook, cannot send message")
        return
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
    "--config-file",
    required=True,
    type=click.Path(exists=True),
)
@click.option(
    "--output-file",
    required=False,
    type=click.Path(),
)
def get_ena_submission_list(config_file, output_file):
    """
    Get a list of all sequences in state APPROVED_FOR_RELEASE without insdc-specific
    metadata fields and not already in the ena_submission.submission_table.
    """
    config: Config = get_config(config_file)

    logger.setLevel(config.log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logger.info(f"Config: {config}")

    db_config = db_init(
        db_password_default=config.db_password,
        db_username_default=config.db_username,
        db_url_default=config.db_url,
    )

    file_path = Path(output_file)
    directory = file_path.parent
    if not directory.exists():
        directory.mkdir(parents=True)
        logging.debug(f"Created directory '{directory}'")

    entries_to_submit = {}
    for organism in config.organisms:
        config.ena_specific_metadata = [
            value["name"] for value in config.organisms[organism]["externalMetadata"]
        ]
        logging.info(f"Getting released sequences for organism: {organism}")

        released_entries = fetch_released_entries(config, organism)
        submittable_entries = filter_for_submission(config, db_config, released_entries, organism)
        entries_to_submit.update(submittable_entries)

    if entries_to_submit:
        Path(output_file).write_text(json.dumps(entries_to_submit), encoding="utf-8")
        send_slack_notification_with_file(config, output_file)
    else:
        logging.info("No sequences found to submit to ENA")
        Path(output_file).write_text("", encoding="utf-8")


if __name__ == "__main__":
    get_ena_submission_list()
