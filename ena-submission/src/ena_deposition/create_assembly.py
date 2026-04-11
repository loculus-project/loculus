import json
import logging
import random
import string
import threading
import time
import traceback
from dataclasses import asdict
from datetime import datetime, timedelta
from typing import Any, Literal, cast

import pytz
from sqlalchemy import Engine

from ena_deposition import call_loculus

from .config import Config, EnaOrganismDetails
from .ena_submission_helper import (
    CreationResult,
    accession_exists,
    create_chromosome_list,
    create_ena_assembly,
    create_flatfile,
    create_manifest,
    get_authors,
    get_description,
    get_ena_analysis_process,
    retry_failed_submissions_for_matching_errors,
    set_accession_does_not_exist_error,
)
from .ena_types import (
    DEFAULT_EMBL_PROPERTY_FIELDS,
    AssemblyChromosomeListFile,
    AssemblyChromosomeListFileObject,
    AssemblyManifest,
    ChromosomeType,
)
from .notifications import SlackConfig, send_slack_notification, slack_conn_init
from .submission_db_helper import (
    AccessionVersion,
    AssemblyTableEntry,
    ProjectTableEntry,
    SampleTableEntry,
    Status,
    StatusAll,
    SubmissionTableEntry,
    add_to_assembly_table,
    db_init,
    find_conditions_in_db,
    find_errors_or_stuck_in_db,
    find_waiting_in_db,
    is_revision,
    last_version,
    update_db_where_conditions,
    update_with_retry,
)

logger = logging.getLogger(__name__)


def create_chromosome_list_object(
    unaligned_sequences: dict[str, str | None],
    accession: str,
    organism_metadata: EnaOrganismDetails,
) -> AssemblyChromosomeListFile:
    # Use https://www.ebi.ac.uk/ena/browser/view/GCA_900094155.1?show=chromosomes as a template
    # Use https://www.ebi.ac.uk/ena/browser/view/GCA_000854165.1?show=chromosomes for multi-segment

    entries: list[AssemblyChromosomeListFileObject] = []

    multi_segment = organism_metadata.is_multi_segment()

    segment_order = get_segment_order(unaligned_sequences)

    for segment_name in segment_order:
        topology = organism_metadata.topology
        if multi_segment:
            entry = AssemblyChromosomeListFileObject(
                object_name=f"{accession}_{segment_name}",
                chromosome_name=segment_name,
                chromosome_type=ChromosomeType.SEGMENTED,
                topology=topology,
            )
            entries.append(entry)
            continue
        entry = AssemblyChromosomeListFileObject(
            object_name=f"{accession}",
            chromosome_name="genome",
            chromosome_type=ChromosomeType.MONOPARTITE,
            topology=topology,
        )
        entries.append(entry)

    return AssemblyChromosomeListFile(chromosomes=entries)


def get_segment_order(unaligned_sequences: dict[str, str | None]) -> list[str]:
    """Order in which we put the segments in the chromosome list file"""
    segment_order = []
    for segment_name, item in unaligned_sequences.items():
        if item:  # Only list sequenced segments
            segment_order.append(segment_name)
    return sorted(segment_order)


def get_address(config: Config, submission_row: SubmissionTableEntry) -> str | None:
    if not config.is_broker:
        return None
    try:
        group_details = call_loculus.get_group_info(config, submission_row.seq_metadata["groupId"])
    except Exception as e:
        logger.error(
            f"Failed to fetch group info for groupId={submission_row.seq_metadata['groupId']}\n"
            f"{traceback.format_exc()}"
        )
        msg = (
            "Failed to fetch group info from Loculus for group: "
            f"{submission_row.seq_metadata['groupId']}, {e}"
        )
        raise RuntimeError(msg) from e
    address = group_details.address
    address_list = [
        submission_row.center_name,  # corresponds to Loculus' "Institution" group field
        address.city,
        address.state,
        address.country,
    ]
    address_string = ", ".join([x for x in address_list if x])
    logger.debug("Created address from group_info")
    return address_string


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


