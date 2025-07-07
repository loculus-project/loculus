"""
Query ENA and NCBI to check if a given accession is publicly visible
Add timestamp to project/sample/assembly table when first publicly visible
"""

# 1. Find all accessions that don't yet hvae a publicly visible timestamp
# 2. Query ENA and NCBI for these accessions
# 3. If publicly visible, update the timestamp in the database
# 4. Sleep

import logging
import threading
import time
from datetime import datetime
from http import HTTPStatus

import pytz
import requests
from psycopg2.pool import SimpleConnectionPool

from ena_deposition.config import Config
from ena_deposition.submission_db_helper import (
    ProjectTableEntry,
    Status,
    TableName,
    db_init,
    find_conditions_in_db,
    update_db_where_conditions,
)

logger = logging.getLogger(__name__)


def get_not_yet_visible_ena_projects(pool: SimpleConnectionPool) -> list[ProjectTableEntry]:
    sample_data_in_submission_table: list[dict] = find_conditions_in_db(
        pool,
        table_name=TableName.PROJECT_TABLE,
        conditions={
            "ena_first_publicly_visible": None,
            "status": Status.SUBMITTED,
        },
    )  # type: ignore
    return [ProjectTableEntry(**row) for row in sample_data_in_submission_table]


def query_ena_for_visibility(config: Config, ena_accession: str) -> datetime | None:
    # Lookup https://www.ebi.ac.uk/ena/browser/api/xml/{ena_accession}
    # If status code is 200, return current timestamp, otherwise None
    response = requests.get(
        f"https://www.ebi.ac.uk/ena/browser/api/xml/{ena_accession}",
        timeout=config.ena_http_timeout_seconds,
    )
    if response.status_code == HTTPStatus.OK:
        return datetime.now(pytz.UTC)  # Remove .timestamp() call
    return None


def check_and_update_visibility_ena_project(config: Config, pool: SimpleConnectionPool):
    logger.debug("Checking ENA projects for visibility")
    not_yet_visible_projects_ena = get_not_yet_visible_ena_projects(pool)
    logger.info(
        f"Found {len(not_yet_visible_projects_ena)} projects that have not yet "
        "been publicly visible"
    )

    for project in not_yet_visible_projects_ena:
        ena_accession = project.result["bioproject_accession"]
        project_id = project.project_id
        logger.debug(
            f"Checking ENA visibility for project {project_id} with ENA accession {ena_accession}"
        )
        ena_first_publicly_visible = query_ena_for_visibility(config, ena_accession)

        if ena_first_publicly_visible:
            logger.debug(
                f"Project {project_id} with ENA accession {ena_accession} is "
                "publicly visible, updating database."
            )
            updated_count = update_db_where_conditions(
                pool,
                table_name=TableName.PROJECT_TABLE,
                conditions={"project_id": project_id},
                update_values={"ena_first_publicly_visible": ena_first_publicly_visible},
            )
            if updated_count > 0:
                logger.info(
                    f"Updated project {project_id} with ENA first publicly visible "
                    f"timestamp: {ena_first_publicly_visible}"
                )
            else:
                logger.warning(
                    f"Tried but failed to update ENA first publicly visible for"
                    f" {project_id} in the database."
                )
        else:
            logger.debug(
                f"Project {project_id} with ENA accession {ena_accession} is "
                "still not publicly visible."
            )


def check_and_update_visibility(config: Config, stop_event: threading.Event):
    pool = db_init(config.db_password, config.db_username, config.db_url)

    while True:
        if stop_event.is_set():
            print("check_and_update_visibility stopped due to exception in another task")
            return
        check_and_update_visibility_ena_project(config, pool)
        logger.debug("check_and_update_visibility_ena_project finished, sleeping for a while")
        time.sleep(config.time_between_iterations)
