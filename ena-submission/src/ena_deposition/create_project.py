import logging
import threading
import time
from dataclasses import asdict
from datetime import datetime

import pytz
from sqlalchemy import Engine

from ena_deposition import call_loculus
from ena_deposition.loculus_models import Group

from .config import Config
from .ena_submission_helper import (
    CreationResult,
    accession_exists,
    create_ena_project,
    get_alias,
    retry_failed_submissions_for_matching_errors,
    set_accession_does_not_exist_error,
)
from .ena_types import (
    OrganismType,
    ProjectLink,
    ProjectLinks,
    ProjectSet,
    ProjectType,
    SubmissionProject,
    XmlAttribute,
    XrefType,
)
from .notifications import SlackConfig, send_slack_notification, slack_conn_init
from .submission_db_helper import (
    ProjectTableEntry,
    Status,
    StatusAll,
    SubmissionTableEntry,
    add_to_project_table,
    db_init,
    find_conditions_in_db,
    find_errors_or_stuck_in_db,
    update_db_where_conditions,
    update_with_retry,
)

logger = logging.getLogger(__name__)


def construct_project_set_object(
    group_info: Group,
    config: Config,
    entry: ProjectTableEntry,
    random_alias=False,
) -> ProjectSet:
    """
    Construct project set object, using:
    - entry in project_table
    - group_info of corresponding group_id
    - config information, such as enaDeposition metadata for that organism

    If random_alias=True add a timestamp to the alias suffix to allow for multiple
    submissions of the same project for testing.
    (ENA blocks multiple submissions with the same alias)
    """
    metadata_dict = config.enaOrganisms[entry.organism]
    alias = get_alias(
        f"{entry.group_id}:{entry.organism}:{config.unique_project_suffix}",
        random_alias,
        config.set_alias_suffix,
    )

    address = group_info.address
    group_name = group_info.group_name
    center_name = group_info.institution
    address_string = ", ".join([x for x in [address.city, address.country] if x])

    project_type = ProjectType(
        center_name=XmlAttribute(center_name),
        alias=alias,
        name=(f"{metadata_dict.scientific_name}: Genome sequencing by {group_name}, {center_name}"),
        title=(
            f"{metadata_dict.scientific_name}: Genome sequencing by "
            f"{group_name}, {center_name}, {address_string}"
        ),
        description=(
            f"Automated upload of {metadata_dict.scientific_name} sequences "
            f"submitted by {group_name}, {center_name}, {address_string} "
            f"to {config.db_name}"
        ),
        submission_project=SubmissionProject(
            organism=OrganismType(
                taxon_id=metadata_dict.taxon_id,
                scientific_name=metadata_dict.scientific_name,
            )
        ),
        project_links=ProjectLinks(
            project_link=[
                ProjectLink(xref_link=XrefType(db=config.db_name, id=str(entry.group_id)))
            ]
        ),
    )
    return ProjectSet(project=[project_type])


def update_with_existing_bioproject(
    db_engine: Engine,
    config: Config,
    row: ProjectTableEntry,
    center_name: str,
):
    """Set bioprojectAccession for entry with custom bioprojectAccession"""
    group_key = {"project_id": row.project_id}
    logger.debug(
        f"Group {row.group_id} and organism {row.organism} already has "
        f"bioprojectAccession, adding to project_table"
    )
    bioproject = row.result.get("bioproject_accession") if row.result else None

    logger.info("Checking if bioproject actually exists and is public")
    if not bioproject or not accession_exists(str(bioproject), config):
        set_accession_does_not_exist_error(
            conditions=group_key,
            accession=str(bioproject),
            accession_type="BIOPROJECT",
            db_engine=db_engine,
        )
        return

    logger.info("Updating entry with bioprojectAccession to state SUBMITTED")
    update_db_where_conditions(
        db_engine,
        ProjectTableEntry,
        group_key,
        {
            "group_id": row.group_id,
            "organism": row.organism,
            "result": {"bioproject_accession": bioproject},
            "status": Status.SUBMITTED,
            "center_name": center_name,
        },
    )