def make_assembly_name(accession: str, version: str) -> str:
    """
    Create a unique assembly name based on accession, version and timestamp.
    Add a timestamp to the alias suffix.

    Unlike biosample revisions, assembly revisions require a new assemblyName.
    """
    entropy = "".join(random.choices(string.ascii_letters + string.digits, k=4))  # noqa: S311
    timestamp = datetime.now(tz=pytz.utc).strftime("%Y%m%d_%H%M%S")
    return f"{accession}.{version}_{timestamp}_{entropy}"


def create_manifest_object(
    config: Config,
    sample_accession: str,
    study_accession: str,
    submission_row: SubmissionTableEntry,
    dir: str | None = None,
) -> AssemblyManifest:
    """
    Create an AssemblyManifest object for an entry in the assembly table using:
    - the corresponding ena_sample_accession and bioproject_accession
    - the organism metadata from the config file
    - sequencing metadata from the corresponding submission table entry
    - unaligned nucleotide sequences from the corresponding submission table entry,
    these are used to create chromosome files and emblflat files which are passed to the manifest.

    If test=True add a timestamp to the alias suffix to allow for multiple submissions of the same
    manifest for testing.
    """
    metadata = submission_row.seq_metadata

    assembly_name = make_assembly_name(
        submission_row.accession,
        str(submission_row.version),
    )

    unaligned_nucleotide_sequences = submission_row.unaligned_nucleotide_sequences
    ena_organism = config.enaOrganisms[submission_row.organism]
    chromosome_list_object = create_chromosome_list_object(
        unaligned_nucleotide_sequences, submission_row.accession, ena_organism
    )
    chromosome_list_file = create_chromosome_list(list_object=chromosome_list_object, dir=dir)
    logger.debug("Created chromosome list file")

    flat_file = create_flatfile(config, metadata, ena_organism, unaligned_nucleotide_sequences, dir)

    assembly_values = get_assembly_values_in_metadata(config, metadata)

    try:
        manifest = AssemblyManifest(
            study=study_accession,
            sample=sample_accession,
            assemblyname=assembly_name,
            flatfile=flat_file,
            chromosome_list=chromosome_list_file,
            description=get_description(config, metadata),
            moleculetype=ena_organism.molecule_type,
            **assembly_values,  # type: ignore
            address=get_address(config, submission_row),
        )
    except Exception as e:
        # log traceback for better debugging
        logger.error(f"Error creating AssemblyManifest: {e}. Traceback: {traceback.format_exc()}")
        msg = f"Failed to create AssemblyManifest for accession {submission_row.accession}"
        raise RuntimeError(msg) from e

    return manifest


def submission_table_start(db_config: Engine, config: Config) -> None:
    """
    1. Find all entries in submission_table in state SUBMITTED_SAMPLE
    2. If entry has insdcRawReadsAccession, check it exists in ENA, if not set error and continue
    3. If (exists an entry in the assembly_table for (accession, version)):
    a.      If (in state SUBMITTED) update state in submission_table to SUBMITTED_ALL
    b.      Else update state to SUBMITTING_ASSEMBLY
    4. Else create corresponding entry in assembly_table
    """
    conditions = {"status_all": str(StatusAll.SUBMITTED_SAMPLE)}
    ready_to_submit = find_conditions_in_db(db_config, SubmissionTableEntry, conditions=conditions)
    if len(ready_to_submit) > 0:
        logger.debug(
            f"Found {len(ready_to_submit)} entries in submission_table in status SUBMITTED_SAMPLE"
        )
    for row in ready_to_submit:
        seq_key = {"accession": row.accession, "version": row.version}

        run_ref = row.seq_metadata.get("insdcRawReadsAccession")
        if run_ref and not accession_exists(run_ref, config):
            set_accession_does_not_exist_error(
                conditions=seq_key,
                accession=run_ref,
                accession_type="RUN_REF",
                db_pool=db_config,
            )
            continue

        # 1. check if there exists an entry in the assembly_table for seq_key
        corresponding_assembly = find_conditions_in_db(
            db_config, AssemblyTableEntry, conditions=seq_key
        )
        status_all = None
        if len(corresponding_assembly) == 1:
            if corresponding_assembly[0].status == str(Status.SUBMITTED):
                status_all = StatusAll.SUBMITTED_ALL
            else:
                status_all = StatusAll.SUBMITTING_ASSEMBLY
        else:
            # If not: create assembly_entry, change status to SUBMITTING_ASSEMBLY
            if not add_to_assembly_table(db_config, AssemblyTableEntry(**seq_key)):
                continue
            status_all = StatusAll.SUBMITTING_ASSEMBLY
        update_db_where_conditions(
            db_config,
            model_class=SubmissionTableEntry,
            conditions=seq_key,
            update_values={"status_all": status_all},
        )


