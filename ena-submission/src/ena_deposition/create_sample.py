import json
import logging
import re
import threading
import time
from datetime import datetime

import pytz
from psycopg2.pool import SimpleConnectionPool

from .config import Config
from .ena_submission_helper import CreationResult, create_ena_sample, get_ena_config
from .ena_types import (
    ProjectLink,
    SampleAttribute,
    SampleAttributes,
    SampleLinks,
    SampleName,
    SampleSetType,
    SampleType,
    XmlAttribute,
    XrefType,
)
from .notifications import SlackConfig, send_slack_notification, slack_conn_init
from .submission_db_helper import (
    SampleTableEntry,
    Status,
    StatusAll,
    add_to_sample_table,
    db_init,
    find_conditions_in_db,
    find_errors_in_db,
    update_db_where_conditions,
)


def get_sample_attributes(config: Config, sample_metadata: dict[str, str], row: dict[str, str]):
    list_sample_attributes = []
    mapped_fields = []
    for field in config.metadata_mapping:
        loculus_metadata_field_names = config.metadata_mapping[field]["loculus_fields"]
        loculus_metadata_field_values = [
            sample_metadata.get(metadata) for metadata in loculus_metadata_field_names
        ]
        if (
            "function" in config.metadata_mapping[field]
            and "args" in config.metadata_mapping[field]
        ):
            function = config.metadata_mapping[field]["function"]
            args = [i for i in config.metadata_mapping[field]["args"] if i]
            full_field_values = [i for i in loculus_metadata_field_values if i]
            if function != "match":
                logging.warning(
                    f"Unknown function: {function} with args: {args} for {row["accession"]}"
                )
                continue
            if function == "match" and (len(full_field_values) == len(args)):
                value = True
                for i in range(len(full_field_values)):
                    if not re.match(
                        args[i],
                        full_field_values[i],
                        re.IGNORECASE,
                    ):
                        value = False
                        break
            else:
                continue
        else:
            value = ";".join(
                [str(metadata) for metadata in loculus_metadata_field_values if metadata]
            )
        if value:
            list_sample_attributes.append(
                SampleAttribute(
                    tag=field, value=value, units=config.metadata_mapping[field].get("units")
                )
            )
            mapped_fields.append(field)
    for field, default in config.metadata_mapping_mandatory_field_defaults.items():
        if field not in mapped_fields:
            list_sample_attributes.append(
                SampleAttribute(
                    tag=field,
                    value=default,
                )
            )
    return list_sample_attributes


def construct_sample_set_object(
    config: Config,
    sample_data_in_submission_table: dict[str, str],
    entry: dict[str, str],
    test=False,
):
    """
    Construct sample set object, using:
    - entry in sample_table
    - sample_data_in_submission_table: corresponding entry in submission_table
    - config information, such as enaDeposition metadata for that organism
    If test=True add a timestamp to the alias suffix to allow for multiple
    submissions of the same project for testing.
    (ENA blocks multiple submissions with the same alias)
    """
    sample_metadata = sample_data_in_submission_table["metadata"]
    center_name = sample_data_in_submission_table["center_name"]
    organism = sample_data_in_submission_table["organism"]
    organism_metadata = config.organisms[organism]["enaDeposition"]
    if test:
        alias = XmlAttribute(
            f"{entry["accession"]}:{organism}:{config.unique_project_suffix}:{datetime.now(tz=pytz.utc)}"
        )
    else:
        alias = XmlAttribute(f"{entry["accession"]}:{organism}:{config.unique_project_suffix}")
    list_sample_attributes = get_sample_attributes(config, sample_metadata, entry)
    if config.ena_checklist:
        # default is https://www.ebi.ac.uk/ena/browser/view/ERC000011
        sample_checklist = SampleAttribute(
            tag="ENA-CHECKLIST",
            value=config.ena_checklist,
        )
        list_sample_attributes.append(sample_checklist)
    sample_type = SampleType(
        center_name=XmlAttribute(center_name),
        alias=alias,
        title=f"{organism_metadata["scientific_name"]}: Genome sequencing",
        description=(
            f"Automated upload of {organism_metadata["scientific_name"]} sequences submitted by "
            f"{center_name} from {config.db_name}"
        ),
        sample_name=SampleName(
            taxon_id=organism_metadata["taxon_id"],
            scientific_name=organism_metadata["scientific_name"],
        ),
        sample_links=SampleLinks(
            sample_link=ProjectLink(xref_link=XrefType(db=config.db_name, id=entry["accession"]))
        ),
        sample_attributes=SampleAttributes(sample_attribute=list_sample_attributes),
    )
    return SampleSetType(sample=[sample_type])


