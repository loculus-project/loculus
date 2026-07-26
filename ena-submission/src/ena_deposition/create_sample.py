import logging
import re
import threading
from dataclasses import asdict
from datetime import datetime

import pytz
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from .config import Config, MetadataMapping
from .ena_submission_helper import (
    CreationResult,
    accession_exists,
    create_ena_sample,
    get_alias,
    retry_failed_submissions_for_matching_errors,
    set_accession_does_not_exist_error,
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
    Status,
    StatusAll,
    SubmissionTableEntry,
    db_init,
    find_errors_or_stuck_in_db,
    get_revision_status,
    update_db_where_conditions,
    update_with_retry,
)

logger = logging.getLogger(__name__)


def get_sample_attributes(
    metadata_mapping: dict[str, MetadataMapping], sample_metadata: dict[str, str]
) -> list[SampleAttribute]:
    """Turn Loculus metadata into ENA sample attributes per metadata_mapping."""

    result: list[SampleAttribute] = []

    for field_name, mapping in metadata_mapping.items():
        loculus_metadata_field_values = map(sample_metadata.get, mapping.loculus_fields)

        # Fields with function are processed differently
        if mapping.function:
            function = mapping.function
            args = mapping.args or []
            match function:
                case "match":  # Regex match each value against respective arg (as regex)
                    if len(mapping.loculus_fields) != len(args):
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
                case "deduplicate":
                    # Split using ';', strip whitespace, deduplicate, and re-join using '; '
                    unique_values = dict.fromkeys(
                        v.strip()
                        for value in loculus_metadata_field_values
                        if value is not None
                        for v in value.split(";")
                        if v.strip()
                    )
                    value = "; ".join(unique_values)
                case _:
                    logger.error(
                        f"Unknown function for field {field_name}: {mapping}. "
                        f"Function: {function} with args: {args}. "
                        "Will not be added to sample attributes."
                    )
                    continue
        else:
            value = "; ".join(
                str(value) for value in loculus_metadata_field_values if value is not None
            )

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
    submission_row: SubmissionTableEntry,
    sample_row: SampleTableEntry,
    random_alias: bool = False,
):
    """
    Construct sample set object, using:
    - sample_row: entry in sample_table
    - submission_row: corresponding entry in submission_table
    - config information, such as enaDeposition metadata for that organism
    If random_alias=True add a timestamp to the alias suffix to allow for multiple
    submissions of the same project for testing.
    (ENA blocks multiple submissions with the same alias)
    """
    sample_metadata: dict[str, str] = submission_row.seq_metadata  # type: ignore
    center_name = submission_row.center_name
    organism: str = submission_row.organism
    organism_metadata = config.enaOrganisms[organism]
    alias = get_alias(
        f"{sample_row.accession}:{organism}:{config.unique_project_suffix}",
        random_alias,
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
        title=f"{organism_metadata.scientific_name}: Genome sequencing",
        description=(
            f"Automated upload of {organism_metadata.scientific_name} sequences submitted by "
            f"{center_name} from {config.db_name}"
        ),
        sample_name=SampleName(
            taxon_id=organism_metadata.taxon_id,
            scientific_name=organism_metadata.scientific_name,
        ),
        sample_links=SampleLinks(
            sample_link=[
                ProjectLink(xref_link=XrefType(db=config.db_name, id=sample_row.accession))
            ]
        ),
        sample_attributes=SampleAttributes(sample_attribute=sample_attributes),
    )
    return SampleSetType(sample=[sample_type])


def update_with_existing_biosample(db_engine: Engine, row: SubmissionTableEntry, config: Config):
    """Update sample_table entry for entry with biosampleAccession"""
    logger.debug(
        f"Accession: {row.accession} already has biosampleAccession, updating sample_table"
    )
    biosample = row.seq_metadata["biosampleAccession"]

    logger.info("Checking if biosample actually exists and is public")
    if not accession_exists(biosample, config):
        set_accession_does_not_exist_error(
            conditions=asdict(row.pkey),
            accession=biosample,
            accession_type="BIOSAMPLE",
            db_engine=db_engine,
        )
        return

    logger.info("Updating entry with biosampleAccession to state SUBMITTED")
    update_successful_sample_submission(
        db_engine,
        row.pkey,
        CreationResult(
            errors=[],
            warnings=[],
            result={"ena_sample_accession": biosample, "biosample_accession": biosample},
        ),
    )


def sync_state_with_submission_table(db_engine: Engine):
    """
    1. Find all entries in submission_table in state SUBMITTED_PROJECT
    where no corresponding entry exists in sample_table (by accession and version)
    2. If (exists "biosampleAccession" in "metadata") add to result in new sample_table entry
    """
    stmt = (
        select(SubmissionTableEntry)
        .outerjoin(SubmissionTableEntry.sample)
        .where(
            SubmissionTableEntry.status_all == StatusAll.SUBMITTED_PROJECT,
            SampleTableEntry.accession.is_(None),
        )
    )
    with Session(db_engine) as session:
        submissions = session.scalars(stmt).all()

        created = []
        for submission in submissions:
            sample = SampleTableEntry(
                accession=submission.accession,
                version=submission.version,
                started_at=datetime.now(tz=pytz.utc),
                result=(
                    {"biosample_accession": biosample}
                    if (biosample := submission.seq_metadata.get("biosampleAccession"))
                    else None
                ),
            )
            submission.sample = sample
            created.append(sample)

        try:
            session.add_all(created)
            session.commit()
        except Exception:
            logger.exception("Error while syncing sample_table with submission_table")
            session.rollback()
            raise