def submission_table_update(db_config: Engine) -> None:
    """
    1. Find all entries in submission_table in state SUBMITTING_ASSEMBLY
    2. If (exists an entry in the assembly_table for (accession, version)):
    a.      If (in state SUBMITTED) update state in submission_table to SUBMITTED_ALL
    3. Else throw Error
    """
    conditions = {"status_all": str(StatusAll.SUBMITTING_ASSEMBLY)}
    submitting_assembly = find_conditions_in_db(
        db_config, SubmissionTableEntry, conditions=conditions
    )
    if len(submitting_assembly) > 0:
        logger.debug(
            f"Found {len(submitting_assembly)} entries in submission_table "
            f"in status SUBMITTING_ASSEMBLY"
        )
    for row in submitting_assembly:
        seq_key = {"accession": row.accession, "version": row.version}

        corresponding_assembly = find_conditions_in_db(
            db_config, AssemblyTableEntry, conditions=seq_key
        )
        if len(corresponding_assembly) == 1 and corresponding_assembly[0].status == str(
            Status.SUBMITTED
        ):
            update_values = {"status_all": StatusAll.SUBMITTED_ALL}
            update_db_where_conditions(
                db_config,
                model_class=SubmissionTableEntry,
                conditions=seq_key,
                update_values=update_values,
            )
        if len(corresponding_assembly) == 0:
            error_msg = (
                "Entry in submission_table in status SUBMITTING_ASSEMBLY",
                " with no corresponding assembly",
            )
            raise RuntimeError(error_msg)


def update_assembly_error(
    db_config: Engine,
    error: list[str],
    seq_key: dict[str, Any],
    update_type: Literal["revision"] | Literal["creation"],
) -> None:
    logger.error(
        f"Assembly {update_type} failed for accession {seq_key['accession']} "
        f"version {seq_key['version']}. Propagating to db. Error: {error}"
    )
    update_with_retry(
        db_config=db_config,
        conditions={"accession": seq_key["accession"], "version": seq_key["version"]},
        update_values={
            "status": Status.HAS_ERRORS,
            "errors": error,
            "started_at": datetime.now(tz=pytz.utc),
        },
        model_class=AssemblyTableEntry,
    )


def can_be_revised(config: Config, db_config: Engine, submission_row: SubmissionTableEntry) -> bool:
    """
    Check if assembly can be revised
    1. Last version exists in submission_table, otherwise throw RuntimeError
    2. If biosampleAccession and bioprojectAccession provided by submitter (e.g. raw reads linked)
       those must be same as in previous version, otherwise cannot be revised
    3. metadata fields in manifest haven't changed since previous version, otherwise
       requires manual revision
    """
    seq_key = AccessionVersion(accession=submission_row.accession, version=submission_row.version)
    if not is_revision(db_config, seq_key):
        return False
    version_to_revise = last_version(db_config, seq_key)
    last_version_rows = find_conditions_in_db(
        db_config,
        SubmissionTableEntry,
        conditions={"accession": submission_row.accession, "version": version_to_revise},
    )
    if len(last_version_rows) == 0:
        error_msg = f"Last version {version_to_revise} not found in submission_table"
        raise RuntimeError(error_msg)

    last_version_entry = last_version_rows[0]

    previous_sample_accession, previous_study_accession = get_project_and_sample_results(
        db_config, last_version_entry
    )
    logger.debug(
        f"Previous sample accession: {previous_sample_accession}, "
        f"previous study accession: {previous_study_accession}"
    )
    if submission_row.seq_metadata.get("biosampleAccession"):
        new_sample_accession = submission_row.seq_metadata["biosampleAccession"]
        if previous_sample_accession != new_sample_accession:
            error = (
                "Assembly cannot be revised because biosampleAccession in new version: "
                f"{new_sample_accession} differs from last version: {previous_sample_accession}"
            )
            logger.error(error)
            update_assembly_error(
                db_config,
                [error],
                seq_key={"accession": submission_row.accession, "version": submission_row.version},
                update_type="revision",
            )
            return False
    if submission_row.seq_metadata.get("bioprojectAccession"):
        new_project_accession = submission_row.seq_metadata["bioprojectAccession"]
        if new_project_accession != previous_study_accession:
            error = (
                "Assembly cannot be revised because bioprojectAccession in new version: "
                f"{new_project_accession} differs from last version: {previous_study_accession}"
            )
            logger.error(error)
            update_assembly_error(
                db_config,
                [error],
                seq_key={"accession": submission_row.accession, "version": submission_row.version},
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
            "Assembly cannot be revised because metadata fields in manifest would change from "
            f"last version: {json.dumps(differing_fields)}"
        )
        logger.error(error)
        update_assembly_error(
            db_config,
            [error],
            seq_key={"accession": submission_row.accession, "version": submission_row.version},
            update_type="revision",
        )
        return False
    return True


