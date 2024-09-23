import logging
import os
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

import click
import pandas as pd
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


def db_init(
    db_password_default: str, db_username_default: str, db_host_default: str
) -> SimpleConnectionPool:
    db_password = os.getenv("DB_PASSWORD")
    if not db_password:
        db_password = db_password_default

    db_username = os.getenv("DB_USERNAME")
    if not db_username:
        db_username = db_username_default

    db_host = os.getenv("DB_HOST")
    if not db_host:
        db_host = db_host_default

    return SimpleConnectionPool(
        minconn=1,
        maxconn=1,  # Only allow one connection per organism
        dbname="loculus",
        user=db_username,
        host=db_host,
        password=db_password,
        options="-c search_path=ena-submission",
    )


class Status(Enum):
    READY = 0
    SUBMITTING = 1
    SUBMITTED = 2
    HAS_ERRORS = 3
    WAITING = 4  # Only for assembly creation

    def __str__(self):
        return self.name


@dataclass
class SampleTableEntry:
    accession: str
    version: int
    errors: str | None = None
    warnings: str | None = None
    status: Status = Status.READY
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result: str | None = None


@dataclass
class AssemblyTableEntry:
    accession: str
    version: int
    errors: str | None = None
    warnings: str | None = None
    status: Status = Status.READY
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result: str | None = None


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
            query = "SELECT accession, result FROM assembly_table WHERE STATUS = 'SUBMITTED'"

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
    "--input-metadata-tsv",
    required=True,
    type=click.Path(exists=True),
)
@click.option(
    "--output-metadata-tsv",
    required=True,
    type=click.Path(),
)
def filter_out_loculus_submissions(log_level, config_file, input_metadata_tsv, output_metadata_tsv):
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.INFO)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.info(f"Config: {config}")

    db_config = db_init(config.db_password, config.db_username, config.db_host)
    insdc_accessions_submitted_by_loculus = get_insdc_accessions(db_config)
    all_insdc_accessions_submitted_by_loculus: set = {
        item for sublist in insdc_accessions_submitted_by_loculus.values() for item in sublist
    }
    all_insdc_accessions_submitted_by_loculus.add("MZ424862.1")
    logger.debug(f"Assembly accessions to filter out: {all_insdc_accessions_submitted_by_loculus}")
    biosample_accessions_submitted_by_loculus = get_bio_sample_accessions(db_config)
    logger.debug(
        f"Biosample accessions to filter out: {biosample_accessions_submitted_by_loculus.values()}"
    )

    df = pd.read_csv(input_metadata_tsv, sep="\t", dtype=str, keep_default_na=False)
    original_count = len(df)

    filtered_df = df[~df["genbankAccession"].isin(all_insdc_accessions_submitted_by_loculus)]
    filtered_df = filtered_df[
        ~filtered_df["biosampleAccession"].isin(biosample_accessions_submitted_by_loculus.values())
    ]
    logger.info(f"Filtered out #: {(original_count - len(filtered_df))} sequences.")
    filtered_df.to_csv(output_metadata_tsv, sep="\t", index=False)


if __name__ == "__main__":
    filter_out_loculus_submissions()
