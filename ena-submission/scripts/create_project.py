import json
import logging
from dataclasses import dataclass
from datetime import datetime

import click
import pytz
import yaml
from call_loculus import get_group_info
from ena_submission_helper import CreationResults, create_ena_project, get_ena_config
from ena_types import (
    OrganismType,
    ProjectLink,
    ProjectLinks,
    ProjectSet,
    ProjectType,
    SubmissionProject,
    XmlAttribute,
    XrefType,
)
from notifications import SlackConfig, send_slack_notification, slack_conn_init
from psycopg2.pool import SimpleConnectionPool
from submission_db_helper import (
    ProjectTableEntry,
    Status,
    StatusAll,
    add_to_project_table,
    db_init,
    find_conditions_in_db,
    find_errors_in_db,
    update_db_where_conditions,
)

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass
class Config:
    organisms: dict[dict[str, str]]
    backend_url: str
    keycloak_token_url: str
    keycloak_client_id: str
    username: str
    password: str
    db_username: str
    db_password: str
    db_host: str
    db_name: str
    unique_project_suffix: str
    ena_submission_url: str
    ena_submission_password: str
    ena_submission_username: str
    ena_reports_service_url: str
    slack_hook: str
    slack_token: str
    slack_channel_id: str


def construct_project_set_object(
    group_info: dict[str, str],
    config: Config,
    entry: dict[str, str],
    test=False,
) -> ProjectSet:
    """
    Construct project set object, using:
    - entry in project_table
    - group_info of corresponding group_id
    - config information, such as ingest metadata for that organism

    If test=True add a timestamp to the alias suffix to allow for multiple
    submissions of the same project for testing.
    (ENA blocks multiple submissions with the same alias)
    """
    metadata_dict = config.organisms[entry["organism"]]["ingest"]
    if test:
        alias = XmlAttribute(
            f"{entry["group_id"]}:{entry["organism"]}:{config.unique_project_suffix}:{datetime.now(tz=pytz.utc)}"
        )  # TODO(https://github.com/loculus-project/loculus/issues/2425): remove in production
    else:
        alias = XmlAttribute(
            f"{entry["group_id"]}:{entry["organism"]}:{config.unique_project_suffix}"
        )

    project_type = ProjectType(
        center_name=XmlAttribute(group_info["institution"]),
        alias=alias,
        name=metadata_dict["scientific_name"],
        title=f"{metadata_dict["scientific_name"]}: Genome sequencing",
        description=(
            f"Automated upload of {metadata_dict["scientific_name"]} sequences submitted by {group_info["institution"]} from {config.db_name}",  # noqa: E501
        ),
        submission_project=SubmissionProject(
            organism=OrganismType(
                taxon_id=metadata_dict["taxon_id"],
                scientific_name=metadata_dict["scientific_name"],
            )
        ),
        project_links=ProjectLinks(
            project_link=ProjectLink(xref_link=XrefType(db=config.db_name, id=entry["group_id"]))
        ),
    )
    return ProjectSet(project=[project_type])


def submission_table_start(db_config: SimpleConnectionPool):
    """
    1. Find all entries in submission_table in state READY_TO_SUBMIT
    2. If (exists an entry in the project_table for (group_id, organism)):
    a.      If (in state SUBMITTED) update state in submission_table to SUBMITTED_PROJECT
    b.      Else update state to SUBMITTING_PROJECT
    3. Else create corresponding entry in project_table
    """
    conditions = {"status_all": StatusAll.READY_TO_SUBMIT}
    ready_to_submit = find_conditions_in_db(
        db_config, table_name="submission_table", conditions=conditions
    )
    logger.debug(
        f"Found {len(ready_to_submit)} entries in submission_table in status READY_TO_SUBMIT"
    )
    for row in ready_to_submit:
        group_key = {"group_id": row["group_id"], "organism": row["organism"]}
        seq_key = {"accession": row["accession"], "version": row["version"]}

        # Check if there exists an entry in the project table for (group_id, organism)
        corresponding_project = find_conditions_in_db(
            db_config, table_name="project_table", conditions=group_key
        )
        if len(corresponding_project) == 1:
            if corresponding_project[0]["status"] == str(Status.SUBMITTED):
                update_values = {
                    "status_all": StatusAll.SUBMITTED_PROJECT,
                    "center_name": corresponding_project[0]["center_name"],
                }
                update_db_where_conditions(
                    db_config,
                    table_name="submission_table",
                    conditions=seq_key,
                    update_values=update_values,
                )
            else:
                update_values = {"status_all": StatusAll.SUBMITTING_PROJECT}
                update_db_where_conditions(
                    db_config,
                    table_name="submission_table",
                    conditions=seq_key,
                    update_values=update_values,
                )
        else:
            # If not: create project_entry, change status to SUBMITTING_PROJECT
            entry = {
                "group_id": row["group_id"],
                "organism": row["organism"],
            }
            project_table_entry = ProjectTableEntry(**entry)
            add_to_project_table(db_config, project_table_entry)
            update_values = {"status_all": StatusAll.SUBMITTING_PROJECT}
            update_db_where_conditions(
                db_config,
                table_name="submission_table",
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
        db_config, table_name="submission_table", conditions=conditions
    )
    logger.debug(
        (
            f"Found {len(submitting_project)} entries in submission_table in",
            " status SUBMITTING_PROJECT",
        )
    )
    for row in submitting_project:
        group_key = {"group_id": row["group_id"], "organism": row["organism"]}
        seq_key = {"accession": row["accession"], "version": row["version"]}

        # 1. check if there exists an entry in the project table for (group_id, organism)
        corresponding_project = find_conditions_in_db(
            db_config, table_name="project_table", conditions=group_key
        )
        if len(corresponding_project) == 1 and corresponding_project[0]["status"] == str(
            Status.SUBMITTED
        ):
            update_values = {
                "status_all": StatusAll.SUBMITTED_PROJECT,
                "center_name": corresponding_project[0]["center_name"],
            }
            update_db_where_conditions(
                db_config,
                table_name="submission_table",
                conditions=seq_key,
                update_values=update_values,
            )
        if len(corresponding_project) == 0:
            error_msg = (
                "Entry in submission_table in status SUBMITTING_PROJECT",
                " with no corresponding project",
            )
            raise RuntimeError(error_msg)


