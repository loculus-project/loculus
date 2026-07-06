import json
import logging
import threading
import time
import traceback
from dataclasses import asdict
from datetime import datetime, timedelta
from typing import Any, Literal, cast

import pytz
from sqlalchemy import Engine

from ena_deposition import call_loculus

from .config import Config
from .ena_submission_helper import (
    CreationResult,
    create_ena_assembly,
    create_manifest,
    get_authors,
    get_description,
    get_ena_analysis_process,
    retry_failed_submissions_for_matching_errors,
)
from .ena_types import (
    RawReadsManifest,
)
from .notifications import SlackConfig, send_slack_notification, slack_conn_init
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
    find_waiting_in_db,
    get_project_and_sample_results,
    is_latest_revision,
    is_revision,
    previous_version,
    update_db_where_conditions,
    update_with_retry,
)

logger = logging.getLogger(__name__)


def get_assembly_values_in_metadata(config: Config, metadata: dict[str, str]) -> dict[str, str]:
    assembly_values = {}
    for key in config.manifest_fields_mapping:
        default = config.manifest_fields_mapping[key].default
        loculus_fields = config.manifest_fields_mapping[key].loculus_fields
        type = config.manifest_fields_mapping[key].type
        function = config.manifest_fields_mapping[key].function
        if type == "int":
            if len(loculus_fields) != 1:
                msg = (
                    "Only one loculus field allowed for int type but found: len(loculus_fields): "
                    f"{len(loculus_fields)} for key: {key}. Fields: {loculus_fields}."
                )
                raise ValueError(msg)
            try:
                value = str(int(metadata.get(loculus_fields[0])))  # type: ignore
            except TypeError:
                value = default  # type: ignore
        else:
            values = [
                metadata.get(loculus_field)
                for loculus_field in loculus_fields
                if metadata.get(loculus_field)
            ]
            value = default or None if not values else ", ".join(values)  # type: ignore
        if function == "reformat_authors":
            value = get_authors(str(value))
        if not config.is_broker and key == "authors":
            continue
        assembly_values[key] = value
    return assembly_values


def create_manifest_object(
    config: Config,
    sample_accession: str,
    study_accession: str,
    submission_row: SubmissionTableEntry,
    dir: str | None = None,
) -> RawReadsManifest:
    """
    Create an RawReadsManifest object for an entry in the raw reads table using:
    - the corresponding ena_sample_accession and bioproject_accession
    - the organism metadata from the config file
    - sequencing metadata from the corresponding submission table entry
    - unaligned nucleotide sequences from the corresponding submission table entry,
    these are used to create chromosome files and emblflat files which are passed to the manifest.

    If test=True add a timestamp to the alias suffix to allow for multiple submissions of the same
    manifest for testing.
    """
    metadata = submission_row.seq_metadata
    assembly_values = get_assembly_values_in_metadata(config, metadata)

    try:
        manifest = RawReadsManifest(
            study=study_accession,
            sample=sample_accession,
            description=get_description(config, metadata),
            **assembly_values,  # type: ignore
            address=call_loculus.get_address(
                config, submission_row.center_name, submission_row.seq_metadata["groupId"]
            ),
            fastq=submission_row.fastq_files,
        )
    except Exception as e:
        # log traceback for better debugging
        logger.error(f"Error creating RawReadsManifest: {e}. Traceback: {traceback.format_exc()}")
        msg = f"Failed to create RawReadsManifest for accession {submission_row.accession}"
        raise RuntimeError(msg) from e

    return manifest