def sync_state_with_submission_table(db_engine: Engine):
    """
    1. Find all entries in submission_table in state READY_TO_SUBMIT
    2. If (exists entry/entries in the project_table for (group_id, organism)):
    a.      If (exists "bioproject" in "metadata") filter to that entry
    b.      If (in state SUBMITTED) update state in submission_table to SUBMITTED_PROJECT
    3. Else create corresponding entry in project_table in state READY
            (add "bioproject" to result if exists in metadata)
    """
    conditions = {"status_all": StatusAll.READY_TO_SUBMIT}
    ready_to_submit = find_conditions_in_db(db_engine, SubmissionTableEntry, conditions=conditions)
    logger.debug(
        f"Found {len(ready_to_submit)} entries in submission_table in status READY_TO_SUBMIT"
    )
    for row in ready_to_submit:
        group_key = {"group_id": row.group_id, "organism": row.organism}
        seq_key = asdict(row.pkey)
        submitter_provided_bioproject: str | None = row.seq_metadata.get("bioprojectAccession")

        # Check if there exist entries in the project table for (group_id, organism)
        existing_corresponding_projects = find_conditions_in_db(
            db_engine, ProjectTableEntry, conditions=group_key
        )

        # Use custom bioprojectAccession if it exists
        if submitter_provided_bioproject:
            corresponding_project = [
                project
                for project in existing_corresponding_projects
                if project.result
                and project.result.get("bioproject_accession") == submitter_provided_bioproject
            ]
        else:
            corresponding_project = existing_corresponding_projects

        if len(corresponding_project) == 1 and corresponding_project[0].status == str(
            Status.SUBMITTED
        ):
            update_db_where_conditions(
                db_engine,
                model_class=SubmissionTableEntry,
                conditions=seq_key,
                update_values={
                    "status_all": StatusAll.SUBMITTED_PROJECT,
                    "center_name": corresponding_project[0].center_name,
                    "project_id": corresponding_project[0].project_id,
                },
            )
            continue

        if len(corresponding_project) == 1:
            logger.warning(
                f"Corresponding project not in STATE SUBMITTED for {row.group_id} and "
                f"organism {row.organism} - not adding to project_table"
            )
            continue

        if len(corresponding_project) > 1:
            logger.warning(
                f"Multiple corresponding projects found for group_id {row.group_id} and "
                f"organism {row.organism} - not adding to project_table"
            )
            continue

        project_id = add_to_project_table(
            db_engine,
            ProjectTableEntry(
                group_id=row.group_id,
                organism=row.organism,
                result={"bioproject_accession": submitter_provided_bioproject}
                if submitter_provided_bioproject
                else None,
            ),
        )
        if not project_id:
            continue
        update_db_where_conditions(
            db_engine,
            model_class=SubmissionTableEntry,
            conditions=seq_key,
            update_values={
                "project_id": project_id,
            },
        )


