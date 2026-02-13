import json
import logging
import os
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Any, Final

import psycopg2
import pytz
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool
from tenacity import (
    Retrying,
    before_sleep_log,
    retry_if_exception_type,
    stop_after_attempt,
    wait_fixed,
)

logger = logging.getLogger(__name__)


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


class StatusAll(StrEnum):
    READY_TO_SUBMIT = "READY_TO_SUBMIT"
    SUBMITTING_PROJECT = "SUBMITTING_PROJECT"
    SUBMITTED_PROJECT = "SUBMITTED_PROJECT"
    SUBMITTING_SAMPLE = "SUBMITTING_SAMPLE"
    SUBMITTED_SAMPLE = "SUBMITTED_SAMPLE"
    SUBMITTING_ASSEMBLY = "SUBMITTING_ASSEMBLY"
    SUBMITTED_ALL = "SUBMITTED_ALL"
    SENT_TO_LOCULUS = "SENT_TO_LOCULUS"
    HAS_ERRORS_PROJECT = "HAS_ERRORS_PROJECT"
    HAS_ERRORS_ASSEMBLY = "HAS_ERRORS_ASSEMBLY"
    HAS_ERRORS_SAMPLE = "HAS_ERRORS_SAMPLE"
    HAS_ERRORS_EXT_METADATA_UPLOAD = "HAS_ERRORS_EXT_METADATA_UPLOAD"


class Status(StrEnum):
    READY = "READY"
    SUBMITTING = "SUBMITTING"
    SUBMITTED = "SUBMITTED"
    HAS_ERRORS = "HAS_ERRORS"
    WAITING = "WAITING"  # Only for assembly creation


class TableName(StrEnum):
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


def validate_column_name(table_name: str, column_name: str):
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


type Accession = str
type Version = int


@dataclass(frozen=True)
class AccessionVersion:
    accession: Accession
    version: Version

    @classmethod
    def from_string(cls, s: str) -> "AccessionVersion":
        if s.count(".") != 1:
            msg = (
                f"Invalid AccessionVersion string '{s}': "
                "expected exactly one '.' separating accession and version"
            )
            raise ValueError(msg)
        accession_str, version_str = s.split(".", 1)
        return cls(
            accession=accession_str,
            version=int(version_str),
        )


@dataclass(frozen=True)
class ProjectId:
    project_id: int | None


@dataclass
class SubmissionTableEntry:
    accession: Accession
    version: Version
    organism: str
    group_id: int
    metadata: dict[str, Any] = field(default_factory=dict)
    errors: list[str] | None = None
    warnings: list[str] | None = None
    status_all: StatusAll = StatusAll.READY_TO_SUBMIT
    started_at: datetime | None = None
    finished_at: datetime | None = None
    unaligned_nucleotide_sequences: dict[str, str | None] = field(default_factory=dict)
    center_name: str | None = None
    external_metadata: dict[str, str | Sequence[str]] | None = None
    project_id: int | None = None

    @property
    def primary_key(self) -> AccessionVersion:
        return AccessionVersion(accession=self.accession, version=self.version)


@dataclass(kw_only=True)
class ProjectTableEntry:
    group_id: int
    organism: str
    project_id: int | None = None
    errors: list[str] | None = None
    warnings: list[str] | None = None
    status: Status = Status.READY
    started_at: datetime | None = None
    finished_at: datetime | None = None
    center_name: str | None = None
    result: dict[str, str | Sequence[str]] | None = None
    ena_first_publicly_visible: datetime | None = None
    ncbi_first_publicly_visible: datetime | None = None

    @property
    def primary_key(self) -> ProjectId:
        return ProjectId(project_id=self.project_id)


@dataclass(kw_only=True)
class SampleTableEntry:
    accession: Accession
    version: Version
    errors: list[str] | None = None
    warnings: list[str] | None = None
    status: Status = Status.READY
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result: dict[str, str | Sequence[str]] | None = None
    ena_first_publicly_visible: datetime | None = None
    ncbi_first_publicly_visible: datetime | None = None

    @property
    def primary_key(self) -> AccessionVersion:
        return AccessionVersion(accession=self.accession, version=self.version)


