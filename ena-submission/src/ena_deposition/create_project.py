import json
import logging
import threading
import time
from datetime import datetime

import pytz
from psycopg2.pool import SimpleConnectionPool

from ena_deposition import call_loculus
from ena_deposition.loculus_models import Group

from .config import Config
from .ena_submission_helper import (
    CreationResult,
    check_accession_exists_and_set_error,
    create_ena_project,
    get_alias,
    trigger_retry_if_exists,
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
    TableName,
    add_to_project_table,
    db_init,
    find_conditions_in_db,
    find_errors_in_db,
    update_db_where_conditions,
    update_with_retry,
)

logger = logging.getLogger(__name__)


def construct_project_set_object(
    group_info: Group,
    config: Config,
    entry: dict[str, str],
    test=False,
) -> ProjectSet:
    """
    Construct project set object, using:
    - entry in project_table
    - group_info of corresponding group_id
    - config information, such as enaDeposition metadata for that organism

    If test=True add a timestamp to the alias suffix to allow for multiple
    submissions of the same project for testing.
    (ENA blocks multiple submissions with the same alias)
    """
    metadata_dict = config.organisms[entry["organism"]]["enaDeposition"]
    alias = get_alias(
        f"{entry['group_id']}:{entry['organism']}:{config.unique_project_suffix}",
        test,
        config.set_alias_suffix,
    )

    address = group_info.address
    group_name = group_info.group_name
    center_name = group_info.institution
    address_string = ", ".join([x for x in [address.city, address.country] if x])

    project_type = ProjectType(
        center_name=XmlAttribute(center_name),
        alias=alias,
        name=(
            f"{metadata_dict['scientific_name']}: Genome sequencing by {group_name}, {center_name}"
        ),
        title=(
            f"{metadata_dict['scientific_name']}: Genome sequencing by "
            f"{group_name}, {center_name}, {address_string}"
        ),
        description=(
            f"Automated upload of {metadata_dict['scientific_name']} sequences "
            f"submitted by {group_name}, {center_name}, {address_string} "
            f"to {config.db_name}"
        ),
        submission_project=SubmissionProject(
            organism=OrganismType(
                taxon_id=metadata_dict["taxon_id"],
                scientific_name=metadata_dict["scientific_name"],
            )
        ),
        project_links=ProjectLinks(
            project_link=[ProjectLink(xref_link=XrefType(db=config.db_name, id=entry["group_id"]))]
        ),
    )
    return ProjectSet(project=[project_type])


def set_project_table_entry(db_config, config, row):
    """Set bioprojectAccession for entry with custom bioprojectAccession"""
    logger.debug(f"Accession {row['accession']} already has bioprojectAccession in metadata")
    group_key = {"group_id": row["group_id"], "organism": row["organism"]}
    seq_key = {"accession": row["accession"], "version": row["version"]}
    bioproject = row["metadata"]["bioprojectAccession"]

    corresponding_group = find_conditions_in_db(
        db_config, table_name=TableName.PROJECT_TABLE, conditions=group_key
    )
    corresponding_project = [
        project
        for project in corresponding_group
        if project["result"].get("bioproject_accession") == bioproject
    ]
    if len(corresponding_project) == 1:
        logger.debug(
            "bioprojectAccession is already in project_table - adding id to submission_table"
        )
        update_values = {
            "status_all": StatusAll.SUBMITTED_PROJECT,
            "center_name": corresponding_project[0]["center_name"],
            "project_id": corresponding_project[0]["project_id"],
        }
        update_db_where_conditions(
            db_config,
            table_name=TableName.SUBMISSION_TABLE,
            conditions=seq_key,
            update_values=update_values,
        )
        return

    logger.info("Checking if bioproject actually exists and is public")
    if (
        check_accession_exists_and_set_error(
            conditions=group_key,
            accession=bioproject,
            accession_type="BIOPROJECT",
            db_pool=db_config,
            config=config,
        )
        is False
    ):
        return

    logger.info("Adding bioprojectAccession to project_table")
    try:
        group_details = call_loculus.get_group_info(config, row["group_id"])
    except Exception as e:
        logger.error(f"Was unable to get group info for group: {row['group_id']}, {e}")
        return
    center_name = group_details.institution
    entry = {
        "group_id": row["group_id"],
        "organism": row["organism"],
        "result": {"bioproject_accession": bioproject},
        "status": Status.SUBMITTED,
        "center_name": center_name,
    }
    project_table_entry = ProjectTableEntry(**entry)
    succeeded = add_to_project_table(db_config, project_table_entry)
    if succeeded:
        logger.debug("Succeeding in adding bioprojectAccession to project_table")
        update_values = {
            "status_all": StatusAll.SUBMITTED_PROJECT,
            "center_name": center_name,
            "project_id": succeeded,
        }
        update_db_where_conditions(
            db_config,
            table_name=TableName.SUBMISSION_TABLE,
            conditions=seq_key,
            update_values=update_values,
        )


