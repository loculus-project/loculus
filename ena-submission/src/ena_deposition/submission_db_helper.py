import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum

import psycopg2
import pytz
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool


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
    project_id: int | None = None


@dataclass
class ProjectTableEntry:
    group_id: int
    organism: str
    project_id: int | None = None
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


def delete_records_in_db(
    db_conn_pool: SimpleConnectionPool, table_name: TableName, conditions: dict[str, str]
) -> int:
    """
    Deletes records from the specified table based on the given conditions.

    Args:
        db_conn_pool (SimpleConnectionPool): Connection pool for PostgreSQL.
        table_name (TableName): The table to delete records from.
        conditions (dict[str, str]): A dictionary of column names and values for filtering.

    Returns:
        int: The number of rows deleted.
    """
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor() as cur:
            # Validate table and column names to prevent SQL injection
            TableName.validate(table_name)
            for key in conditions:
                is_valid_column_name(table_name, key)

            query = f"DELETE FROM {table_name}"  # noqa: S608

            if conditions:
                where_clause = " AND ".join([f"{key}=%s" for key in conditions])
                query += f" WHERE {where_clause}"

            cur.execute(
                query,
                tuple(
                    str(value) if isinstance(value, (Status, StatusAll)) else value  # noqa: UP038
                    for value in conditions.values()
                ),
            )

            deleted_rows = cur.rowcount  # Get number of affected rows

    finally:
        db_conn_pool.putconn(con)

    return deleted_rows


def find_conditions_in_db(
    db_conn_pool: SimpleConnectionPool, table_name: TableName, conditions: dict[str, str]
) -> list[dict[str, str]]:
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
) -> list[dict[str, str]]:
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
) -> list[dict[str, str]]:
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
) -> list[dict[str, str]]:
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
) -> int | None:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor() as cur:
            project_table_entry.started_at = datetime.now(tz=pytz.utc)

            cur.execute(
                "INSERT INTO project_table VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING project_id",
                (
                    project_table_entry.group_id,
                    project_table_entry.organism,
                    json.dumps(project_table_entry.errors),
                    json.dumps(project_table_entry.warnings),
                    str(project_table_entry.status),
                    project_table_entry.started_at,
                    project_table_entry.finished_at,
                    json.dumps(project_table_entry.result),
                    project_table_entry.center_name,
                ),
            )

            project_id = cur.fetchone()

            con.commit()
        return project_id[0] if project_id else None
    except Exception as e:
        con.rollback()
        print(f"add_to_project_table errored with: {e}")
        return None
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
                    json.dumps(sample_table_entry.errors),
                    json.dumps(sample_table_entry.warnings),
                    str(sample_table_entry.status),
                    sample_table_entry.started_at,
                    sample_table_entry.finished_at,
                    json.dumps(sample_table_entry.result),
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
                    json.dumps(assembly_table_entry.errors),
                    json.dumps(assembly_table_entry.warnings),
                    str(assembly_table_entry.status),
                    assembly_table_entry.started_at,
                    assembly_table_entry.finished_at,
                    json.dumps(assembly_table_entry.result),
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
                    json.dumps(submission_table_entry.errors),
                    json.dumps(submission_table_entry.warnings),
                    str(submission_table_entry.status_all),
                    submission_table_entry.started_at,
                    submission_table_entry.finished_at,
                    submission_table_entry.metadata,
                    submission_table_entry.unaligned_nucleotide_sequences,
                    json.dumps(submission_table_entry.external_metadata),
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


def is_revision(db_config: SimpleConnectionPool, seq_key: dict[str, str]):
    """Check if the entry is a revision"""
    version = seq_key["version"]
    if version == "1":
        return False
    accession = {"accession": seq_key["accession"]}
    sample_data_in_submission_table = find_conditions_in_db(
        db_config, table_name="submission_table", conditions=accession
    )
    all_versions = sorted([int(entry["version"]) for entry in sample_data_in_submission_table])
    return len(all_versions) > 1 and version == all_versions[-1]


def last_version(db_config: SimpleConnectionPool, seq_key: dict[str, str]) -> int | None:
    if not is_revision(db_config, seq_key):
        return None
    accession = {"accession": seq_key["accession"]}
    sample_data_in_submission_table = find_conditions_in_db(
        db_config, table_name="submission_table", conditions=accession
    )
    all_versions = sorted([int(entry["version"]) for entry in sample_data_in_submission_table])
    return all_versions[-2]
