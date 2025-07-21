import json
import logging
import re
import threading
import time
from datetime import datetime

import pytz
from attr import dataclass
from psycopg2.pool import SimpleConnectionPool

from .config import Config
from .ena_submission_helper import (
    CreationResult,
    create_ena_sample,
    get_alias,
    set_error_if_accession_not_exists,
)
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
    TableName,
    add_to_sample_table,
    db_init,
    find_conditions_in_db,
    find_errors_in_db,
    is_revision,
    update_db_where_conditions,
    update_with_retry,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class MetadataMapping:
    loculus_fields: list[str]
    default: str | None = None
    function: str | None = None
    args: list[str] | None = None
    units: str | None = None


def get_sample_attributes(
    config: Config, sample_metadata: dict[str, str], row: dict[str, str]
) -> list[SampleAttribute]:
    result: list[SampleAttribute] = []
    for field_name, field_config in config.metadata_mapping.items():
        mapping = MetadataMapping(
            loculus_fields=field_config["loculus_fields"],  # type: ignore[arg-type]
            default=field_config.get("default"),  # type: ignore[arg-type]
            function=field_config.get("function"),  # type: ignore[arg-type]
            args=field_config.get("args"),  # type: ignore[arg-type]
            units=field_config.get("units"),  # type: ignore[arg-type]
        )

        loculus_metadata_field_values = list(map(sample_metadata.get, mapping.loculus_fields))

        # Fields with function and args are processed differently
        if mapping.function and mapping.args:
            function = mapping.function
            args = mapping.args
            match function:
                case "match":  # Regex match each value against respective arg (as regex)
                    if len(loculus_metadata_field_values) != len(mapping.args):
                        logger.error(
                            f"Function {function} for field {field_name} expects {len(args)} "
                            f"arguments, but got {len(loculus_metadata_field_values)} values: "
                            f"{loculus_metadata_field_values}. "
                            "Will not be added to sample attributes."
                        )
                        continue
                    if all(
                        value is not None and re.match(pattern, value, re.IGNORECASE)
                        for pattern, value in zip(args, loculus_metadata_field_values, strict=True)
                    ):
                        value = "true"
                    else:
                        value = "false"
                case _:
                    logger.error(
                        f"Unknown function for field {field_name}: {mapping}. "
                        f"Function: {function} with args: {args} for {row['accession']}. "
                        "Will not be added to sample attributes."
                    )
                    continue
        else:
            value = "; ".join(value for value in loculus_metadata_field_values if value is not None)
        value_or_default = value or mapping.default
        if value_or_default:
            result.append(
                SampleAttribute(
                    tag=field_name,
                    value=value_or_default,
                    units=mapping.units,
                )
            )
    return result


def construct_sample_set_object(
    config: Config,
    sample_data_in_submission_table: dict[str, str | dict[str, str]],
    entry: dict[str, str],
    test: bool = False,
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
    sample_metadata: dict[str, str] = sample_data_in_submission_table["metadata"]  # type: ignore
    center_name = sample_data_in_submission_table["center_name"]
    organism: str = sample_data_in_submission_table["organism"]  # type: ignore
    organism_metadata = config.organisms[organism]["enaDeposition"]
    alias = get_alias(
        f"{entry['accession']}:{organism}:{config.unique_project_suffix}",
        test,
        config.set_alias_suffix,
    )
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
        title=f"{organism_metadata['scientific_name']}: Genome sequencing",
        description=(
            f"Automated upload of {organism_metadata['scientific_name']} sequences submitted by "
            f"{center_name} from {config.db_name}"
        ),
        sample_name=SampleName(
            taxon_id=organism_metadata["taxon_id"],
            scientific_name=organism_metadata["scientific_name"],
        ),
        sample_links=SampleLinks(
            sample_link=[ProjectLink(xref_link=XrefType(db=config.db_name, id=entry["accession"]))]
        ),
        sample_attributes=SampleAttributes(sample_attribute=list_sample_attributes),
    )
    return SampleSetType(sample=[sample_type])


