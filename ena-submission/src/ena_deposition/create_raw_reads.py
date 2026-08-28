import json
import logging
import os
import threading
import traceback
from dataclasses import asdict
from datetime import datetime
from typing import Any, Literal, cast

import pytz
from sqlalchemy import Engine

from ena_deposition import call_loculus

from .config import Config
from .ena_submission_helper import (
    CreationResult,
    create_ena_raw_reads,
    create_manifest,
    get_alias,
    get_description,
    linked_accession_diff,
    manifest_fields_diff,
    resolve_manifest_field,
    retry_failed_submissions_for_matching_errors,
)
from .ena_types import (
    Instrument,
    LibrarySelection,
    LibrarySource,
    LibraryStrategy,
    Platform,
    RawReadsManifest,
)
from .notifications import SlackConfig, notify, send_slack_notification, slack_conn_init
from .submission_db_helper import (
    AccessionVersion,
    RawReadsTableEntry,
    Status,
    StatusAll,
    SubmissionTableEntry,
    add_to_raw_reads_table,
    db_init,
    find_conditions_in_db,
    find_errors_or_stuck_in_db,
    get_last_entry,
    get_project_and_sample_results,
    is_latest_revision,
    is_revision,
    previous_version,
    update_db_where_conditions,
    update_with_retry,
)

logger = logging.getLogger(__name__)


def get_platform_and_instrument(
    raw_value: str, accession: str
) -> tuple[Platform | None, Instrument]:
    """
    The `sequencingInstrument` metadata field may hold either an ENA PLATFORM value
    (e.g. "ILLUMINA") or an ENA INSTRUMENT value (e.g. "Illumina MiSeq") - the two
    permitted value sets don't overlap, so a case-insensitive lookup against both
    unambiguously tells us which one the user provided.
    """
    if instrument := Instrument.from_value(raw_value):
        return None, instrument
    if platform := Platform.from_value(raw_value):
        return platform, Instrument.unspecified
    if raw_value != "unspecified":
        logger.warning(
            f"sequencingInstrument value '{raw_value}' for accession {accession} matches "
            "neither ENA's platform nor instrument list, defaulting to instrument=unspecified"
        )
    return None, Instrument.unspecified


def create_manifest_object(
    config: Config,
    sample_accession: str,
    study_accession: str,
    submission_row: SubmissionTableEntry,
    dir: str | None = None,
    random_alias: bool = False,
) -> RawReadsManifest:
    """
    Create an RawReadsManifest object for an entry in the raw reads table using:
    - the corresponding ena_sample_accession and bioproject_accession
    - the organism metadata from the config file
    - downloaded fastq files from the corresponding submission table entry,

    If random_alias=True add a timestamp to the alias suffix to allow for multiple
    submissions of the same manifest for testing.
    """
    # We must create a new run read accession for each revision that changes the files
    alias = get_alias(
        f"{submission_row.accession}:{submission_row.version}:{submission_row.organism}:{config.unique_raw_reads_suffix}",
        random_alias,
    ).name
    metadata = submission_row.seq_metadata
    raw_reads_manifest_fields_mapping = config.raw_reads_manifest_fields_mapping

    # instrument_model mapping always defines a default, so resolution cannot return None
    sequencing_instrument = cast(
        str,
        resolve_manifest_field(raw_reads_manifest_fields_mapping["instrument"], metadata),
    )
    platform, instrument = get_platform_and_instrument(
        sequencing_instrument, submission_row.accession
    )
    fastq_files = call_loculus.download_fastq_files(config, metadata, submission_row.accession, dir)
    if len(fastq_files) == 0:
        msg = f"No fastq files found for accession {submission_row.accession}"
        raise RuntimeError(msg)

    insert_size_ = resolve_manifest_field(
        raw_reads_manifest_fields_mapping["insert_size"], metadata
    )
    insert_size = int(insert_size_) if len(fastq_files) > 1 and insert_size_ else None
    library_source = LibrarySource.from_value(
        resolve_manifest_field(raw_reads_manifest_fields_mapping["library_source"], metadata),
        LibrarySource.OTHER,
    )
    library_selection = LibrarySelection.from_value(
        resolve_manifest_field(raw_reads_manifest_fields_mapping["library_selection"], metadata),
        LibrarySelection.UNSPECIFIED,
    )
    library_strategy = LibraryStrategy.from_value(
        resolve_manifest_field(raw_reads_manifest_fields_mapping["library_strategy"], metadata),
        LibraryStrategy.OTHER,
    )

    try:
        manifest = RawReadsManifest(
            study=study_accession,
            sample=sample_accession,
            name=alias,
            description=get_description(config, metadata),
            platform=platform,
            instrument=instrument,
            library_source=library_source,
            library_selection=library_selection,
            library_strategy=library_strategy,
            insert_size=insert_size,
            fastq=fastq_files,
        )
    except Exception as e:
        # log traceback for better debugging
        logger.error(f"Error creating RawReadsManifest: {e}. Traceback: {traceback.format_exc()}")
        msg = f"Failed to create RawReadsManifest for accession {submission_row.accession}"
        raise RuntimeError(msg) from e

    return manifest