def submission_table_start(db_engine: Engine) -> None:
    """
    1. Find all entries in submission_table in state SUBMITTED_SAMPLE and submit_raw_reads=True
    2. If (exists an entry in the raw_reads_table for (accession, version)):
    a.      If (in state SUBMITTED) update state in submission_table to SUBMITTED_ALL
    b.      Else update state to SUBMITTING_RAW_READS
    3. Else create corresponding entry in raw_reads_table
    """
    conditions = {"status_all": StatusAll.SUBMITTED_SAMPLE, "submit_raw_reads": True}
    ready_to_submit = find_conditions_in_db(db_engine, SubmissionTableEntry, conditions=conditions)
    logger.debug(
        f"Found {len(ready_to_submit)} entries in submission_table in status SUBMITTED_SAMPLE with submit_raw_reads=True"
    )
    for row in ready_to_submit:
        seq_key = asdict(row.pkey)

        # 1. check if there exists an entry in the raw_reads_table for seq_key
        corresponding_raw_reads = find_conditions_in_db(
            db_engine, RawReadsTableEntry, conditions=seq_key
        )
        status_all = None
        if len(corresponding_raw_reads) == 1:
            if corresponding_raw_reads[0].status == Status.SUBMITTED:
                status_all = StatusAll.SUBMITTED_ALL
            else:
                status_all = StatusAll.SUBMITTING_RAW_READS
        else:
            # If not: create raw_reads_entry, change status to SUBMITTING_RAW_READS
            if not add_to_raw_reads_table(db_engine, RawReadsTableEntry(**seq_key)):
                continue
            status_all = StatusAll.SUBMITTING_RAW_READS
        update_db_where_conditions(
            db_engine,
            model_class=SubmissionTableEntry,
            conditions=seq_key,
            update_values={"status_all": status_all},
        )


def submission_table_update(db_engine: Engine) -> None:
    """
    1. Find all entries in submission_table in state SUBMITTING_RAW_READS
    2. If (exists an entry in the raw_reads_table for (accession, version)):
    a.      If (in state SUBMITTED) update state in submission_table to SUBMITTED_ALL
    3. Else throw Error
    """
    conditions = {"status_all": StatusAll.SUBMITTING_RAW_READS}
    submitting_raw_reads = find_conditions_in_db(
        db_engine, SubmissionTableEntry, conditions=conditions
    )
    if len(submitting_raw_reads) > 0:
        logger.debug(
            f"Found {len(submitting_raw_reads)} entries in submission_table "
            f"in status SUBMITTING_RAW_READS"
        )
    for row in submitting_raw_reads:
        seq_key = asdict(row.pkey)

        corresponding_raw_reads = find_conditions_in_db(
            db_engine, RawReadsTableEntry, conditions=seq_key
        )
        if len(corresponding_raw_reads) == 1 and corresponding_raw_reads[0].status == str(
            Status.SUBMITTED
        ):
            update_values = {"status_all": StatusAll.SUBMITTED_ALL}
            update_db_where_conditions(
                db_engine,
                model_class=SubmissionTableEntry,
                conditions=seq_key,
                update_values=update_values,
            )
        if len(corresponding_raw_reads) == 0:
            error_msg = (
                "Entry in submission_table in status SUBMITTING_RAW_READS",
                " with no corresponding raw reads entry in raw_reads_table",
            )
            raise RuntimeError(error_msg)


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