def update_successful_sample_submission(
    db_engine: Engine, seq_key: AccessionVersion, sample_creation_results: CreationResult
):
    """Update entry in sample_table to state SUBMITTED with results after successful sample creation
    and update corresponding entry in submission_table to state SUBMITTED_SAMPLE"""
    with Session(db_engine) as session:
        try:
            submission_ = session.get(
                SubmissionTableEntry,
                asdict(seq_key),
            )

            submission_.sample.status = Status.SUBMITTED
            submission_.sample.finished_at = datetime.now(tz=pytz.utc)
            submission_.sample.result = sample_creation_results.result
            submission_.status_all = StatusAll.SUBMITTED_SAMPLE

            session.commit()
        except Exception:
            logger.exception(
                f"Error while updating submission_table for {seq_key} after successful sample creation"  # noqa: E501
            )
            session.rollback()


def sample_table_create(db_engine: Engine, config: Config):
    """
    1. Find all entries in sample_table in state READY
    2. Create sample_set_object: use metadata, center_name, organism, and ingest fields
    from submission_table
    3. Update sample_table to state SUBMITTING (only proceed if update succeeds)
    4. If (create_ena_sample succeeds): update_successful_sample_submission
    3. Else update state to HAS_ERRORS with error messages

    If config.random_alias=True add a timestamp to the alias suffix to allow for multiple
    submissions of the same sample for testing.
    """
    stmt = (
        select(SampleTableEntry, SubmissionTableEntry)
        .join(SampleTableEntry.submission)
        .where(SampleTableEntry.status == Status.READY)
    )

    with Session(db_engine) as session:
        ready_to_submit_sample = session.execute(stmt).all()

    logger.debug(f"Found {len(ready_to_submit_sample)} entries in sample_table in status READY")
    for sample, submission in ready_to_submit_sample:
        seq_key = sample.pkey
        revision_status = get_revision_status(db_engine, seq_key)
        if revision_status.is_revision and not revision_status.is_latest_revision:
            logger.warning(f"Skipping submission for {seq_key} as it is not the latest version.")
            continue

        logger.info(f"Processing sample_table entry for {seq_key}")

        if sample.result and sample.result.get("biosample_accession"):
            update_with_existing_biosample(db_engine, submission, config)
            continue

        sample_set = construct_sample_set_object(config, submission, sample, config.random_alias)
        update_values = {
            "status": Status.SUBMITTING,
            "started_at": datetime.now(tz=pytz.utc),
        }
        number_rows_updated = update_db_where_conditions(
            db_engine,
            model_class=SampleTableEntry,
            conditions=asdict(seq_key),
            update_values=update_values,
        )
        if number_rows_updated != 1:
            # state not correctly updated - do not start submission
            logger.warning(
                "sample_table: Status update from READY to SUBMITTING failed "
                "- not starting submission."
            )
            continue
        logger.info(f"Starting sample creation for accession {sample.accession}")
        sample_creation_results: CreationResult = create_ena_sample(
            config, sample_set, revision=revision_status.is_revision
        )
        if sample_creation_results.result:
            logger.info(
                f"Sample creation succeeded for {seq_key.accession} version {seq_key.version}"
            )
            update_successful_sample_submission(db_engine, seq_key, sample_creation_results)
        else:
            logger.error(
                f"Sample creation failed for {seq_key.accession} version {seq_key.version}"
            )
            update_with_retry(
                db_engine=db_engine,
                conditions=asdict(seq_key),
                update_values={
                    "status": Status.HAS_ERRORS,
                    "errors": sample_creation_results.errors,
                    "started_at": datetime.now(tz=pytz.utc),
                },
                model_class=SampleTableEntry,
            )


def sample_table_handle_errors(
    db_engine: Engine,
    config: Config,
    slack_config: SlackConfig,
    last_retry_time: datetime | None,
) -> datetime | None:
    """
    1. Find all entries in sample_table in state HAS_ERRORS or SUBMITTING
        over submitting_time_threshold_min
    2. If time since last slack_notification is over slack_retry_threshold_min send notification
    """
    entries_with_errors = find_errors_or_stuck_in_db(
        db_engine, SampleTableEntry, time_threshold=config.submitting_time_threshold_min
    )
    if len(entries_with_errors) > 0:
        error_msg = (
            f"{config.backend_url}: ENA Submission pipeline found "
            f"{len(entries_with_errors)} entries in sample_table in status "
            f"HAS_ERRORS or SUBMITTING for over {config.submitting_time_threshold_min}m"
        )
        send_slack_notification(
            error_msg,
            slack_config,
            time=datetime.now(tz=pytz.utc),
            slack_retry_threshold_min=config.slack_retry_threshold_min,
        )
        last_retry_time = retry_failed_submissions_for_matching_errors(
            entries_with_errors,
            db_engine,
            model_class=SampleTableEntry,
            config=config,
            last_retry=last_retry_time,
        )
        # TODO: Query ENA to check if sample has in fact been created
        # If created update sample_table
        # If not retry 3 times, then raise for manual intervention
    return last_retry_time


def create_sample(config: Config, stop_event: threading.Event):
    db_engine = db_init(config.db_password, config.db_username, config.db_url)
    slack_config = slack_conn_init(
        slack_hook_default=config.slack_hook,
        slack_token_default=config.slack_token,
        slack_channel_id_default=config.slack_channel_id,
    )
    last_retry_time: datetime | None = None

    while True:
        if stop_event.is_set():
            logger.warning("create_sample stopped due to exception in another task")
            return
        logger.debug("Checking for samples to create")
        sync_state_with_submission_table(db_engine)

        sample_table_create(db_engine, config)
        last_retry_time = sample_table_handle_errors(
            db_engine, config, slack_config, last_retry_time
        )
        if stop_event.wait(timeout=config.time_between_iterations):
            logger.info("create_sample stopped due to exception in another task")
            return
