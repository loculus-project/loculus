import logging
import re
import threading
import time
from datetime import datetime
from typing import Any

import pytz
from attr import dataclass
from psycopg2.pool import SimpleConnectionPool

from .config import Config
from .ena_submission_helper import (
    CreationResult,
    create_ena_sample,
    ena_accession_exists,
    get_alias,
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
    AccessionVersion,
    SampleTableEntry,
    SampleTableEntryDict,
    Status,
    StatusAll,
    SubmissionTableEntry,
    TableName,
    add_to_sample_table,
    db_init,
    find_conditions_in_sample_db,
    find_conditions_in_submission_db,
    find_errors_in_db,
    is_revision,
    set_biosample_error,
    update_sample_db_where_conditions,
    update_sample_with_retry,
    update_submission_db_where_conditions,
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
    metadata_mapping: dict[str, dict[str, Any]], sample_metadata: dict[str, str]
) -> list[SampleAttribute]:
    """Turn Loculus metadata into ENA sample attributes per metadata_mapping."""

    result: list[SampleAttribute] = []

    for field_name, field_config in metadata_mapping.items():
        mapping = MetadataMapping(
            loculus_fields=field_config["loculus_fields"],  # type: ignore[arg-type]
            default=field_config.get("default"),  # type: ignore[arg-type]
            function=field_config.get("function"),  # type: ignore[arg-type]
            args=field_config.get("args"),  # type: ignore[arg-type]
            units=field_config.get("units"),  # type: ignore[arg-type]
        )

        loculus_metadata_field_values = map(sample_metadata.get, mapping.loculus_fields)

        # Fields with function and args are processed differently
        if mapping.function and mapping.args:
            function = mapping.function
            args = mapping.args
            match function:
                case "match":  # Regex match each value against respective arg (as regex)
                    if len(mapping.loculus_fields) != len(mapping.args):
                        logger.error(
                            f"Function {function} for field {field_name} expects {len(args)} "
                            f"arguments, but got {len(mapping.loculus_fields)} values: "
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
                        f"Function: {function} with args: {args}. "
                        "Will not be added to sample attributes."
                    )
                    continue
        else:
            value = "; ".join(value for value in loculus_metadata_field_values if value is not None)

        if value_or_default := value or mapping.default:
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
    sample_data_in_submission_table: SubmissionTableEntry,
    accession_version: AccessionVersion,
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
    sample_metadata: dict[str, str] = sample_data_in_submission_table.metadata
    center_name = sample_data_in_submission_table.center_name
    organism: str = sample_data_in_submission_table.organism
    organism_metadata = config.organisms[organism]["enaDeposition"]
    alias = get_alias(
        f"{accession_version['accession']}:{organism}:{config.unique_project_suffix}",
        test,
        config.set_alias_suffix,
    )
    sample_attributes = get_sample_attributes(config.metadata_mapping, sample_metadata)
    if config.ena_checklist:
        # default is https://www.ebi.ac.uk/ena/browser/view/ERC000011
        sample_checklist = SampleAttribute(
            tag="ENA-CHECKLIST",
            value=config.ena_checklist,
        )
        sample_attributes.append(sample_checklist)
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
            sample_link=[
                ProjectLink(
                    xref_link=XrefType(db=config.db_name, id=accession_version["accession"])
                )
            ]
        ),
        sample_attributes=SampleAttributes(sample_attribute=sample_attributes),
    )
    return SampleSetType(sample=[sample_type])