def can_be_revised(config: Config, db_engine: Engine, submission_row: SubmissionTableEntry) -> bool:
    """
    Check if raw reads can be revised
    1. Last version exists in submission_table, otherwise throw RuntimeError
    2. If biosampleAccession and bioprojectAccession provided by submitter (e.g. raw reads linked)
       those must be same as in previous version, otherwise cannot be revised
    3. metadata fields in manifest haven't changed since previous version, otherwise
       requires manual revision
    """
    seq_key = submission_row.pkey
    if not is_latest_revision(db_engine, seq_key):
        return False
    version_to_revise = previous_version(db_engine, seq_key)
    last_version_rows = find_conditions_in_db(
        db_engine,
        SubmissionTableEntry,
        conditions={"accession": submission_row.accession, "version": version_to_revise},
    )
    if len(last_version_rows) == 0:
        error_msg = f"Last version {version_to_revise} not found in submission_table"
        raise RuntimeError(error_msg)

    last_version_entry = last_version_rows[0]

    previous_sample_accession, previous_study_accession = get_project_and_sample_results(
        db_engine, last_version_entry
    )
    logger.debug(
        f"Previous sample accession: {previous_sample_accession}, "
        f"previous study accession: {previous_study_accession}"
    )
    if submission_row.seq_metadata.get("biosampleAccession"):
        new_sample_accession = submission_row.seq_metadata["biosampleAccession"]
        if previous_sample_accession != new_sample_accession:
            error = (
                "Raw reads cannot be revised because biosampleAccession in new version: "
                f"{new_sample_accession} differs from last version: {previous_sample_accession}"
            )
            logger.error(error)
            update_raw_reads_error(
                db_engine,
                [error],
                seq_key=asdict(submission_row.pkey),
                update_type="revision",
            )
            return False
    if submission_row.seq_metadata.get("bioprojectAccession"):
        new_project_accession = submission_row.seq_metadata["bioprojectAccession"]
        if new_project_accession != previous_study_accession:
            error = (
                "Raw reads cannot be revised because bioprojectAccession in new version: "
                f"{new_project_accession} differs from last version: {previous_study_accession}"
            )
            logger.error(error)
            update_raw_reads_error(
                db_engine,
                [error],
                seq_key=asdict(submission_row.pkey),
                update_type="revision",
            )
            return False

    differing_fields = {}
    for mapping in config.manifest_fields_mapping.values():
        loculus_field_names = mapping.loculus_fields
        for loculus_field_name in loculus_field_names:
            last_entry = last_version_entry.seq_metadata.get(loculus_field_name)
            new_entry = submission_row.seq_metadata.get(loculus_field_name)
            if loculus_field_name == "authors":
                try:
                    last_entry = get_authors(last_entry) if last_entry else last_entry
                    new_entry = get_authors(new_entry) if new_entry else new_entry
                except Exception as e:
                    logger.error(
                        f"Error formatting authors field for comparison: {e}. "
                        f"Traceback: {traceback.format_exc()}"
                    )
                    differing_fields[loculus_field_name] = (
                        f"Last: {last_entry}, New: {new_entry}, Error reformatting: {e}"
                    )
                    continue
            if last_entry != new_entry:
                differing_fields[loculus_field_name] = f"Last: {last_entry}, New: {new_entry}, "
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
        return False
    return True


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
        "change in flatfile data."
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


