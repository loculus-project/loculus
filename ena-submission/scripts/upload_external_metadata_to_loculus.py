# This script collects the results of the ENA submission and uploads the results to Loculus

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import click
import pytz
import yaml
from call_loculus import submit_external_metadata
from psycopg2.pool import SimpleConnectionPool
from submission_db_helper import (
    StatusAll,
    db_init,
    find_conditions_in_db,
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
    organisms: list[dict[str, str]]
    organism: str
    backend_url: str
    keycloak_token_url: str
    keycloak_client_id: str
    username: str
    password: str
    ena_specific_metadata: list[str]
    db_username: str
    db_password: str
    db_host: str


def get_external_metadata(db_config: SimpleConnectionPool, entry: dict[str, Any]) -> dict[str, Any]:
    accession = entry["accession"]
    data = {
        "accession": accession,
        "version": entry["version"],
        "externalMetadata": {},
    }
    group_key = {"group_id": entry["group_id"], "organism": entry["organism"]}
    seq_key = {"accession": accession, "version": entry["version"]}

    # Get corresponding entry in the project table for (group_id, organism)
    corresponding_project = find_conditions_in_db(
        db_config, table_name="project_table", conditions=group_key
    )
    if len(corresponding_project) == 1:
        data["externalMetadata"]["bioprojectAccession"] = corresponding_project[0]["result"][
            "bioproject_accession"
        ]
    else:
        raise Exception
    # Check corresponding entry in the sample table for (accession, version)
    corresponding_sample = find_conditions_in_db(
        db_config, table_name="sample_table", conditions=seq_key
    )
    if len(corresponding_sample) == 1:
        data["externalMetadata"]["biosampleAccession"] = corresponding_sample[0]["result"][
            "biosample_accession"
        ]
    else:
        raise Exception
    # Check corresponding entry in the assembly table for (accession, version)
    corresponding_assembly = find_conditions_in_db(
        db_config, table_name="assembly_table", conditions=seq_key
    )
    if len(corresponding_assembly) == 1:
        data["externalMetadata"]["gcaAccession"] = corresponding_assembly[0]["result"][
            "gca_accession"
        ]
    else:
        raise Exception
    return data


def get_external_metadata_and_send_to_loculus(
    db_config: SimpleConnectionPool, config: Config, retry_number=3
):
    # Get external metadata
    conditions = {"status_all": StatusAll.SUBMITTED_ALL}
    submitted_all = find_conditions_in_db(
        db_config, table_name="submission_table", conditions=conditions
    )
    for entry in submitted_all:
        accession = entry["accession"]
        data = get_external_metadata(db_config, entry)
        seq_key = {"accession": accession, "version": entry["version"]}

        try:
            submit_external_metadata(
                data,
                config,
                entry["organism"],
            )
            update_values = {
                "status_all": StatusAll.SENT_TO_LOCULUS,
                "finished_at": datetime.now(tz=pytz.utc),
            }
            number_rows_updated = 0
            tries = 0
            while number_rows_updated != 1 and tries < retry_number:
                if tries > 0:
                    logger.warning(
                        f"External Metadata Update succeeded but  - reentry DB update #{tries}."
                    )
                update_db_where_conditions(
                    db_config,
                    table_name="submission_table",
                    conditions=seq_key,
                    update_values=update_values,
                )
                tries += 1
            if number_rows_updated == 1:
                logger.info(f"External metadata update for {entry["accession"]} succeeded!")
        except:
            logger.error(f"ExternalMetadata update failed for {accession}")
            update_values = {
                "status_all": StatusAll.HAS_ERRORS_EXT_METADATA_UPLOAD,
                "started_at": datetime.now(tz=pytz.utc),
            }
            number_rows_updated = 0
            tries = 0
            while number_rows_updated != 1 and tries < retry_number:
                if tries > 0:
                    # If state not correctly added retry
                    logger.warning(
                        f"External metadata update creation failed and DB update failed - reentry DB update #{tries}."
                    )
                update_db_where_conditions(
                    db_config,
                    table_name="submission_table",
                    conditions=seq_key,
                    update_values=update_values,
                )
                tries += 1
            continue


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
def upload_external_metadata(log_level, config_file):
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.INFO)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.info(f"Config: {config}")
    db_config = db_init(config.db_password, config.db_username, config.db_host)

    while True:
        get_external_metadata_and_send_to_loculus(db_config, config)


if __name__ == "__main__":
    upload_external_metadata()