@dataclass(kw_only=True)
class AssemblyTableEntry:
    accession: Accession
    version: Version
    errors: list[str] | None = None
    warnings: list[str] | None = None
    status: Status = Status.READY
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result: dict[str, str | Sequence[str]] | None = None
    ena_nucleotide_first_publicly_visible: datetime | None = None
    ncbi_nucleotide_first_publicly_visible: datetime | None = None
    ena_gca_first_publicly_visible: datetime | None = None
    ncbi_gca_first_publicly_visible: datetime | None = None

    @property
    def primary_key(self) -> AccessionVersion:
        return AccessionVersion(accession=self.accession, version=self.version)


def type_conversion(value: Any) -> Any:
    if isinstance(value, (Status, StatusAll)):
        return str(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return value


def highest_version_in_submission_table(
    db_conn_pool: SimpleConnectionPool,
) -> dict[Accession, Version]:
    """
    Returns the highest version for a given accession in the submission table.
    Does group by, so that only the highest version for each accession is returned.
    """
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            query = f"""
                SELECT accession, MAX(version) AS version
                FROM {TableName.SUBMISSION_TABLE}
                GROUP BY accession
            """  # noqa: S608
            cur.execute(query)
            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)
    return {row["accession"]: int(row["version"]) for row in results}


def delete_records_in_db(
    db_conn_pool: SimpleConnectionPool,
    table_name: TableName,
    conditions: dict[str, str],
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
    logger.debug(f"Deleting records from {table_name} where {conditions}")
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor() as cur:
            # Validate table and column names to prevent SQL injection
            TableName.validate(table_name)
            for key in conditions:
                validate_column_name(table_name, key)

            query = f"DELETE FROM {table_name}"  # noqa: S608

            if conditions:
                where_clause = " AND ".join([f"{key}=%s" for key in conditions])
                query += f" WHERE {where_clause}"

            cur.execute(
                query,
                tuple(type_conversion(value) for value in conditions.values()),
            )

            deleted_rows = cur.rowcount  # Get number of affected rows

    finally:
        db_conn_pool.putconn(con)

    logger.debug(f"Deleted {deleted_rows} rows from {table_name} where {conditions}")

    return deleted_rows


def find_conditions_in_db(
    db_conn_pool: SimpleConnectionPool,
    table_name: TableName,
    conditions: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Return all records from the specified table that match all the conditions
    Args:
        db_conn_pool (SimpleConnectionPool): Connection pool for PostgreSQL.
        table_name (TableName): The table to search in.
        conditions (dict[str, str]): A dictionary of column names and values for filtering.
    Returns:
        list[dict[str, str]]: A list of dictionaries representing the records that
            match the conditions. Each dictionary contains column names as keys and
            their corresponding values.
    """
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            # Prevent sql-injection with table_name and column_name validation
            TableName.validate(table_name)
            for key in conditions:
                validate_column_name(table_name, key)

            query = f"SELECT * FROM {table_name}"  # noqa: S608

            where_conditions, params = [], []

            for key, value in conditions.items():
                if value is None:
                    where_conditions.append(f"{key} IS NULL")
                else:
                    where_conditions.append(f"{key} = %s")
                    params.append(type_conversion(value))
            if where_conditions:
                query += " WHERE " + " AND ".join(where_conditions)

            cur.execute(query, params)
            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    return results


def find_errors_or_stuck_in_db(
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
                WHERE (status = 'HAS_ERRORS')
                OR (status = 'SUBMITTING' AND started_at < %s)
            """  # noqa: S608

            cur.execute(query, (min_start_time,))

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
    conditions: Mapping[str, str | int],
    update_values: dict[str, Any],
) -> int:
    updated_row_count = 0
    con = db_conn_pool.getconn()
    logger.debug(
        f"Updating '{table_name}' with conditions '{conditions}' and values '{update_values}'"
    )
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            # Prevent sql-injection with table_name and column_name validation
            TableName.validate(table_name)
            for key in conditions:
                validate_column_name(table_name, key)

            query = f"UPDATE {table_name} SET "  # noqa: S608

            set_clause = ", ".join([f"{key}=%s" for key in update_values])
            query += set_clause

            where_clause = " AND ".join([f"{key}=%s" for key in conditions])
            # Avoid updating rows that would not change so the return value is actually the
            # number of rows that were changed for real. See bug #4911
            where_not_equal_clause = " OR ".join(
                [f"{key} IS DISTINCT FROM %s" for key in update_values]
            )
            query += f" WHERE {where_clause} AND ( {where_not_equal_clause} )"
            parameters = (
                tuple(type_conversion(value) for value in update_values.values())
                + tuple(type_conversion(value) for value in conditions.values())
                + tuple(type_conversion(value) for value in update_values.values())
            )

            cur.execute(query, parameters)
            updated_row_count = cur.rowcount
            con.commit()
    except (Exception, psycopg2.DatabaseError) as e:
        con.rollback()
        logger.warning(f"update_db_where_conditions errored with: {e}")
    finally:
        db_conn_pool.putconn(con)
    logger.debug(
        f"Updated {updated_row_count} rows in '{table_name}' for conditions '{conditions}'"
        f"and update values '{update_values}'"
    )
    return updated_row_count


def update_with_retry(
    db_config: SimpleConnectionPool,
    conditions: Mapping[str, Any],
    table_name: TableName,
    update_values: dict[str, Any],
    reraise: bool = True,
) -> int:
    """Update the database with retry logic.
    the conditions and update_values are dictionaries where
    keys are column names and values are the new values to set.
    they will be added to the log message."""

    def _do_update():
        number_rows_updated = update_db_where_conditions(
            db_config,
            table_name=table_name,
            conditions=conditions,
            update_values=update_values,
        )
        if number_rows_updated != 1:
            msg = f"{table_name} update failed"
            raise ValueError(msg)
        return number_rows_updated

    number_of_retries: Final = 3
    retryer = Retrying(
        stop=stop_after_attempt(number_of_retries),
        wait=wait_fixed(2),
        retry=retry_if_exception_type(ValueError),
        reraise=True,
        before_sleep=before_sleep_log(logger, logging.WARNING),
    )

    try:
        logger.debug(
            f"Updating {table_name} with conditions {conditions} and values {update_values}"
        )
        result = retryer(_do_update)
        logger.info(f"{table_name} update succeeded for {conditions} with values {update_values}")
        return result
    except Exception as e:
        error_msg = (
            f"{table_name} update failed for {conditions} with values {update_values} "
            f"after {number_of_retries} attempts."
        )
        logger.error(error_msg)
        if reraise:
            logger.error("Raising exception after retries failed")
            raise ValueError(error_msg) from e
        return 0


def add_to_project_table(
    db_conn_pool: SimpleConnectionPool, project_table_entry: ProjectTableEntry
) -> int | None:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor() as cur:
            project_table_entry.started_at = datetime.now(tz=pytz.utc)

            cur.execute(
                "INSERT INTO project_table VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
                "RETURNING project_id",
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
        logger.warning(f"add_to_project_table errored with: {e}")
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
        logger.warning(f"add_to_sample_table errored with: {e}")
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
        logger.warning(f"add_to_assembly_table errored with: {e}")
        return False
    finally:
        db_conn_pool.putconn(con)


def in_submission_table(db_conn_pool: SimpleConnectionPool, conditions: dict[str, Any]) -> bool:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor() as cur:
            for key in conditions:
                validate_column_name("submission_table", key)

            query = "SELECT * from submission_table"

            where_clause = " AND ".join([f"{key}=%s" for key in conditions])
            query += f" WHERE {where_clause}"
            cur.execute(
                query,
                tuple(type_conversion(value) for value in conditions.values()),
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
                    json.dumps(submission_table_entry.metadata),
                    json.dumps(submission_table_entry.unaligned_nucleotide_sequences),
                    json.dumps(submission_table_entry.external_metadata),
                ),
            )
            con.commit()
        return True
    except Exception as e:
        con.rollback()
        logger.warning(f"add_to_submission_table errored with: {e}")
        return False
    finally:
        db_conn_pool.putconn(con)


def is_revision(db_config: SimpleConnectionPool, seq_key: AccessionVersion) -> bool:
    """Check if the entry is a revision"""
    version = seq_key.version
    if version == 1:
        return False
    accession = {"accession": seq_key.accession}
    sample_data_in_submission_table = find_conditions_in_db(
        db_config, table_name=TableName.SUBMISSION_TABLE, conditions=accession
    )
    all_versions = sorted([int(entry["version"]) for entry in sample_data_in_submission_table])
    return len(all_versions) > 1 and version == all_versions[-1]


def last_version(db_config: SimpleConnectionPool, seq_key: AccessionVersion) -> int | None:
    if not is_revision(db_config, seq_key):
        return None
    accession = {"accession": seq_key.accession}
    sample_data_in_submission_table = find_conditions_in_db(
        db_config, table_name=TableName.SUBMISSION_TABLE, conditions=accession
    )
    all_versions = sorted([int(entry["version"]) for entry in sample_data_in_submission_table])
    return all_versions[-2]