def is_flatfile_data_changed(db_config: Engine, submission_row: SubmissionTableEntry) -> bool:
    """
    Check if change in sequence or flatfile metadata has occurred since last version.
    """
    seq_key = AccessionVersion(accession=submission_row.accession, version=submission_row.version)
    version_to_revise = last_version(db_config, seq_key)
    last_version_rows = find_conditions_in_db(
        db_config,
        SubmissionTableEntry,
        conditions={"accession": seq_key.accession, "version": version_to_revise},
    )
    if len(last_version_rows) == 0:
        error_msg = f"Last version {version_to_revise} not found in submission_table"
        raise RuntimeError(error_msg)

    last_entry = last_version_rows[0]

    if submission_row.unaligned_nucleotide_sequences != last_entry.unaligned_nucleotide_sequences:
        logger.debug(
            f"Unaligned nucleotide sequences have changed for {seq_key.accession}, "
            f"from {version_to_revise} to {seq_key.version} - should be revised"
            "(Metadata maybe also changed.)"
        )
        return True

    fields = [
        DEFAULT_EMBL_PROPERTY_FIELDS.country_property,
        DEFAULT_EMBL_PROPERTY_FIELDS.collection_date_property,
        DEFAULT_EMBL_PROPERTY_FIELDS.authors_property,
        *DEFAULT_EMBL_PROPERTY_FIELDS.admin_level_properties,
    ]
    for field in fields:
        last_val = last_entry.seq_metadata.get(field)
        new_val = submission_row.seq_metadata.get(field)
        if last_val != new_val:
            logger.debug(
                f"Field {field} has changed from {last_val} to {new_val} "
                f"for {submission_row.accession}. (Maybe other fields changed as well)"
            )
            return True
    logger.debug(
        f"No changes detected for {submission_row.accession} from version {version_to_revise} "
        f"to {submission_row.version}"
    )
    return False


def update_assembly_results_with_latest_version(db_config: Engine, seq_key: AccessionVersion):
    version_to_revise = last_version(db_config, seq_key)
    last_version_rows = find_conditions_in_db(
        db_config,
        AssemblyTableEntry,
        conditions={
            "accession": seq_key.accession,
            "version": version_to_revise,
        },
    )
    if len(last_version_rows) == 0:
        error_msg = f"Last version {version_to_revise} not found in assembly_table"
        raise RuntimeError(error_msg)
    logger.info(
        f"Updating assembly results for accession {seq_key.accession} version "
        f"{seq_key.version} using results from version {version_to_revise} as there was no"
        "change in flatfile data."
    )
    update_with_retry(
        db_config=db_config,
        conditions=asdict(seq_key),
        update_values={
            "status": Status.SUBMITTED,
            "result": last_version_rows[0].result,
        },
        model_class=AssemblyTableEntry,
        reraise=False,
    )


