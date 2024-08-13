import os
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

import psycopg2
import pytz


@dataclass
class DBConfig:
    username: str
    password: str
    host: str


def get_db_config(db_password_default: str, db_username_default: str, db_host_default: str):
    db_password = os.getenv("DB_PASSWORD")
    if not db_password:
        db_password = db_password_default

    db_username = os.getenv("DB_USERNAME")
    if not db_username:
        db_username = db_username_default

    db_host = os.getenv("DB_HOST")
    if not db_host:
        db_host = db_host_default

    db_params = {
        "username": db_username,
        "password": db_password,
        "host": db_host,
    }

    return DBConfig(**db_params)


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

    def __str__(self):
        return self.name


class Status(Enum):
    READY = 0
    SUBMITTING = 1
    SUBMITTED = 2
    HAS_ERRORS = 3

    def __str__(self):
        return self.name


@dataclass
class SubmissionTableEntry:
    accession: str
    version: str
    organism: str
    group_id: int
    errors: str | None = None
    warnings: str | None = None
    status_all: StatusAll = StatusAll.READY_TO_SUBMIT
    started_at: datetime | None = None
    finished_at: datetime | None = None
    metadata: str | None = None
    unaligned_nucleotide_sequences: str | None = None
    external_metadata: str | None = None


def connect_to_db(db_config: DBConfig):
    """
    Establish connection to ena_submitter DB, if DB doesn't exist create it.
    """
    try:
        con = psycopg2.connect(
            dbname="loculus",
            user=db_config.username,
            host=db_config.host,
            password=db_config.password,
            options="-c search_path=ena-submission",
        )
    except ConnectionError as e:
        raise ConnectionError("Could not connect to loculus DB") from e
    return con


def in_submission_table(accession: str, version: int, db_config: DBConfig) -> bool:
    con = connect_to_db(db_config)
    cur = con.cursor()
    cur.execute(
        "select * from submission_table where accession=%s and version=%s",
        (f"{accession}", f"{version}"),
    )
    return bool(cur.rowcount)


def add_to_submission_table(db_config: DBConfig, submission_table_entry: SubmissionTableEntry):
    con = connect_to_db(db_config)
    cur = con.cursor()
    submission_table_entry.started_at = datetime.now(tz=pytz.utc)

    cur.execute(
        "insert into submission_table values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            submission_table_entry.accession,
            submission_table_entry.version,
            submission_table_entry.organism,
            submission_table_entry.group_id,
            submission_table_entry.errors,
            submission_table_entry.warnings,
            str(submission_table_entry.status_all),
            submission_table_entry.started_at,
            submission_table_entry.finished_at,
            submission_table_entry.metadata,
            submission_table_entry.unaligned_nucleotide_sequences,
            submission_table_entry.external_metadata,
        ),
    )
    con.commit()
    con.close()