def submission_table_start(db_config: SimpleConnectionPool):
    """
    1. Find all entries in submission_table in state SUBMITTED_PROJECT
    2. If (exists an entry in the sample_table for (accession, version)):
    a.      If (in state SUBMITTED) update state in submission_table to SUBMITTED_SAMPLE
    b.      Else update state to SUBMITTING_SAMPLE
    3. Else create corresponding entry in sample_table
    """
    # Check submission_table for newly added sequences
    conditions = {"status_all": StatusAll.SUBMITTED_PROJECT}
    ready_to_submit = find_conditions_in_db(
        db_config, table_name="submission_table", conditions=conditions
    )
    logging.debug(
        f"Found {len(ready_to_submit)} entries in submission_table in status SUBMITTED_PROJECT"
    )
    for row in ready_to_submit:
        seq_key = {"accession": row["accession"], "version": row["version"]}

        # 1. check if there exists an entry in the sample table for seq_key
        corresponding_sample = find_conditions_in_db(
            db_config, table_name="sample_table", conditions=seq_key
        )
        if len(corresponding_sample) == 1:
            if corresponding_sample[0]["status"] == str(Status.SUBMITTED):
                update_values = {"status_all": StatusAll.SUBMITTED_SAMPLE}
                update_db_where_conditions(
                    db_config,
                    table_name="submission_table",
                    conditions=seq_key,
                    update_values=update_values,
                )
            else:
                update_values = {"status_all": StatusAll.SUBMITTING_SAMPLE}
                update_db_where_conditions(
                    db_config,
                    table_name="submission_table",
                    conditions=seq_key,
                    update_values=update_values,
                )
        else:
            # If not: create sample_entry, change status to SUBMITTING_SAMPLE
            sample_table_entry = SampleTableEntry(**seq_key)
            succeeded = add_to_sample_table(db_config, sample_table_entry)
            if succeeded:
                update_values = {"status_all": StatusAll.SUBMITTING_SAMPLE}
                update_db_where_conditions(
                    db_config,
                    table_name="submission_table",
                    conditions=seq_key,
                    update_values=update_values,
                )


def submission_table_update(db_config: SimpleConnectionPool):
    """
    1. Find all entries in submission_table in state SUBMITTING_SAMPLE
    2. If (exists an entry in the sample_table for (accession, version)):
    a.      If (in state SUBMITTED) update state in submission_table to SUBMITTED_SAMPLE
    3. Else throw Error
    """
    conditions = {"status_all": StatusAll.SUBMITTING_SAMPLE}
    submitting_sample = find_conditions_in_db(
        db_config, table_name="submission_table", conditions=conditions
    )
    logging.debug(
        f"Found {len(submitting_sample)} entries in submission_table in" " status SUBMITTING_SAMPLE"
    )
    for row in submitting_sample:
        seq_key = {"accession": row["accession"], "version": row["version"]}

        # 1. check if there exists an entry in the sample table for seq_key
        corresponding_sample = find_conditions_in_db(
            db_config, table_name="sample_table", conditions=seq_key
        )
        if len(corresponding_sample) == 1 and corresponding_sample[0]["status"] == str(
            Status.SUBMITTED
        ):
            update_values = {"status_all": StatusAll.SUBMITTED_SAMPLE}
            update_db_where_conditions(
                db_config,
                table_name="submission_table",
                conditions=seq_key,
                update_values=update_values,
            )
        if len(corresponding_sample) == 0:
            error_msg = (
                "Entry in submission_table in status SUBMITTING_SAMPLE",
                " with no corresponding sample",
            )
            raise RuntimeError(error_msg)