def raw_reads_table_create(db_engine: Engine, config: Config):
    """
    1. Find all entries in raw_reads_table in state READY
    2. Create temporary files: chromosome_list_file, embl_file, manifest_file
    3. Update raw_reads_table to state SUBMITTING (only proceed if update succeeds)
    4. If (create_ena_assembly succeeds): update state to SUBMITTED with results
    3. Else update state to HAS_ERRORS with error messages

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

        if is_revision(db_engine, seq_key):
            logger.debug(f"Entry {row.accession} is a revision, checking if it can be revised")
            if not can_be_revised(config, db_engine, submission_row):
                continue

        try:
            manifest_object = create_manifest_object(
                config,
                sample_accession,
                study_accession,
                submission_row,
            )
            manifest_file = create_manifest(manifest_object, is_broker=config.is_broker)
        except Exception as e:
            logger.error(f"Manifest creation failed for accession {row.accession} with error {e}")
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
        raw_reads_creation_results: CreationResult = create_ena_assembly(
            config=config,
            manifest_filename=manifest_file,
            center_name=center_name,
        )
        if raw_reads_creation_results.result:
            update_values = {
                "status": Status.WAITING,
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
        else:
            update_raw_reads_error(
                db_engine,
                raw_reads_creation_results.errors,
                seq_key=asdict(row.pkey),
                update_type="creation",
            )


_last_ena_check: datetime | None = None


def raw_reads_table_update(db_engine: Engine, config: Config, time_threshold: int = 5):
    """
    - time_threshold (minutes)
    1. Find all entries in raw_reads_table in state WAITING
    2. If over time_threshold since last check, check if accession exists in ENA
    3. If (exists): update state to SUBMITTED with results
    """
    global _last_ena_check  # noqa: PLW0603
    conditions = {"status": Status.WAITING}
    waiting = find_conditions_in_db(db_engine, RawReadsTableEntry, conditions=conditions)
    if len(waiting) > 0:
        logger.debug(f"Found {len(waiting)} entries in raw_reads_table in status WAITING")
    # Check if ENA has assigned an accession, don't do this too frequently
    now = datetime.now(tz=pytz.utc)
    if not _last_ena_check or now - timedelta(minutes=time_threshold) > _last_ena_check:
        logger.debug("Checking state in ENA")
        for row in waiting:
            seq_key = row.pkey
            submission_rows = find_conditions_in_db(
                db_engine, SubmissionTableEntry, conditions=asdict(seq_key)
            )
            if len(submission_rows) == 0:
                error_msg = f"Entry {row.accession} not found in submitting_table"
                raise RuntimeError(error_msg)
            organism = config.enaOrganisms[submission_rows[0].organism]
            # Previous means from the last time the entry was checked, from db
            segment_order = row.result.get("segment_order") if row.result else None
            erz_accession = row.result.get("erz_accession") if row.result else None
            if not erz_accession or not segment_order:
                logger.warning(
                    f"Missing erz_accession or segment_order for {seq_key.accession} version "
                    f"{seq_key.version} - cannot check ENA for accession yet."
                )
                continue
            new_result: CreationResult = get_ena_analysis_process(
                config, cast(str, erz_accession), cast(list[str], segment_order), organism
            )
            _last_ena_check = now

            if not new_result.result:
                continue

            result_contains_gca_accession = "gca_accession" in new_result.result
            result_contains_insdc_accession = any(
                key.startswith("insdc_accession_full") for key in new_result.result
            )

            if not (result_contains_gca_accession and result_contains_insdc_accession):
                if row.result == new_result.result:
                    continue
                status = Status.WAITING
                logger.info(
                    f"Raw reads partially accessioned by ENA for {seq_key.accession} "
                    f"version {seq_key.version}"
                )
            else:
                status = Status.SUBMITTED
                logger.info(
                    f"Raw reads accessioned by ENA for {seq_key.accession} version {seq_key.version}"
                )
            update_with_retry(
                db_engine=db_engine,
                conditions=asdict(seq_key),
                update_values={
                    "status": status,
                    "result": new_result.result,
                    "finished_at": datetime.now(tz=pytz.utc),
                },
                model_class=RawReadsTableEntry,
                reraise=False,
            )


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
    entries_waiting = find_waiting_in_db(db_engine, time_threshold=config.waiting_threshold_hours)
    entries_with_errors = find_errors_or_stuck_in_db(
        db_engine,
        RawReadsTableEntry,
        time_threshold=config.submitting_time_threshold_min,
    )

    messages = []

    if entries_waiting:
        top3_accessions = [entry.accession for entry in entries_waiting[:3]]
        msg = (
            f"{config.backend_url}: ENA Submission pipeline found "
            f"{len(entries_waiting)} entries in raw_reads_table in "
            f"status WAITING for over {config.waiting_threshold_hours}h. "
            f"First accessions: {top3_accessions}"
        )
        messages.append(msg)

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
        submission_table_start(db_engine)
        submission_table_update(db_engine)

        raw_reads_table_create(db_engine, config)
        raw_reads_table_update(db_engine, config, time_threshold=config.min_between_ena_checks)
        last_retry_time = raw_reads_table_handle_errors(
            db_engine, config, slack_config, last_retry_time
        )
        if stop_event.wait(timeout=config.time_between_iterations):
            logger.info("create_raw_reads stopped due to exception in another task")
            return
