import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum

import psycopg2
import pytz
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool


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
        maxconn=2,  # max 7*2 connections to db allowed
        dbname="loculus",
        user=db_username,
        host=db_host,
        password=db_password,
        options="-c search_path=ena-submission",
    )


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
    HAS_ERRORS_EXT_METADATA_UPLOAD = 11

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


class TableName(Enum):
    PROJECT_TABLE = "project_table"
    SAMPLE_TABLE = "sample_table"
    ASSEMBLY_TABLE = "assembly_table"
    SUBMISSION_TABLE = "submission_table"

    @classmethod
    def validate(cls, value: str):
        if value not in cls._value2member_map_:
            msg = (
                f"Invalid table name '{value}'."
                f" Allowed values are: {', '.join([e.value for e in cls])}"
            )
            raise ValueError(msg)


def is_valid_column_name(table_name: TableName, column_name: str) -> bool:
    match table_name:
        case "project_table":
            field_names = ProjectTableEntry.__annotations__.keys()
        case "sample_table":
            field_names = SampleTableEntry.__annotations__.keys()
        case "assembly_table":
            field_names = AssemblyTableEntry.__annotations__.keys()
        case "submission_table":
            field_names = SubmissionTableEntry.__annotations__.keys()

    if column_name not in field_names:
        msg = f"Invalid column name '{column_name}' for {table_name}"
        raise ValueError(msg)


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


def find_conditions_in_db(
    db_conn_pool: SimpleConnectionPool, table_name: TableName, conditions: dict[str, str]
) -> dict[str, str]:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            # Prevent sql-injection with table_name and column_name validation
            TableName.validate(table_name)
            for key in conditions:
                is_valid_column_name(table_name, key)

            query = f"SELECT * FROM {table_name}"  # noqa: S608

            where_clause = " AND ".join([f"{key}=%s" for key in conditions])
            query += f" WHERE {where_clause}"

            cur.execute(
                query,
                tuple(
                    str(value) if (isinstance(value, (Status, StatusAll))) else value  # noqa: UP038
                    for value in conditions.values()
                ),
            )

            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    return results


def find_errors_in_db(
    db_conn_pool: SimpleConnectionPool, table_name: TableName, time_threshold: int = 15
) -> dict[str, str]:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            min_start_time = datetime.now(tz=pytz.utc) + timedelta(minutes=-time_threshold)
            # Prevent sql-injection with table_name validation
            TableName.validate(table_name)

            query = f"""
                SELECT * FROM {table_name}
                WHERE (status = 'HAS_ERRORS' AND started_at < %s)
                OR (status = 'SUBMITTING' AND started_at < %s)
            """  # noqa: S608

            cur.execute(query, (min_start_time, min_start_time))

            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    return results


def find_stuck_in_submission_db(
    db_conn_pool: SimpleConnectionPool, time_threshold: int = 48
) -> dict[str, str]:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            min_start_time = datetime.now(tz=pytz.utc) + timedelta(hours=-time_threshold)

            query = """
                SELECT * FROM submission_table
                WHERE status_all = 'HAS_ERRORS_EXT_METADATA_UPLOAD'
                AND started_at < %s
            """

            cur.execute(query, (min_start_time,))

            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    return results


def find_waiting_in_db(
    db_conn_pool: SimpleConnectionPool, table_name: TableName, time_threshold: int = 48
) -> dict[str, str]:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            min_start_time = datetime.now(tz=pytz.utc) + timedelta(hours=-time_threshold)
            # Prevent sql-injection with table_name validation
            TableName.validate(table_name)

            query = f"SELECT * FROM {table_name} WHERE status = 'WAITING' AND started_at < %s"  # noqa: S608

            cur.execute(query, (min_start_time,))

            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    return results


def update_db_where_conditions(
    db_conn_pool: SimpleConnectionPool,
    table_name: TableName,
    conditions: dict[str, str],
    update_values: dict[str, str],
) -> int:
    updated_row_count = 0
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            # Prevent sql-injection with table_name and column_name validation
            TableName.validate(table_name)
            for key in conditions:
                is_valid_column_name(table_name, key)

            query = f"UPDATE {table_name} SET "  # noqa: S608

            set_clause = ", ".join([f"{key}=%s" for key in update_values])
            query += set_clause

            where_clause = " AND ".join([f"{key}=%s" for key in conditions])
            query += f" WHERE {where_clause}"
            parameters = tuple(
                str(value) if (isinstance(value, (Status, StatusAll))) else value  # noqa: UP038
                for value in update_values.values()
            ) + tuple(
                str(value) if (isinstance(value, (Status, StatusAll))) else value  # noqa: UP038
                for value in conditions.values()
            )

            cur.execute(query, parameters)
            updated_row_count = cur.rowcount
            con.commit()
    except (Exception, psycopg2.DatabaseError) as e:
        con.rollback()
        print(f"update_db_where_conditions errored with: {e}")
    finally:
        db_conn_pool.putconn(con)
    return updated_row_count


def add_to_project_table(
    db_conn_pool: SimpleConnectionPool, project_table_entry: ProjectTableEntry
) -> bool:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor() as cur:
            project_table_entry.started_at = datetime.now(tz=pytz.utc)

            cur.execute(
                "INSERT INTO project_table VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
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
        return True
    except Exception as e:
        con.rollback()
        print(f"add_to_project_table errored with: {e}")
        return False
    finally:
        db_conn_pool.putconn(con)


def add_to_sample_table(
    db_conn_pool: SimpleConnectionPool, sample_table_entry: SampleTableEntry
) -> bool:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor() as cur:
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
        return True
    except Exception as e:
        con.rollback()
        print(f"add_to_sample_table errored with: {e}")
        return False
    finally:
        db_conn_pool.putconn(con)


def add_to_assembly_table(
    db_conn_pool: SimpleConnectionPool, assembly_table_entry: AssemblyTableEntry
) -> bool:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor() as cur:
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
        return True
    except Exception as e:
        con.rollback()
        print(f"add_to_assembly_table errored with: {e}")
        return False
    finally:
        db_conn_pool.putconn(con)


def in_submission_table(db_conn_pool: SimpleConnectionPool, conditions) -> bool:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor() as cur:
            for key in conditions:
                is_valid_column_name("submission_table", key)

            query = "SELECT * from submission_table"

            where_clause = " AND ".join([f"{key}=%s" for key in conditions])
            query += f" WHERE {where_clause}"
            cur.execute(
                query,
                tuple(
                    str(value) if (isinstance(value, (Status, StatusAll))) else value  # noqa: UP038
                    for value in conditions.values()
                ),
            )
            in_db = bool(cur.rowcount)
    finally:
        db_conn_pool.putconn(con)
    return in_db


def add_to_submission_table(
    db_conn_pool: SimpleConnectionPool, submission_table_entry: SubmissionTableEntry
) -> bool:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor() as cur:
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
        return True
    except Exception as e:
        con.rollback()
        print(f"add_to_submission_table errored with: {e}")
        return False
    finally:
        db_conn_pool.putconn(con)