# TODO Allow propagating updated group info https://github.com/loculus-project/loculus/issues/2939
def project_table_create(
    db_engine: Engine,
    config: Config,
):
    """
    1. Find all entries in project_table in state READY
    2. Create project_set: get_group_info from loculus, use entry and config for other fields
    3. Update project_table to state SUBMITTING (only proceed if update succeeds)
    4. If (create_ena_project succeeds): update state to SUBMITTED with results
    5. Else update state to HAS_ERRORS with error messages

    If config.random_alias=True add a timestamp to the alias suffix to allow for multiple
    submissions of the same project for testing.
    """
    conditions = {"status": Status.READY}
    ready_to_submit_project = find_conditions_in_db(
        db_engine, ProjectTableEntry, conditions=conditions
    )
    logger.debug(f"Found {len(ready_to_submit_project)} entries in project_table in status READY")
    for row in ready_to_submit_project:
        group_key = {"group_id": row.group_id, "organism": row.organism}

        try:
            group_info = call_loculus.get_group_info(config, row.group_id)
        except Exception as e:
            logger.error(f"Was unable to get group info for group: {row.group_id}, {e}")
            continue

        if row.result and row.result.get("bioproject_accession"):
            update_with_existing_bioproject(
                db_engine, config, row, center_name=group_info.institution
            )
            continue

        project_set = construct_project_set_object(group_info, config, row, config.random_alias)
        update_values = {
            "status": Status.SUBMITTING,
            "started_at": datetime.now(tz=pytz.utc),
            "center_name": group_info.institution,
        }
        number_rows_updated = update_db_where_conditions(
            db_engine,
            model_class=ProjectTableEntry,
            conditions=group_key,
            update_values=update_values,
        )
        if number_rows_updated != 1:
            # state not correctly updated - do not start submission
            logger.warning(
                (
                    "Project_table: Status update from READY to SUBMITTING failed ",
                    "- not starting submission.",
                )
            )
            continue
        logger.info(
            f"Starting Project creation for group_id {row.group_id} organism {row.organism}"
        )
        # Actual HTTP request to ENA happens here
        project_creation_results: CreationResult = create_ena_project(config, project_set)
        if project_creation_results.result:
            update_values = {
                "status": Status.SUBMITTED,
                "result": project_creation_results.result,
                "finished_at": datetime.now(tz=pytz.utc),
            }
            logger.info(
                f"Project creation succeeded for group_id {row.group_id} organism {row.organism}"
            )
        else:
            update_values = {
                "status": Status.HAS_ERRORS,
                "errors": project_creation_results.errors,
                "started_at": datetime.now(tz=pytz.utc),
            }
            logger.error(
                f"Project creation failed for group_id {row.group_id} organism {row.organism}"
            )
        update_with_retry(
            db_engine=db_engine,
            conditions=group_key,
            update_values=update_values,
            model_class=ProjectTableEntry,
        )


def project_table_handle_errors(
    db_engine: Engine,
    config: Config,
    slack_config: SlackConfig,
    last_retry_time: datetime | None,
) -> datetime | None:
    """
    1. Find all entries in project_table in state HAS_ERRORS or SUBMITTING
        over submitting_time_threshold_min
    2. If time since last slack_notification is over slack_retry_threshold_min send notification
    3. Retry entries if time since last retry is over retry_threshold_min
    """
    entries_with_errors = find_errors_or_stuck_in_db(
        db_engine, ProjectTableEntry, time_threshold=config.submitting_time_threshold_min
    )
    if len(entries_with_errors) > 0:
        error_msg = (
            f"{config.backend_url}: ENA Submission pipeline found "
            f"{len(entries_with_errors)} entries in project_table in status"
            f" HAS_ERRORS or SUBMITTING for over {config.submitting_time_threshold_min}m"
        )
        send_slack_notification(
            error_msg,
            slack_config,
            time=datetime.now(tz=pytz.utc),
            slack_retry_threshold_min=config.slack_retry_threshold_min,
        )
        return retry_failed_submissions_for_matching_errors(
            entries_with_errors,
            db_engine,
            model_class=ProjectTableEntry,
            config=config,
            last_retry=last_retry_time,
        )
        # TODO: Query ENA to check if project has in fact been created
        # If created update project_table
        # If not retry 3 times, then raise for manual intervention
    return last_retry_time


def create_project(config: Config, stop_event: threading.Event):
    db_engine = db_init(config.db_password, config.db_username, config.db_url)
    slack_config = slack_conn_init(
        slack_hook_default=config.slack_hook,
        slack_token_default=config.slack_token,
        slack_channel_id_default=config.slack_channel_id,
    )
    last_retry_time: datetime | None = None

    while True:
        if stop_event.is_set():
            logger.warning("create_project stopped due to exception in another task")
            return
        logger.debug("Checking for projects to create")
        sync_state_with_submission_table(db_engine)

        project_table_create(db_engine, config)
        sync_state_with_submission_table(db_engine)  # update submission_table state after creation
        last_retry_time = project_table_handle_errors(
            db_engine, config, slack_config, last_retry_time
        )
        time.sleep(config.time_between_iterations)