def sync_state_with_submission_table(db_engine: Engine):
    """
    1. Find all entries in submission_table in state SUBMITTED_SAMPLE and submit_raw_reads=True
    2. If (exists an entry in the raw_reads_table for (accession, version)):
    a.      If (in state SUBMITTED) update state in submission_table to SUBMITTED_ALL
    3. Else create corresponding entry in raw_reads_table in state READY
    """
    conditions = {"status_all": StatusAll.SUBMITTED_SAMPLE, "submit_raw_reads": True}
    ready_to_submit = find_conditions_in_db(db_engine, SubmissionTableEntry, conditions=conditions)
    logger.debug(
        f"Found {len(ready_to_submit)} entries in submission_table in status SUBMITTED_SAMPLE "
        f"and submit_raw_reads=True"
    )
    for row in ready_to_submit:
        seq_key = asdict(row.pkey)

        # 1. check if there exists an entry in the raw_reads_table for seq_key
        corresponding_raw_reads = find_conditions_in_db(
            db_engine, RawReadsTableEntry, conditions=seq_key
        )
        if (
            len(corresponding_raw_reads) == 1
            and corresponding_raw_reads[0].status == Status.SUBMITTED
        ):
            update_db_where_conditions(
                db_engine,
                model_class=SubmissionTableEntry,
                conditions=seq_key,
                update_values={"status_all": StatusAll.SUBMITTED_RAW_READS},
            )
        if len(corresponding_raw_reads) == 1:
            logger.debug(
                f"Entry for {seq_key} already exists in raw_reads_table with status "
                f"{corresponding_raw_reads[0].status}, not updating submission_table status."
            )
            continue
        add_to_raw_reads_table(db_engine, RawReadsTableEntry(**seq_key))


def update_raw_reads_error(
    db_engine: Engine,
    error: list[str],
    seq_key: dict[str, Any],
    update_type: Literal["revision"] | Literal["creation"],
) -> None:
    logger.error(
        f"Raw reads {update_type} failed for accession {seq_key['accession']} "
        f"version {seq_key['version']}. Propagating to db. Error: {error}"
    )
    update_with_retry(
        db_engine=db_engine,
        conditions={"accession": seq_key["accession"], "version": seq_key["version"]},
        update_values={
            "status": Status.HAS_ERRORS,
            "errors": error,
            "started_at": datetime.now(tz=pytz.utc),
        },
        model_class=RawReadsTableEntry,
    )


def manifest_fields_changed(
    config: Config,
    db_engine: Engine,
    submission_row: SubmissionTableEntry,
    last_version_entry: SubmissionTableEntry,
) -> bool:
    differing_fields = manifest_fields_diff(
        config.raw_reads_manifest_fields_mapping, submission_row, last_version_entry
    )
    if differing_fields:
        error = (
            "Raw reads cannot be revised because metadata fields in manifest would change from "
            f"last version: {json.dumps(differing_fields)}"
        )
        logger.error(error)
        update_raw_reads_error(
            db_engine,
            [error],
            seq_key=asdict(submission_row.pkey),
            update_type="revision",
        )
        return True
    return False


def can_revise_raw_reads(
    config: Config, db_engine: Engine, submission_row: SubmissionTableEntry
) -> bool:
    last_entry = get_last_entry(db_engine, submission_row.pkey)
    if not is_latest_revision(db_engine, submission_row.pkey):
        return False

    previous_sample_accession, previous_study_accession = get_project_and_sample_results(
        db_engine, last_entry
    )
    linked_accession_mismatches = linked_accession_diff(
        submission_row, previous_sample_accession, previous_study_accession
    )
    if linked_accession_mismatches:
        error = (
            "Raw reads cannot be revised because linked accessions in new version differ from "
            f"last version: {json.dumps(linked_accession_mismatches)}"
        )
        logger.error(error)
        update_raw_reads_error(
            db_engine, [error], seq_key=asdict(submission_row.pkey), update_type="revision"
        )
        return False
    # TODO: Automate automatic revisions of raw reads metadata fields
    # if config.allow_revision_with_manifest_changes:
    #     logger.debug(
    #         "allow_revision_with_manifest_changes=True, skipping manifest field comparison"
    #     )
    #     return True

    if manifest_fields_changed(
        config, db_engine, submission_row, last_entry
    ) and not has_raw_reads_changed(config, db_engine, submission_row):
        logger.debug(
            f"Only manifest fields have changed for {submission_row.accession}, "
            f"from {last_entry.version} to {submission_row.version} - should be revised manually"
        )
        return False
    return True