def set_sample_table_entry(db_config, row, seq_key, config: Config):
    """Set sample_table entry for entry with biosampleAccession"""
    logger.debug(
        f"Accession: {row['accession']} already has biosampleAccession, adding to sample_table"
    )
    biosample = row["metadata"]["biosampleAccession"]

    logger.info("Checking if biosample actually exists and is public")
    seq_key = {"accession": row["accession"], "version": row["version"]}
    if (
        set_error_if_accession_not_exists(
            conditions=seq_key,
            accession=biosample,
            accession_type="BIOSAMPLE",
            db_pool=db_config,
            config=config,
        )
        is False
    ):
        return

    entry = {
        "accession": row["accession"],
        "version": row["version"],
        "result": {"ena_sample_accession": biosample, "biosample_accession": biosample},
        "status": Status.SUBMITTED,
    }
    sample_table_entry = SampleTableEntry(**entry)
    succeeded = add_to_sample_table(db_config, sample_table_entry)
    if succeeded:
        logger.debug("Succeeding in adding biosampleAccession to sample_table")
        update_values = {
            "status_all": StatusAll.SUBMITTED_SAMPLE,
        }
        update_db_where_conditions(
            db_config,
            table_name=TableName.SUBMISSION_TABLE,
            conditions=seq_key,
            update_values=update_values,
        )


def submission_table_start(db_config: SimpleConnectionPool, config: Config):
    """
    1. Find all entries in submission_table in state SUBMITTED_PROJECT
    2. If (exists an entry in the sample_table for (accession, version)):
    a.      If (in state SUBMITTED) update state in submission_table to SUBMITTED_SAMPLE
    b.      Else update state to SUBMITTING_SAMPLE
    3. If (exists "biosampleAccession" in "metadata"):
        create entry in sample_table, update state to SUBMITTED_SAMPLE
    4. Else create corresponding entry in sample_table
    """
    # Check submission_table for newly added sequences
    conditions = {"status_all": StatusAll.SUBMITTED_PROJECT}
    ready_to_submit = find_conditions_in_db(
        db_config, table_name=TableName.SUBMISSION_TABLE, conditions=conditions
    )
    logger.debug(
        f"Found {len(ready_to_submit)} entries in submission_table in status SUBMITTED_PROJECT"
    )
    for row in ready_to_submit:
        seq_key = {"accession": row["accession"], "version": row["version"]}

        # 1. check if there exists an entry in the sample table for seq_key
        corresponding_sample = find_conditions_in_db(
            db_config, table_name=TableName.SAMPLE_TABLE, conditions=seq_key
        )
        if len(corresponding_sample) == 1:
            if corresponding_sample[0]["status"] == str(Status.SUBMITTED):
                status_all = StatusAll.SUBMITTED_SAMPLE
            else:
                status_all = StatusAll.SUBMITTING_SAMPLE
        else:
            # If not: create sample_entry, change status to SUBMITTING_SAMPLE
            if "biosampleAccession" in row["metadata"] and row["metadata"]["biosampleAccession"]:
                set_sample_table_entry(db_config, row, seq_key, config)
                continue
            if not add_to_sample_table(db_config, SampleTableEntry(**seq_key)):
                continue
            status_all = StatusAll.SUBMITTING_SAMPLE
        update_db_where_conditions(
            db_config,
            table_name=TableName.SUBMISSION_TABLE,
            conditions=seq_key,
            update_values={"status_all": status_all},
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
        db_config, table_name=TableName.SUBMISSION_TABLE, conditions=conditions
    )
    logger.debug(
        f"Found {len(submitting_sample)} entries in submission_table in status SUBMITTING_SAMPLE"
    )
    for row in submitting_sample:
        seq_key = {"accession": row["accession"], "version": row["version"]}

        # 1. check if there exists an entry in the sample table for seq_key
        corresponding_sample = find_conditions_in_db(
            db_config, table_name=TableName.SAMPLE_TABLE, conditions=seq_key
        )
        if len(corresponding_sample) == 1 and corresponding_sample[0]["status"] == str(
            Status.SUBMITTED
        ):
            update_values = {"status_all": StatusAll.SUBMITTED_SAMPLE}
            update_db_where_conditions(
                db_config,
                table_name=TableName.SUBMISSION_TABLE,
                conditions=seq_key,
                update_values=update_values,
            )
        if len(corresponding_sample) == 0:
            error_msg = (
                "Entry in submission_table in status SUBMITTING_SAMPLE",
                " with no corresponding sample",
            )
            raise RuntimeError(error_msg)


