import os
from dataclasses import dataclass
from datetime import datetime, timedelta
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
    SUBMITTED_PROJECT = 2
    SUBMITTING_SAMPLE = 3
    SUBMITTED_SAMPLE = 4
    SUBMITTING_ASSEMBLY = 5
    SUBMITTED_ALL = 6
    SENT_TO_LOCULUS = 7
    HAS_ERRORS_PROJECT = 8
    HAS_ERRORS_ASSEMBLY = 9
    HAS_ERRORS_SAMPLE = 10

    def __str__(self):
        return self.name


class Status(Enum):
    READY = 0
    SUBMITTING = 1
    SUBMITTED = 2
    HAS_ERRORS = 3
    WAITING = 4  # Only for assembly creation

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
    center_name: str | None = None
    external_metadata: str | None = None


@dataclass
class ProjectTableEntry:
    group_id: int
    organism: str
    errors: str | None = None
    warnings: str | None = None
    status: Status = Status.READY
    started_at: datetime | None = None
    finished_at: datetime | None = None
    center_name: str | None = None
    result: str | None = None


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


def find_conditions_in_db(db_config, table_name, conditions):
    con = connect_to_db(db_config)
    cur = con.cursor()

    query = f"SELECT * FROM {table_name} WHERE "
    query += " AND ".join([f"{key}='{str(value)}'" for key, value in conditions.items()])

    cur.execute(query)

    rows = cur.fetchall()
    # Get column names from cursor
    col_names = [desc[0] for desc in cur.description]
    results = [dict(zip(col_names, row)) for row in rows]

    cur.close()
    con.close()

    return results


def find_errors_in_db(db_config, table_name, time_threshold=15):
    con = connect_to_db(db_config)
    cur = con.cursor()

    min_start_time = datetime.now(tz=pytz.utc) + timedelta(minutes=-time_threshold)

    query = f"SELECT * FROM {table_name} WHERE "
    query += f"(status='HAS_ERRORS' AND started_at < timestamp '{min_start_time}')"
    query += f" OR (status='SUBMITTING' AND started_at < timestamp '{min_start_time}')"

    cur.execute(query)

    rows = cur.fetchall()
    # Get column names from cursor
    col_names = [desc[0] for desc in cur.description]
    results = [dict(zip(col_names, row)) for row in rows]

    cur.close()
    con.close()

    return results


def find_waiting_in_db(db_config, table_name, time_threshold=48):
    con = connect_to_db(db_config)
    cur = con.cursor()

    min_start_time = datetime.now(tz=pytz.utc) + timedelta(hours=-time_threshold)

    query = f"SELECT * FROM {table_name} WHERE "
    query += f"(status='WAITING' AND started_at < timestamp '{min_start_time}')"

    cur.execute(query)

    rows = cur.fetchall()
    # Get column names from cursor
    col_names = [desc[0] for desc in cur.description]
    results = [dict(zip(col_names, row)) for row in rows]

    cur.close()
    con.close()

    return results


def update_db_where_conditions(db_config, table_name, conditions, update_values):
    con = connect_to_db(db_config)
    cur = con.cursor()
    updated_row_count = 0
    try:
        query = f"UPDATE {table_name} SET "
        query += ", ".join([f"{key}='{str(value)}'" for key, value in update_values.items()])
        query += " WHERE "
        query += " AND ".join([f"{key}=%s" for key in conditions])

        cur.execute(query, tuple(conditions.values()))
        updated_row_count = cur.rowcount

        con.commit()
    except (Exception, psycopg2.DatabaseError) as error:
        print(error)
    return updated_row_count


def add_to_project_table(db_config: DBConfig, project_table_entry: ProjectTableEntry):
    con = connect_to_db(db_config)
    cur = con.cursor()
    project_table_entry.started_at = datetime.now(tz=pytz.utc)

    cur.execute(
        "insert into project_table values(%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            project_table_entry.group_id,
            project_table_entry.organism,
            project_table_entry.errors,
            project_table_entry.warnings,
            str(project_table_entry.status),
            project_table_entry.started_at,
            project_table_entry.finished_at,
            project_table_entry.result,
        ),
    )
    con.commit()
    con.close()


def add_to_sample_table(db_config: DBConfig, sample_table_entry: SampleTableEntry):
    con = connect_to_db(db_config)
    cur = con.cursor()
    sample_table_entry.started_at = datetime.now(tz=pytz.utc)

    cur.execute(
        "insert into sample_table values(%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            sample_table_entry.accession,
            sample_table_entry.version,
            sample_table_entry.errors,
            sample_table_entry.warnings,
            str(sample_table_entry.status),
            sample_table_entry.started_at,
            sample_table_entry.finished_at,
            sample_table_entry.result,
        ),
    )
    con.commit()
    con.close()


def add_to_assembly_table(db_config: DBConfig, assembly_table_entry: AssemblyTableEntry):
    con = connect_to_db(db_config)
    cur = con.cursor()
    assembly_table_entry.started_at = datetime.now(tz=pytz.utc)

    cur.execute(
        "insert into assembly_table values(%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            assembly_table_entry.accession,
            assembly_table_entry.version,
            assembly_table_entry.errors,
            assembly_table_entry.warnings,
            str(assembly_table_entry.status),
            assembly_table_entry.started_at,
            assembly_table_entry.finished_at,
            assembly_table_entry.result,
        ),
    )
    con.commit()
    con.close()


def in_submission_table(accession: str, version: int, db_config: DBConfig) -> bool:
    con = connect_to_db(db_config)
    cur = con.cursor()
    cur.execute(
        "select * from submission_table where accession=%s and version=%s",
        (f"{accession}", f"{version}"),
    )
    in_db = bool(cur.rowcount)
    con.close()
    return in_db


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