def has_raw_reads_changed(
    config: Config, db_engine: Engine, submission_row: SubmissionTableEntry
) -> bool:
    last_entry = get_last_entry(db_engine, submission_row.pkey)
    if submission_row.seq_metadata.get(
        config.raw_reads_metadata_field
    ) != last_entry.seq_metadata.get(config.raw_reads_metadata_field):
        logger.debug(
            f"Raw read file URLs have changed for {submission_row.accession}, "
            f"from {last_entry.version} to {submission_row.version} - should be revised"
            "(Metadata maybe also changed.)"
        )
        return True
    return False


def update_raw_reads_results_with_latest_version(db_engine: Engine, seq_key: AccessionVersion):
    version_to_revise = previous_version(db_engine, seq_key)
    last_version_rows = find_conditions_in_db(
        db_engine,
        RawReadsTableEntry,
        conditions={
            "accession": seq_key.accession,
            "version": version_to_revise,
        },
    )
    if len(last_version_rows) == 0:
        error_msg = f"Last version {version_to_revise} not found in raw_reads_table"
        raise RuntimeError(error_msg)
    logger.info(
        f"Updating raw reads results for accession {seq_key.accession} version "
        f"{seq_key.version} using results from version {version_to_revise} as there was no"
        "change in raw read data."
    )
    update_with_retry(
        db_engine=db_engine,
        conditions=asdict(seq_key),
        update_values={
            "status": Status.SUBMITTED,
            "result": last_version_rows[0].result,
        },
        model_class=RawReadsTableEntry,
        reraise=False,
    )


def raw_reads_table_create(db_engine: Engine, config: Config, slack_config: SlackConfig):  # noqa: PLR0912, PLR0915
    """
    1. Find all entries in raw_reads_table in state READY
    2. Create temporary files: download fastq files, manifest_file
    3. Update raw_reads_table to state SUBMITTING (only proceed if update succeeds)
    4. If (create_ena_assembly succeeds): update state to SUBMITTED with results
    5. Else update state to HAS_ERRORS with error messages
    6. Notify slack channel if there are old RUN accessions to suppress

    If config.test=True: use the test ENA webin-cli endpoint for submission.
    """
    conditions = {"status": Status.READY}
    ready_to_submit_raw_reads = find_conditions_in_db(
        db_engine, RawReadsTableEntry, conditions=conditions
    )
    if len(ready_to_submit_raw_reads) > 0:
        logger.debug(
            f"Found {len(ready_to_submit_raw_reads)} entries in raw_reads_table in status READY"
        )
    run_accessions_to_suppress = set()
    for row in ready_to_submit_raw_reads:
        seq_key = row.pkey
        submission_rows = find_conditions_in_db(
            db_engine, SubmissionTableEntry, conditions=asdict(seq_key)
        )
        if len(submission_rows) == 0:
            error_msg = f"Entry {row.accession} not found in submitting_table"
            raise RuntimeError(error_msg)
        submission_row = submission_rows[0]
        center_name = submission_row.center_name

        sample_accession, study_accession = get_project_and_sample_results(
            db_engine, submission_row
        )

        revision = is_revision(db_engine, seq_key)
        if revision:
            logger.debug(f"Entry {row.accession} is a revision, checking if it can be revised")
            if not can_revise_raw_reads(config, db_engine, submission_row):
                continue
            if not has_raw_reads_changed(config, db_engine, submission_row):
                update_raw_reads_results_with_latest_version(db_engine, seq_key)
                continue
            last_entry = get_last_entry(db_engine, submission_row.pkey)
            old_run_accession = last_entry.seq_metadata.get(config.raw_reads_metadata_field)

        try:
            manifest_object = create_manifest_object(
                config,
                sample_accession,
                study_accession,
                submission_row,
                random_alias=config.random_alias,
            )
            manifest_file = create_manifest(manifest_object, is_broker=config.is_broker)
        except Exception as e:
            logger.error(
                f"Raw reads manifest creation failed for accession {row.accession} with error {e}"
            )
            continue

        update_values: dict[str, Any] = {"status": Status.SUBMITTING}
        number_rows_updated = update_db_where_conditions(
            db_engine,
            model_class=RawReadsTableEntry,
            conditions=asdict(seq_key),
            update_values=update_values,
        )
        if number_rows_updated != 1:
            # state not correctly updated - do not start submission
            logger.warning(
                "raw_reads_table: Status update from READY to SUBMITTING failed - "
                "not starting submission."
            )
            continue
        logger.info(f"Starting raw reads creation for accession {row.accession}")

        # Actual webin-cli command is run here
        raw_reads_creation_results: CreationResult = create_ena_raw_reads(
            config=config,
            manifest_filename=manifest_file,
            center_name=center_name,
        )
        if raw_reads_creation_results.result:
            update_values = {
                "status": Status.SUBMITTED,
                "result": raw_reads_creation_results.result,
            }
            logger.info(
                f"Raw reads creation succeeded for {seq_key.accession} version {seq_key.version}"
            )
            update_with_retry(
                db_engine=db_engine,
                conditions=asdict(seq_key),
                update_values=update_values,
                model_class=RawReadsTableEntry,
            )
            run_accessions_to_suppress.add(old_run_accession) if revision else None
            for file in manifest_object.fastq:
                try:
                    logger.info(f"Cleaning up temporary file {file} after successful submission")
                    os.remove(file)
                except Exception as e:
                    logger.warning(f"Failed to remove temporary file {file}: {e}")
        else:
            update_raw_reads_error(
                db_engine,
                raw_reads_creation_results.errors,
                seq_key=asdict(row.pkey),
                update_type="creation",
            )
    if run_accessions_to_suppress:
        notify_msg = (
            f"Raw reads creation succeeded for {len(run_accessions_to_suppress)} revisions, "
            "required suppression of old run accessions in ENA - send an email. "
            f"Run accessions to suppress: {', '.join(run_accessions_to_suppress)}"
        )
        notify(slack_config, notify_msg)