def is_old_version(db_config: SimpleConnectionPool, seq_key: dict[str, str]):
    """Check if entry is incorrectly added older version - error and do not submit"""
    version = int(seq_key["version"])
    accession = {"accession": seq_key["accession"]}
    sample_data_in_submission_table = find_conditions_in_db(
        db_config, table_name=TableName.SUBMISSION_TABLE, conditions=accession
    )
    all_versions = sorted([int(entry["version"]) for entry in sample_data_in_submission_table])

    if version < all_versions[-1]:
        update_values = {
            "status": Status.HAS_ERRORS,
            "errors": json.dumps(["Revision version is not the latest version"]),
            "started_at": datetime.now(tz=pytz.utc),
        }
        logger.error(
            f"Sample creation failed for {seq_key['accession']} version {version} "
            "as it is not the latest version."
        )
        update_with_retry(
            db_config=db_config,
            conditions=seq_key,
            update_values=update_values,
            table_name=TableName.SAMPLE_TABLE,
            reraise=False,
        )
        return True
    return False


def sample_table_create(db_config: SimpleConnectionPool, config: Config, test: bool = False):
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
    conditions = {"status": Status.READY}
    ready_to_submit_sample = find_conditions_in_db(
        db_config, table_name=TableName.SAMPLE_TABLE, conditions=conditions
    )
    logger.debug(f"Found {len(ready_to_submit_sample)} entries in sample_table in status READY")
    for row in ready_to_submit_sample:
        seq_key = {"accession": row["accession"], "version": row["version"]}
        sample_data_in_submission_table = find_conditions_in_db(
            db_config, table_name=TableName.SUBMISSION_TABLE, conditions=seq_key
        )

        if is_old_version(db_config, seq_key):
            continue

        sample_set = construct_sample_set_object(
            config, sample_data_in_submission_table[0], row, test
        )
        update_values = {
            "status": Status.SUBMITTING,
            "started_at": datetime.now(tz=pytz.utc),
        }
        number_rows_updated = update_db_where_conditions(
            db_config,
            table_name=TableName.SAMPLE_TABLE,
            conditions=seq_key,
            update_values=update_values,
        )
        if number_rows_updated != 1:
            # state not correctly updated - do not start submission
            logger.warning(
                "sample_table: Status update from READY to SUBMITTING failed "
                "- not starting submission."
            )
            continue
        logger.info(f"Starting sample creation for accession {row['accession']}")
        sample_creation_results: CreationResult = create_ena_sample(
            config, sample_set, revision=is_revision(db_config, seq_key)
        )
        if sample_creation_results.result:
            update_values = {
                "status": Status.SUBMITTED,
                "result": json.dumps(sample_creation_results.result),
                "finished_at": datetime.now(tz=pytz.utc),
            }
            logger.info(
                f"Sample creation succeeded for {seq_key['accession']} version {seq_key['version']}"
            )
        else:
            update_values = {
                "status": Status.HAS_ERRORS,
                "errors": json.dumps(sample_creation_results.errors),
                "started_at": datetime.now(tz=pytz.utc),
            }
            logger.error(
                f"Sample creation failed for {seq_key['accession']} version {seq_key['version']}"
            )
        update_with_retry(
            db_config=db_config,
            conditions=seq_key,
            update_values=update_values,
            table_name=TableName.SAMPLE_TABLE,
        )


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
        db_config, TableName.SAMPLE_TABLE, time_threshold=time_threshold
    )
    if len(entries_with_errors) > 0:
        error_msg = (
            f"{config.backend_url}: ENA Submission pipeline found "
            f"{len(entries_with_errors)} entries"
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
            logger.warning("create_sample stopped due to exception in another task")
            return
        logger.debug("Checking for samples to create")
        submission_table_start(db_config, config=config)
        submission_table_update(db_config)

        sample_table_create(db_config, config, test=config.test)
        sample_table_handle_errors(db_config, config, slack_config)
        time.sleep(config.time_between_iterations)