def get_project_and_sample_results(
    db_config: Engine, submission_row: SubmissionTableEntry
) -> tuple[str, str]:
    seq_key = {"accession": submission_row.accession, "version": submission_row.version}

    sample_rows = find_conditions_in_db(db_config, SampleTableEntry, conditions=seq_key)
    if len(sample_rows) == 0:
        error_msg = f"Entry {submission_row.accession} not found in sample_table"
        raise RuntimeError(error_msg)

    project_rows = find_conditions_in_db(
        db_config,
        ProjectTableEntry,
        conditions={"project_id": submission_row.project_id},
    )
    if len(project_rows) == 0:
        error_msg = f"Entry {submission_row.accession} not found in project_table"
        raise RuntimeError(error_msg)
    sample_accession = (
        sample_rows[0].result.get("ena_sample_accession") if sample_rows[0].result else None
    )
    study_accession = (
        project_rows[0].result.get("bioproject_accession") if project_rows[0].result else None
    )
    if not sample_accession or not study_accession:
        error_msg = (
            f"Missing sample_accession or study_accession for accession {submission_row.accession} "
            "cannot create manifest"
        )
        raise RuntimeError(error_msg)
    return cast(str, sample_accession), cast(str, study_accession)


def assembly_table_create(db_config: Engine, config: Config):
    """
    1. Find all entries in assembly_table in state READY
    2. Create temporary files: chromosome_list_file, embl_file, manifest_file
    3. Update assembly_table to state SUBMITTING (only proceed if update succeeds)
    4. If (create_ena_assembly succeeds): update state to SUBMITTED with results
    3. Else update state to HAS_ERRORS with error messages

    If config.test=True: use the test ENA webin-cli endpoint for submission.
    """
    conditions = {"status": str(Status.READY)}
    ready_to_submit_assembly = find_conditions_in_db(
        db_config, AssemblyTableEntry, conditions=conditions
    )
    if len(ready_to_submit_assembly) > 0:
        logger.debug(
            f"Found {len(ready_to_submit_assembly)} entries in assembly_table in status READY"
        )
    for row in ready_to_submit_assembly:
        seq_key = AccessionVersion(accession=row.accession, version=row.version)
        submission_rows = find_conditions_in_db(
            db_config, SubmissionTableEntry, conditions=asdict(seq_key)
        )
        if len(submission_rows) == 0:
            error_msg = f"Entry {row.accession} not found in submitting_table"
            raise RuntimeError(error_msg)
        submission_row = submission_rows[0]
        center_name = submission_row.center_name

        sample_accession, study_accession = get_project_and_sample_results(
            db_config, submission_row
        )

        if is_revision(db_config, seq_key):
            logger.debug(f"Entry {row.accession} is a revision, checking if it can be revised")
            if not can_be_revised(config, db_config, submission_row):
                continue
            if not is_flatfile_data_changed(db_config, submission_row):
                update_assembly_results_with_latest_version(db_config, seq_key)
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
            db_config,
            model_class=AssemblyTableEntry,
            conditions=asdict(seq_key),
            update_values=update_values,
        )
        if number_rows_updated != 1:
            # state not correctly updated - do not start submission
            logger.warning(
                "assembly_table: Status update from READY to SUBMITTING failed - "
                "not starting submission."
            )
            continue
        logger.info(f"Starting assembly creation for accession {row.accession}")
        segment_order = get_segment_order(submission_row.unaligned_nucleotide_sequences)

        # Actual webin-cli command is run here
        assembly_creation_results: CreationResult = create_ena_assembly(
            config=config,
            manifest_filename=manifest_file,
            center_name=center_name,
        )
        if assembly_creation_results.result:
            assembly_creation_results.result["segment_order"] = segment_order
            update_values = {
                "status": Status.WAITING,
                "result": assembly_creation_results.result,
            }
            logger.info(
                f"Assembly creation succeeded for {seq_key.accession} version {seq_key.version}"
            )
            update_with_retry(
                db_config=db_config,
                conditions=asdict(seq_key),
                update_values=update_values,
                model_class=AssemblyTableEntry,
            )
        else:
            update_assembly_error(
                db_config,
                assembly_creation_results.errors,
                seq_key={"accession": row.accession, "version": row.version},
                update_type="creation",
            )


_last_ena_check: datetime | None = None