def submission_table_start(db_config: SimpleConnectionPool, config: Config):
    """
    1. Find all entries in submission_table in state READY_TO_SUBMIT
    2. If (exists "bioproject" in "metadata"):
    a.      If ("bioproject" in "result"["bioproject"]) in projects for that (group_id, organism):
                update state in submission_table to SUBMITTED_PROJECT, add center_name, project_id
    b.      Else create entry in project_table, update state to SUBMITTED_PROJECT,
            add center_name, project_id
    c.      break
    3. If (exists an entry in the project_table for (group_id, organism)):
    a.      If (in state SUBMITTED) update state in submission_table to SUBMITTED_PROJECT
    b.      Else update state to SUBMITTING_PROJECT
    4. Else create corresponding entry in project_table
    """
    conditions = {"status_all": StatusAll.READY_TO_SUBMIT}
    ready_to_submit = find_conditions_in_db(
        db_config, table_name=TableName.SUBMISSION_TABLE, conditions=conditions
    )
    logger.debug(
        f"Found {len(ready_to_submit)} entries in submission_table in status READY_TO_SUBMIT"
    )
    for row in ready_to_submit:
        group_key = {"group_id": row["group_id"], "organism": row["organism"]}
        seq_key = {"accession": row["accession"], "version": row["version"]}

        # Use custom bioprojectAccession if it exists
        if "bioprojectAccession" in row["metadata"] and row["metadata"]["bioprojectAccession"]:
            set_project_table_entry(db_config, config, row)
            continue

        # Create a default project entry for (group_id, organism)
        # Check if there exists an entry in the project table for (group_id, organism)
        corresponding_project = find_conditions_in_db(
            db_config, table_name=TableName.PROJECT_TABLE, conditions=group_key
        )
        if len(corresponding_project) == 1:
            if corresponding_project[0]["status"] == str(Status.SUBMITTED):
                update_values = {
                    "status_all": StatusAll.SUBMITTED_PROJECT,
                    "center_name": corresponding_project[0]["center_name"],
                    "project_id": corresponding_project[0]["project_id"],
                }
            else:
                update_values = {"status_all": StatusAll.SUBMITTING_PROJECT}
        else:
            project_id = add_to_project_table(
                db_config, ProjectTableEntry(group_id=row["group_id"], organism=row["organism"])
            )
            if not project_id:
                continue
            update_values = {
                "status_all": StatusAll.SUBMITTING_PROJECT,
                "project_id": project_id,
            }
        update_db_where_conditions(
            db_config,
            table_name=TableName.SUBMISSION_TABLE,
            conditions=seq_key,
            update_values=update_values,
        )


def submission_table_update(db_config: SimpleConnectionPool):
    """
    1. Find all entries in submission_table in state SUBMITTING_PROJECT
    2. If (exists an entry in the project_table for (group_id, organism)):
    a.      If (in state SUBMITTED) update state in submission_table to SUBMITTED_PROJECT
    3. Else throw Error
    """
    conditions = {"status_all": StatusAll.SUBMITTING_PROJECT}
    submitting_project = find_conditions_in_db(
        db_config, table_name=TableName.SUBMISSION_TABLE, conditions=conditions
    )
    logger.debug(
        f"Found {len(submitting_project)} entries in submission_table in status SUBMITTING_PROJECT"
    )
    for row in submitting_project:
        group_key = {"group_id": row["group_id"], "organism": row["organism"]}
        seq_key = {"accession": row["accession"], "version": row["version"]}

        # 1. check if there exists an entry in the project table for (group_id, organism)
        corresponding_project = find_conditions_in_db(
            db_config, table_name=TableName.PROJECT_TABLE, conditions=group_key
        )
        if len(corresponding_project) == 1 and corresponding_project[0]["status"] == str(
            Status.SUBMITTED
        ):
            update_values = {
                "status_all": StatusAll.SUBMITTED_PROJECT,
                "center_name": corresponding_project[0]["center_name"],
                "project_id": corresponding_project[0]["project_id"],
            }
            update_db_where_conditions(
                db_config,
                table_name=TableName.SUBMISSION_TABLE,
                conditions=seq_key,
                update_values=update_values,
            )
        if len(corresponding_project) == 0:
            error_msg = (
                "Entry in submission_table in status SUBMITTING_PROJECT",
                " with no corresponding project",
            )
            raise RuntimeError(error_msg)