def set_sample_table_entry(
    db_config: SimpleConnectionPool, row: SubmissionTableEntry, config: Config, biosample: str
):
    """Set sample_table entry for entry with biosampleAccession"""
    logger.debug(
        f"Accession: {row.accession} already has biosampleAccession, adding to sample_table"
    )

    logger.info("Checking if biosample actually exists and is public")
    seq_key = row._get_primary_key()
    if not ena_accession_exists(biosample, config):
        error_text = f"Accession {biosample} of type BIOSAMPLE does not exist in ENA."
        logger.error(error_text)
        set_biosample_error(db_config, seq_key, error_text, biosample)
        return

    sample_table_entry = SampleTableEntry(
        accession=row.accession,
        version=row.version,
        result={"ena_sample_accession": biosample, "biosample_accession": biosample},
        status=Status.SUBMITTED,
    )
    succeeded = add_to_sample_table(db_config, sample_table_entry)
    if succeeded:
        logger.debug("Succeeding in adding biosampleAccession to sample_table")
        update_submission_db_where_conditions(
            db_config,
            conditions=seq_key,
            update_values={
                "status_all": StatusAll.SUBMITTED_SAMPLE,
            },
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
    ready_to_submit = find_conditions_in_submission_db(
        db_config, conditions={"status_all": StatusAll.SUBMITTED_PROJECT}
    )
    logger.debug(
        f"Found {len(ready_to_submit)} entries in submission_table in status SUBMITTED_PROJECT"
    )
    for row in ready_to_submit:
        seq_key = row._get_primary_key()

        # 1. check if there exists an entry in the sample table for seq_key
        corresponding_sample = find_conditions_in_sample_db(db_config, conditions=seq_key)
        if len(corresponding_sample) == 1:
            if corresponding_sample[0].status == Status.SUBMITTED:
                status_all = StatusAll.SUBMITTED_SAMPLE
            else:
                status_all = StatusAll.SUBMITTING_SAMPLE
        else:
            # If not: create sample_entry, change status to SUBMITTING_SAMPLE
            biosample_accession = row.metadata.get("biosampleAccession") if row.metadata else None
            if biosample_accession:
                set_sample_table_entry(db_config, row, config, biosample_accession)
                continue
            if not add_to_sample_table(db_config, SampleTableEntry(**seq_key)):
                continue
            status_all = StatusAll.SUBMITTING_SAMPLE
        update_submission_db_where_conditions(
            db_config,
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
    submitting_sample = find_conditions_in_submission_db(
        db_config, conditions={"status_all": StatusAll.SUBMITTING_SAMPLE}
    )
    logger.debug(
        f"Found {len(submitting_sample)} entries in submission_table in status SUBMITTING_SAMPLE"
    )
    for row in submitting_sample:
        seq_key = row._get_primary_key()

        # 1. check if there exists an entry in the sample table for seq_key
        corresponding_sample = find_conditions_in_sample_db(db_config, conditions=seq_key)
        if len(corresponding_sample) == 1 and corresponding_sample[0].status == Status.SUBMITTED:
            update_submission_db_where_conditions(
                db_config,
                conditions=seq_key,
                update_values={"status_all": StatusAll.SUBMITTED_SAMPLE},
            )
        if len(corresponding_sample) == 0:
            error_msg = (
                "Entry in submission_table in status SUBMITTING_SAMPLE",
                " with no corresponding sample",
            )
            raise RuntimeError(error_msg)


def is_old_version(db_config: SimpleConnectionPool, seq_key: AccessionVersion) -> bool:
    """Check if entry is incorrectly added older version - error and do not submit"""
    version = seq_key["version"]
    sample_data_in_submission_table = find_conditions_in_submission_db(
        db_config, conditions={"accession": seq_key["accession"]}
    )
    all_versions = sorted([int(entry.version) for entry in sample_data_in_submission_table])

    if version < all_versions[-1]:
        logger.error(
            f"Sample creation failed for {seq_key['accession']} version {version} "
            "as it is not the latest version."
        )
        update_sample_with_retry(
            db_config=db_config,
            conditions=seq_key,
            update_values={
                "status": Status.HAS_ERRORS,
                "errors": ["Revision version is not the latest version"],
                "started_at": datetime.now(tz=pytz.utc),
            },
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
    ready_to_submit_sample = find_conditions_in_sample_db(
        db_config, conditions={"status": Status.READY}
    )
    logger.debug(f"Found {len(ready_to_submit_sample)} entries in sample_table in status READY")
    for row in ready_to_submit_sample:
        seq_key = row._get_primary_key()
        if is_old_version(db_config, seq_key):
            logger.warning(f"Skipping submission for {seq_key} as it is not the latest version.")
            continue

        logger.info(f"Processing sample_table entry for {seq_key}")
        sample_data_in_submission_table = find_conditions_in_submission_db(
            db_config, conditions=seq_key
        )

        sample_set = construct_sample_set_object(
            config, sample_data_in_submission_table[0], seq_key, test
        )
        update_values = SampleTableEntryDict(
            status=Status.SUBMITTING,
            started_at=datetime.now(tz=pytz.utc),
        )
        number_rows_updated = update_sample_db_where_conditions(
            db_config,
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
        logger.info(f"Starting sample creation for accession {row.accession}")
        sample_creation_results: CreationResult = create_ena_sample(
            config, sample_set, revision=is_revision(db_config, seq_key)
        )
        if sample_creation_results.result:
            update_values = SampleTableEntryDict(
                status=Status.SUBMITTED,
                result=sample_creation_results.result,
                finished_at=datetime.now(tz=pytz.utc),
            )
            logger.info(
                f"Sample creation succeeded for {seq_key['accession']} version {seq_key['version']}"
            )
        else:
            update_values = SampleTableEntryDict(
                status=Status.HAS_ERRORS,
                errors=sample_creation_results.errors,
                started_at=datetime.now(tz=pytz.utc),
            )
            logger.error(
                f"Sample creation failed for {seq_key['accession']} version {seq_key['version']}"
            )
        update_sample_with_retry(
            db_config=db_config,
            conditions=seq_key,
            update_values=update_values,
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