def assembly_table_update(db_config: Engine, config: Config, time_threshold: int = 5):
    """
    - time_threshold (minutes)
    1. Find all entries in assembly_table in state WAITING
    2. If over time_threshold since last check, check if accession exists in ENA
    3. If (exists): update state to SUBMITTED with results
    """
    global _last_ena_check  # noqa: PLW0603
    conditions = {"status": str(Status.WAITING)}
    waiting = find_conditions_in_db(db_config, AssemblyTableEntry, conditions=conditions)
    if len(waiting) > 0:
        logger.debug(f"Found {len(waiting)} entries in assembly_table in status WAITING")
    # Check if ENA has assigned an accession, don't do this too frequently
    now = datetime.now(tz=pytz.utc)
    if not _last_ena_check or now - timedelta(minutes=time_threshold) > _last_ena_check:
        logger.debug("Checking state in ENA")
        for row in waiting:
            seq_key = {"accession": row.accession, "version": row.version}
            submission_rows = find_conditions_in_db(
                db_config, SubmissionTableEntry, conditions=seq_key
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
                    f"Missing erz_accession or segment_order for {seq_key['accession']} version "
                    f"{seq_key['version']} - cannot check ENA for accession yet."
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
                    f"Assembly partially accessioned by ENA for {seq_key['accession']} "
                    f"version {seq_key['version']}"
                )
            else:
                status = Status.SUBMITTED
                logger.info(
                    f"Assembly accessioned by ENA for {seq_key['accession']} version "
                    f"{seq_key['version']}"
                )
            update_with_retry(
                db_config=db_config,
                conditions=seq_key,
                update_values={
                    "status": status,
                    "result": new_result.result,
                    "finished_at": datetime.now(tz=pytz.utc),
                },
                model_class=AssemblyTableEntry,
                reraise=False,
            )


def assembly_table_handle_errors(
    db_config: Engine,
    config: Config,
    slack_config: SlackConfig,
    last_retry_time: datetime | None,
) -> datetime | None:
    """
    1. Find all entries in assembly_table in state HAS_ERRORS or SUBMITTING
        over submitting_time_threshold_min
    2. If time since last slack notification is over slack_retry_threshold_min send notification
    3. Trigger retry if time since last retry is over retry_threshold_min
    """
    entries_waiting = find_waiting_in_db(db_config, time_threshold=config.waiting_threshold_hours)
    entries_with_errors = find_errors_or_stuck_in_db(
        db_config,
        AssemblyTableEntry,
        time_threshold=config.submitting_time_threshold_min,
    )

    messages = []

    if entries_waiting:
        top3_accessions = [entry.accession for entry in entries_waiting[:3]]
        msg = (
            f"{config.backend_url}: ENA Submission pipeline found "
            f"{len(entries_waiting)} entries in assembly_table in "
            f"status WAITING for over {config.waiting_threshold_hours}h. "
            f"First accessions: {top3_accessions}"
        )
        messages.append(msg)

    if entries_with_errors:
        msg = (
            f"{config.backend_url}: ENA Submission pipeline found "
            f"{len(entries_with_errors)} entries in assembly_table in status"
            f" HAS_ERRORS or SUBMITTING for over {config.submitting_time_threshold_min}m"
        )
        messages.append(msg)

        last_retry_time = retry_failed_submissions_for_matching_errors(
            entries_with_errors,
            db_config,
            model_class=AssemblyTableEntry,
            retry_threshold_min=config.retry_threshold_min,
            last_retry=last_retry_time,
            error_substrings=(
                "Submit service authentication error. Invalid submission account user "
                "name or password. Please try enclosing your password in single quotes. "
                "The submission has failed because of a user error.",
                "does not exist in ENA",
            ),
        )
        # TODO: Query ENA to check if assembly has in fact been created
        # If created update assembly_table
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


def create_assembly(config: Config, stop_event: threading.Event):
    db_config = db_init(config.db_password, config.db_username, config.db_url)
    slack_config = slack_conn_init(
        slack_hook_default=config.slack_hook,
        slack_token_default=config.slack_token,
        slack_channel_id_default=config.slack_channel_id,
    )
    last_retry_time: datetime | None = None

    while True:
        if stop_event.is_set():
            logger.warning("create_assembly stopped due to exception in another task")
            return
        logger.debug("Checking for assemblies to create")
        submission_table_start(db_config, config)
        submission_table_update(db_config)

        assembly_table_create(db_config, config)
        assembly_table_update(db_config, config, time_threshold=config.min_between_ena_checks)
        last_retry_time = assembly_table_handle_errors(
            db_config, config, slack_config, last_retry_time
        )
        time.sleep(config.time_between_iterations)
