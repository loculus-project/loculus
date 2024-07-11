import psycopg2
from enum import Enum
from dataclasses import dataclass


@dataclass
class DBConfig:
    username: str
    password: str
    host: str


class StatusAll(Enum):
    READY_TO_SUBMIT = 0
    SUBMITTING_PROJECT = 1
    SUBMITTING_SAMPLE = 2
    SUBMITTING_ASSEMBLY = 3
    SUBMITTED_ALL = 4
    SENT_TO_LOCULUS = 5
    HAS_ERRORS_PROJECT = 6
    HAS_ERRORS_ASSEMBLY = 7
    HAS_ERRORS_SAMPLE = 8


class Status(Enum):
    READY = 0
    SUBMITTING = 1
    SUBMITTED = 2
    HAS_ERRORS = 3


def connect_to_db(username="postgres", password="unsecure", host="127.0.0.1"):
    """
    Establish connection to ena_submitter DB, if DB doesn't exist create it.
    """
    try:
        con = psycopg2.connect(
            dbname="loculus",
            user=username,
            host=host,
            password=password,
            options="-c search_path=ena-submission",
        )
    except ConnectionError as e:
        raise ConnectionError("Could not create ena_submitter DB") from e
    return con


def in_submission_table(accession: str, version: int, db_config: DBConfig) -> bool:
    con = connect_to_db(
        db_config.username,
        db_config.password,
        db_config.host,
    )
    cur = con.cursor()
    cur.execute(
        "select * from submission_table where accession=%s and version=%s",
        (f"{accession}", f"{version}"),
    )
    return bool(cur.rowcount)