# TODO Allow propagating updated group info https://github.com/loculus-project/loculus/issues/2939
def project_table_create(
    db_config: SimpleConnectionPool,
    config: Config,
    test: bool = False,
):
    """
    1. Find all entries in project_table in state READY
    2. Create project_set: get_group_info from loculus, use entry and config for other fields
    3. Update project_table to state SUBMITTING (only proceed if update succeeds)
    4. If (create_ena_project succeeds): update state to SUBMITTED with results
    3. Else update state to HAS_ERRORS with error messages

    If test=True add a timestamp to the alias suffix to allow for multiple submissions of the same
    project for testing.
    """
    conditions = {"status": Status.READY}
    ready_to_submit_project = find_conditions_in_db(
        db_config, table_name=TableName.PROJECT_TABLE, conditions=conditions
    )
    logger.debug(f"Found {len(ready_to_submit_project)} entries in project_table in status READY")
    for row in ready_to_submit_project:
        group_key = {"group_id": row["group_id"], "organism": row["organism"]}

        try:
            group_info = call_loculus.get_group_info(config, row["group_id"])
        except Exception as e:
            logger.error(f"Was unable to get group info for group: {row['group_id']}, {e}")
            continue

        project_set = construct_project_set_object(group_info, config, row, test)
        update_values = {
            "status": Status.SUBMITTING,
            "started_at": datetime.now(tz=pytz.utc),
            "center_name": group_info.institution,
        }
        number_rows_updated = update_db_where_conditions(
            db_config,
            table_name=TableName.PROJECT_TABLE,
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
            f"Starting Project creation for group_id {row['group_id']} organism {row['organism']}"
        )
        # Actual HTTP request to ENA happens here
        project_creation_results: CreationResult = create_ena_project(config, project_set)
        if project_creation_results.result:
            update_values = {
                "status": Status.SUBMITTED,
                "result": json.dumps(project_creation_results.result),
                "finished_at": datetime.now(tz=pytz.utc),
            }
            logger.info(
                f"Project creation succeeded for group_id {row['group_id']} "
                f"organism {row['organism']}"
            )
        else:
            update_values = {
                "status": Status.HAS_ERRORS,
                "errors": json.dumps(project_creation_results.errors),
                "started_at": datetime.now(tz=pytz.utc),
            }
            logger.error(
                f"Project creation failed for group_id {row['group_id']} organism {row['organism']}"
            )
        update_with_retry(
            db_config=db_config,
            conditions=group_key,
            update_values=update_values,
            table_name=TableName.PROJECT_TABLE,
        )


def project_table_handle_errors(
    db_config: SimpleConnectionPool,
    config: Config,
    slack_config: SlackConfig,
    last_retry_time: datetime | None,
    submitting_time_threshold_min: int = 15,
    retry_threshold_hours: int = 4,
    slack_retry_threshold_hours: int = 12,
):
    """
    1. Find all entries in project_table in state HAS_ERRORS or SUBMITTING
        over submitting_time_threshold_min
    2. If time since last slack_notification is over slack_retry_threshold_hours send notification
    """
    entries_with_errors = find_errors_in_db(
        db_config, TableName.PROJECT_TABLE, time_threshold=submitting_time_threshold_min
    )
    if len(entries_with_errors) > 0:
        error_msg = (
            f"{config.backend_url}: ENA Submission pipeline found "
            f"{len(entries_with_errors)} entries in project_table in status"
            f" HAS_ERRORS or SUBMITTING for over {submitting_time_threshold_min}m"
        )
        send_slack_notification(
            error_msg,
            slack_config,
            time=datetime.now(tz=pytz.utc),
            time_threshold=slack_retry_threshold_hours,
        )
        trigger_retry_if_exists(
            entries_with_errors,
            db_config,
            key_fields=["group_id", "organism"],
            table_name=TableName.PROJECT_TABLE,
            retry_threshold_hours=retry_threshold_hours,
            last_retry=last_retry_time,
        )
        # TODO: Query ENA to check if project has in fact been created
        # If created update project_table
        # If not retry 3 times, then raise for manual intervention


def create_project(config: Config, stop_event: threading.Event):
    db_config = db_init(config.db_password, config.db_username, config.db_url)
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
        submission_table_start(db_config, config)
        submission_table_update(db_config)

        project_table_create(db_config, config, test=config.test)
        project_table_handle_errors(db_config, config, slack_config, last_retry_time)
        time.sleep(config.time_between_iterations)