def sample_table_create(
    db_config: SimpleConnectionPool, config: Config, retry_number: int = 3, test: bool = False
):
    """
    1. Find all entries in sample_table in state READY
    2. Create sample_set_object: use metadata, center_name, organism, and ingest fields
    from submission_table
    3. Update sample_table to state SUBMITTING (only proceed if update succeeds)
    4. If (create_ena_sample succeeds): update state to SUBMITTED with results
    3. Else update state to HAS_ERRORS with error messages

    If test=True add a timestamp to the alias suffix to allow for multiple submissions of the same
    sample for testing.
    """
    ena_config = get_ena_config(
        config.ena_submission_username,
        config.ena_submission_password,
        config.ena_submission_url,
        config.ena_reports_service_url,
    )
    conditions = {"status": Status.READY}
    ready_to_submit_sample = find_conditions_in_db(
        db_config, table_name="sample_table", conditions=conditions
    )
    logging.debug(f"Found {len(ready_to_submit_sample)} entries in sample_table in status READY")
    for row in ready_to_submit_sample:
        seq_key = {"accession": row["accession"], "version": row["version"]}
        sample_data_in_submission_table = find_conditions_in_db(
            db_config, table_name="submission_table", conditions=seq_key
        )

        sample_set = construct_sample_set_object(
            config, sample_data_in_submission_table[0], row, test
        )
        update_values = {
            "status": Status.SUBMITTING,
            "started_at": datetime.now(tz=pytz.utc),
        }
        number_rows_updated = update_db_where_conditions(
            db_config,
            table_name="sample_table",
            conditions=seq_key,
            update_values=update_values,
        )
        if number_rows_updated != 1:
            # state not correctly updated - do not start submission
            logging.warning(
                "sample_table: Status update from READY to SUBMITTING failed "
                "- not starting submission."
            )
            continue
        logging.info(f"Starting sample creation for accession {row["accession"]}")
        sample_creation_results: CreationResult = create_ena_sample(ena_config, sample_set)
        if sample_creation_results.result:
            update_values = {
                "status": Status.SUBMITTED,
                "result": json.dumps(sample_creation_results.result),
                "finished_at": datetime.now(tz=pytz.utc),
            }
            number_rows_updated = 0
            tries = 0
            while number_rows_updated != 1 and tries < retry_number:
                if tries > 0:
                    # If state not correctly added retry
                    logging.warning(
                        f"Sample created but DB update failed - reentry DB update #{tries}."
                    )
                number_rows_updated = update_db_where_conditions(
                    db_config,
                    table_name="sample_table",
                    conditions=seq_key,
                    update_values=update_values,
                )
                tries += 1
            if number_rows_updated == 1:
                logging.info(f"Sample creation for accession {row["accession"]} succeeded!")
        else:
            update_values = {
                "status": Status.HAS_ERRORS,
                "errors": json.dumps(sample_creation_results.errors),
                "started_at": datetime.now(tz=pytz.utc),
            }
            number_rows_updated = 0
            tries = 0
            while number_rows_updated != 1 and tries < retry_number:
                if tries > 0:
                    # If state not correctly added retry
                    logging.warning(
                        f"sample creation failed and DB update failed - reentry DB update #{tries}."
                    )
                number_rows_updated = update_db_where_conditions(
                    db_config,
                    table_name="sample_table",
                    conditions=seq_key,
                    update_values=update_values,
                )
                tries += 1


def sample_table_handle_errors(
    db_config: SimpleConnectionPool,
    config: Config,
    slack_config: SlackConfig,
    time_threshold: int = 15,
    slack_time_threshold: int = 12,
):
    """
    - time_threshold: (minutes)
    - slack_time_threshold: (hours)
    1. Find all entries in sample_table in state HAS_ERRORS or SUBMITTING over time_threshold
    2. If time since last slack_notification is over slack_time_threshold send notification
    """
    entries_with_errors = find_errors_in_db(
        db_config, "sample_table", time_threshold=time_threshold
    )
    if len(entries_with_errors) > 0:
        error_msg = (
            f"{config.backend_url}: ENA Submission pipeline found {len(entries_with_errors)} entries"
            f" in sample_table in status HAS_ERRORS or SUBMITTING for over {time_threshold}m"
        )
        send_slack_notification(
            error_msg,
            slack_config,
            time=datetime.now(tz=pytz.utc),
            time_threshold=slack_time_threshold,
        )
        # TODO: Query ENA to check if sample has in fact been created
        # If created update sample_table
        # If not retry 3 times, then raise for manual intervention


def create_sample(config: Config, stop_event: threading.Event):

    db_config = db_init(config.db_password, config.db_username, config.db_url)
    slack_config = slack_conn_init(
        slack_hook_default=config.slack_hook,
        slack_token_default=config.slack_token,
        slack_channel_id_default=config.slack_channel_id,
    )

    while True:
        if stop_event.is_set():
            print("create_sample stopped due to exception in another task")
            return
        logging.debug("Checking for samples to create")
        submission_table_start(db_config)
        submission_table_update(db_config)

        sample_table_create(db_config, config, test=config.test)
        sample_table_handle_errors(db_config, config, slack_config)
        time.sleep(config.time_between_iterations)


if __name__ == "__main__":
    create_sample()