def raw_reads_table_handle_errors(
    db_engine: Engine,
    config: Config,
    slack_config: SlackConfig,
    last_retry_time: datetime | None,
) -> datetime | None:
    """
    1. Find all entries in raw_reads_table in state HAS_ERRORS or SUBMITTING
        over submitting_time_threshold_min
    2. If time since last slack notification is over slack_retry_threshold_min send notification
    3. Trigger retry if time since last retry is over retry_threshold_min
    """
    entries_with_errors = find_errors_or_stuck_in_db(
        db_engine,
        RawReadsTableEntry,
        time_threshold=config.submitting_time_threshold_min,
    )

    messages = []

    if entries_with_errors:
        msg = (
            f"{config.backend_url}: ENA Submission pipeline found "
            f"{len(entries_with_errors)} entries in raw_reads_table in status"
            f" HAS_ERRORS or SUBMITTING for over {config.submitting_time_threshold_min}m"
        )
        messages.append(msg)

        last_retry_time = retry_failed_submissions_for_matching_errors(
            entries_with_errors,
            db_engine,
            model_class=RawReadsTableEntry,
            config=config,
            last_retry=last_retry_time,
        )
        # TODO: Query ENA to check if raw reads have in fact been created
        # If created update raw_reads_table
        # If not retry 3 times, then raise for manual intervention

    if messages:
        now = datetime.now(tz=pytz.utc)
        logger.info("\n".join(messages))
        send_slack_notification(
            "\n".join(messages),
            slack_config,
            time=now,
            slack_retry_threshold_min=config.slack_retry_threshold_min,
        )

    return last_retry_time


def create_raw_reads(config: Config, stop_event: threading.Event):
    db_engine = db_init(config.db_password, config.db_username, config.db_url)
    slack_config = slack_conn_init(
        slack_hook_default=config.slack_hook,
        slack_token_default=config.slack_token,
        slack_channel_id_default=config.slack_channel_id,
    )
    last_retry_time: datetime | None = None

    while True:
        if stop_event.is_set():
            logger.warning("create_raw_reads stopped due to exception in another task")
            return
        logger.debug("Checking for raw reads to create")
        sync_state_with_submission_table(db_engine)

        raw_reads_table_create(db_engine, config, slack_config)
        last_retry_time = raw_reads_table_handle_errors(
            db_engine, config, slack_config, last_retry_time
        )
        sync_state_with_submission_table(db_engine)
        if stop_event.wait(timeout=config.time_between_iterations):
            logger.info("create_raw_reads stopped due to exception in another task")
            return