def project_table_create(db_config: SimpleConnectionPool, config: Config, retry_number: int = 3):
    """
    1. Find all entries in project_table in state READY
    2. Create project_set: get_group_info from loculus, use entry and config for other fields
    3. Update project_table to state SUBMITTING (only proceed if update succeeds)
    4. If (create_ena_project succeeds): update state to SUBMITTED with results
    3. Else update state to HAS_ERRORS with error messages
    """
    ena_config = get_ena_config(
        config.ena_submission_username,
        config.ena_submission_password,
        config.ena_submission_url,
        config.ena_reports_service_url,
    )
    conditions = {"status": Status.READY}
    ready_to_submit_project = find_conditions_in_db(
        db_config, table_name="project_table", conditions=conditions
    )
    logger.debug(f"Found {len(ready_to_submit_project)} entries in project_table in status READY")
    for row in ready_to_submit_project:
        group_key = {"group_id": row["group_id"], "organism": row["organism"]}

        try:
            group_info = get_group_info(config, row["group_id"])[0]["group"]
        except Exception as e:
            logger.error(f"Was unable to get group info for group: {row["group_id"]}, {e}")
            continue

        project_set = construct_project_set_object(group_info, config, row, test=True)
        update_values = {
            "status": Status.SUBMITTING,
            "started_at": datetime.now(tz=pytz.utc),
            "center_name": group_info["institution"],
        }
        number_rows_updated = update_db_where_conditions(
            db_config,
            table_name="project_table",
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
        logger.info(f"Starting Project creation for group_id {row["group_id"]}")
        project_creation_results: CreationResults = create_ena_project(ena_config, project_set)
        if project_creation_results.results:
            update_values = {
                "status": Status.SUBMITTED,
                "result": json.dumps(project_creation_results.results),
                "finished_at": datetime.now(tz=pytz.utc),
            }
            number_rows_updated = 0
            tries = 0
            while number_rows_updated != 1 and tries < retry_number:
                if tries > 0:
                    # If state not correctly added retry
                    logger.warning(
                        f"Project created but DB update failed - reentry DB update #{tries}."
                    )
                number_rows_updated = update_db_where_conditions(
                    db_config,
                    table_name="project_table",
                    conditions=group_key,
                    update_values=update_values,
                )
                tries += 1
            if number_rows_updated == 1:
                logger.info(f"Project creation for group_id {row["group_id"]} succeeded!")
        else:
            update_values = {
                "status": Status.HAS_ERRORS,
                "errors": json.dumps(project_creation_results.errors),
                "started_at": datetime.now(tz=pytz.utc),
            }
            number_rows_updated = 0
            tries = 0
            while number_rows_updated != 1 and tries < retry_number:
                if tries > 0:
                    # If state not correctly added retry
                    logger.warning(
                        f"Project creation failed and DB update failed - reentry DB update #{tries}."
                    )
                number_rows_updated = update_db_where_conditions(
                    db_config,
                    table_name="project_table",
                    conditions=group_key,
                    update_values=update_values,
                )
                tries += 1


def project_table_handle_errors(
    db_config: SimpleConnectionPool,
    config: Config,
    slack_config: SlackConfig,
    time_threshold: int = 15,
    slack_time_threshold: int = 12,
):
    """
    - time_threshold: (minutes)
    - slack_time_threshold: (hours)

    1. Find all entries in project_table in state HAS_ERRORS or SUBMITTING over time_threshold
    2. If time since last slack_notification is over slack_time_threshold send notification
    """
    entries_with_errors = find_errors_in_db(
        db_config, "project_table", time_threshold=time_threshold
    )
    if len(entries_with_errors) > 0:
        error_msg = (
            f"{config.backend_url}: ENA Submission pipeline found {len(entries_with_errors)} entries in project_table in "
            f" in project_table in status HAS_ERRORS or SUBMITTING for over {time_threshold}m"
        )
        send_slack_notification(
            error_msg,
            slack_config,
            time=datetime.now(tz=pytz.utc),
            time_threshold=slack_time_threshold,
        )
        # TODO: Query ENA to check if project has in fact been created
        # If created update project_table
        # If not retry 3 times, then raise for manual intervention


@click.command()
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
@click.option(
    "--config-file",
    required=True,
    type=click.Path(exists=True),
)
def create_project(log_level, config_file):
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.INFO)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.info(f"Config: {config}")

    db_config = db_init(config.db_password, config.db_username, config.db_host)
    slack_config = slack_conn_init(
        slack_hook_default=config.slack_hook,
        slack_token_default=config.slack_token,
        slack_channel_id_default=config.slack_channel_id,
    )

    while True:
        submission_table_start(db_config)
        submission_table_update(db_config)

        project_table_create(db_config, config)
        project_table_handle_errors(db_config, config, slack_config)


if __name__ == "__main__":
    create_project()
