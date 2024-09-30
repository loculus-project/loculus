import logging
import os
import re
from dataclasses import dataclass

import click
import yaml
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass
class Config:
    segmented: bool
    db_password: str
    db_username: str
    db_host: str


def convert_jdbc_to_psycopg2(jdbc_url):
    jdbc_pattern = r"jdbc:postgresql://(?P<host>[^:/]+)(?::(?P<port>\d+))?/(?P<dbname>[^?]+)"

    match = re.match(jdbc_pattern, jdbc_url)

    if not match:
        msg = "Invalid JDBC URL format."
        raise ValueError(msg)

    host = match.group("host")
    port = match.group("port") or "5432"  # Default to 5432 if no port is provided
    dbname = match.group("dbname")

    return f"postgresql://{host}:{port}/{dbname}"


def db_init(
    db_password_default: str, db_username_default: str, db_url_default: str
) -> SimpleConnectionPool:
    db_password = os.getenv("DB_PASSWORD")
    if not db_password:
        db_password = db_password_default

    db_username = os.getenv("DB_USERNAME")
    if not db_username:
        db_username = db_username_default

    db_url = os.getenv("DB_URL")
    if not db_url:
        db_url = db_url_default

    db_dsn = convert_jdbc_to_psycopg2(db_url) + "?options=-c%20search_path%3Dena_deposition_schema"
    return SimpleConnectionPool(
        minconn=1,
        maxconn=2,  # max 7*2 connections to db allowed
        user=db_username,
        password=db_password,
        dsn=db_dsn,
    )


def get_bio_sample_accessions(db_conn_pool: SimpleConnectionPool) -> dict[str, str]:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            # Result is a jsonb column
            query = "SELECT accession, result FROM sample_table WHERE STATUS = 'SUBMITTED'"

            cur.execute(query)

            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    return {result["accession"]: result["result"]["biosample_accession"] for result in results}


def get_insdc_accessions(db_conn_pool: SimpleConnectionPool) -> dict[str, str]:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            # Result is a jsonb column
            query = "SELECT accession, result FROM assembly_table WHERE STATUS IN ('SUBMITTED', 'WAITING')"

            cur.execute(query)

            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    return {
        result["accession"]: [
            result["result"][key]
            for key in result["result"]
            if key.startswith("insdc_accession_full")
        ]
        for result in results
    }


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
@click.option(
    "--output-insdc-accessions",
    required=True,
    type=click.Path(),
)
@click.option(
    "--output-biosample-accessions",
    required=True,
    type=click.Path(),
)
def get_loculus_depositions(
    log_level, config_file, output_insdc_accessions, output_biosample_accessions
):
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.INFO)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.info(f"Config: {config}")

    db_config = db_init(config.db_password, config.db_username, config.db_host)
    insdc_accessions_submitted_by_loculus = get_insdc_accessions(db_config)
    all_insdc_accessions_submitted_by_loculus = [
        item for sublist in insdc_accessions_submitted_by_loculus.values() for item in sublist
    ]
    logger.debug(f"Assembly accessions to filter out: {all_insdc_accessions_submitted_by_loculus}")
    biosample_accessions_submitted_by_loculus = get_bio_sample_accessions(db_config)
    logger.debug(
        f"Biosample accessions to filter out: {biosample_accessions_submitted_by_loculus.values()}"
    )

    with open(output_insdc_accessions, "w", encoding="utf-8") as f:
        for item in all_insdc_accessions_submitted_by_loculus:
            f.write(f"{item}\n")
    with open(output_biosample_accessions, "w", encoding="utf-8") as f:
        for item in biosample_accessions_submitted_by_loculus.values():
            f.write(f"{item}\n")


if __name__ == "__main__":
    get_loculus_depositions()
