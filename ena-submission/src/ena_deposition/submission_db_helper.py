import logging
import os
import re
import typing
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Any, Final, TypeVar

import pytz
from sqlalchemy import Engine, create_engine, delete, func, make_url, or_, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    MappedAsDataclass,
    Session,
    mapped_column,
)
from tenacity import (
    Retrying,
    before_sleep_log,
    retry_if_exception_type,
    stop_after_attempt,
    wait_fixed,
)

logger = logging.getLogger(__name__)


def convert_jdbc_to_psycopg2(jdbc_url: str) -> str:
    jdbc_pattern = r"jdbc:postgresql://(?P<host>[^:/]+)(?::(?P<port>\d+))?/(?P<dbname>[^?]+)"
    match = re.match(jdbc_pattern, jdbc_url)
    if not match:
        msg = "Invalid JDBC URL format."
        raise ValueError(msg)
    host = match.group("host")
    port = match.group("port") or "5432"
    dbname = match.group("dbname")
    return f"postgresql+psycopg2://{host}:{port}/{dbname}"


def db_init(db_password_default: str, db_username_default: str, db_url_default: str) -> Engine:
    db_password = os.getenv("DB_PASSWORD") or db_password_default
    db_username = os.getenv("DB_USERNAME") or db_username_default
    db_url = os.getenv("DB_URL") or db_url_default

    base_dsn = convert_jdbc_to_psycopg2(db_url)

    parsed = make_url(base_dsn)
    url = parsed.set(username=db_username, password=db_password)
    return create_engine(
        url,
        connect_args={"options": "-c search_path=ena_deposition_schema"},
        pool_size=1,
        max_overflow=1,  # max 2 connections total; 7 processes * 2 = 14 DB connections
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

    def __post_init__(self):
        if not isinstance(self.version, int):
            msg = "version must be an int"
            logger.error(msg)
            raise TypeError(msg)


@dataclass(frozen=True)
class ProjectId:
    project_id: int | None


# ---------------------------------------------------------------------------
# SQLAlchemy ORM models
# Using MappedAsDataclass so they still behave as dataclasses (constructor,
# field access, asdict, etc.) while giving typed attribute access on query
# results (row.accession instead of row["accession"]).
#
# Note: the 'metadata' field of SubmissionTableEntry is mapped to DB column
# "metadata" but exposed as the Python attribute 'seq_metadata' to avoid
# conflicting with SQLAlchemy's DeclarativeBase.metadata class attribute.
# ---------------------------------------------------------------------------


class Base(MappedAsDataclass, DeclarativeBase):
    pass


class SubmissionTableEntry(Base):
    """Maps to submission_table. Primary key: (accession, version)."""

    __tablename__ = "submission_table"
    __table_args__: typing.ClassVar[dict[str, Any]] = {"schema": "ena_deposition_schema"}

    # Required fields (no defaults) must come first for dataclass ordering.
    accession: Mapped[str] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(primary_key=True)
    organism: Mapped[str] = mapped_column()
    group_id: Mapped[int] = mapped_column()

    # Optional fields with defaults.
    # 'seq_metadata' maps to the DB column "metadata".
    seq_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default_factory=dict)
    errors: Mapped[list[str] | None] = mapped_column(JSONB, default=None)
    warnings: Mapped[list[str] | None] = mapped_column(JSONB, default=None)
    status_all: Mapped[str] = mapped_column(default=str(StatusAll.READY_TO_SUBMIT))
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    finished_at: Mapped[datetime | None] = mapped_column(default=None)
    unaligned_nucleotide_sequences: Mapped[dict[str, str | None]] = mapped_column(
        JSONB, default_factory=dict
    )
    center_name: Mapped[str | None] = mapped_column(default=None)
    external_metadata: Mapped[dict[str, str | Sequence[str]] | None] = mapped_column(
        JSONB, default=None
    )
    project_id: Mapped[int | None] = mapped_column(default=None)

    @property
    def pkey(self) -> AccessionVersion:
        return AccessionVersion(accession=self.accession, version=self.version)


class ProjectTableEntry(Base):
    """Maps to project_table. Primary key: project_id (BIGSERIAL)."""

    __tablename__ = "project_table"
    __table_args__: typing.ClassVar[dict[str, Any]] = {"schema": "ena_deposition_schema"}

    # BIGSERIAL primary key — server-generated, excluded from __init__.
    project_id: Mapped[int | None] = mapped_column(
        primary_key=True, autoincrement=True, init=False, default=None
    )
    group_id: Mapped[int] = mapped_column()
    organism: Mapped[str] = mapped_column()
    errors: Mapped[list[str] | None] = mapped_column(JSONB, default=None)
    warnings: Mapped[list[str] | None] = mapped_column(JSONB, default=None)
    status: Mapped[str] = mapped_column(default=str(Status.READY))
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    finished_at: Mapped[datetime | None] = mapped_column(default=None)
    center_name: Mapped[str | None] = mapped_column(default=None)
    result: Mapped[dict[str, str | Sequence[str]] | None] = mapped_column(JSONB, default=None)
    ena_first_publicly_visible: Mapped[datetime | None] = mapped_column(default=None)
    ncbi_first_publicly_visible: Mapped[datetime | None] = mapped_column(default=None)

    @property
    def pkey(self) -> ProjectId:
        return ProjectId(project_id=self.project_id)


class SampleTableEntry(Base):
    """Maps to sample_table. Primary key: (accession, version)."""

    __tablename__ = "sample_table"
    __table_args__: typing.ClassVar[dict[str, Any]] = {"schema": "ena_deposition_schema"}

    accession: Mapped[str] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(primary_key=True)
    errors: Mapped[list[str] | None] = mapped_column(JSONB, default=None)
    warnings: Mapped[list[str] | None] = mapped_column(JSONB, default=None)
    status: Mapped[str] = mapped_column(default=str(Status.READY))
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    finished_at: Mapped[datetime | None] = mapped_column(default=None)
    result: Mapped[dict[str, str | Sequence[str]] | None] = mapped_column(JSONB, default=None)
    ena_first_publicly_visible: Mapped[datetime | None] = mapped_column(default=None)
    ncbi_first_publicly_visible: Mapped[datetime | None] = mapped_column(default=None)

    @property
    def pkey(self) -> AccessionVersion:
        return AccessionVersion(accession=self.accession, version=self.version)


class AssemblyTableEntry(Base):
    """Maps to assembly_table. Primary key: (accession, version)."""

    __tablename__ = "assembly_table"
    __table_args__: typing.ClassVar[dict[str, Any]] = {"schema": "ena_deposition_schema"}

    accession: Mapped[str] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(primary_key=True)
    errors: Mapped[list[str] | None] = mapped_column(JSONB, default=None)
    warnings: Mapped[list[str] | None] = mapped_column(JSONB, default=None)
    status: Mapped[str] = mapped_column(default=str(Status.READY))
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    finished_at: Mapped[datetime | None] = mapped_column(default=None)
    result: Mapped[dict[str, str | Sequence[str]] | None] = mapped_column(JSONB, default=None)
    ena_nucleotide_first_publicly_visible: Mapped[datetime | None] = mapped_column(default=None)
    ncbi_nucleotide_first_publicly_visible: Mapped[datetime | None] = mapped_column(default=None)
    ena_gca_first_publicly_visible: Mapped[datetime | None] = mapped_column(default=None)
    ncbi_gca_first_publicly_visible: Mapped[datetime | None] = mapped_column(default=None)

    @property
    def pkey(self) -> AccessionVersion:
        return AccessionVersion(accession=self.accession, version=self.version)


def highest_version_in_submission_table(engine: Engine) -> dict[Accession, Version]:
    """Return the highest version for each accession in submission_table."""
    with Session(engine) as session:
        stmt = select(
            SubmissionTableEntry.accession,
            func.max(SubmissionTableEntry.version).label("version"),
        ).group_by(SubmissionTableEntry.accession)
        rows = session.execute(stmt).all()
    return {row.accession: row.version for row in rows}


T = TypeVar(
    "T",
    SubmissionTableEntry,
    ProjectTableEntry,
    SampleTableEntry,
    AssemblyTableEntry,
)


def find_conditions_in_db[T](
    engine: Engine,
    model_class: type[T],
    conditions: dict[str, Any],
) -> list[T]:
    """Return all rows from *model_class*'s table matching every condition.

    Each condition whose value is None generates an IS NULL check; others
    generate an equality check.  Column names are Python attribute names on
    the model class, so a typo raises AttributeError at import/call time
    rather than a silent runtime KeyError.
    """
    with Session(engine) as session:
        stmt = select(model_class)
        for col_name, value in conditions.items():
            col = getattr(model_class, col_name)
            stmt = stmt.where(col.is_(None)) if value is None else stmt.where(col == value)
        rows = list(session.scalars(stmt).all())
        session.expunge_all()
        return rows


def delete_records_in_db[T](
    engine: Engine,
    model_class: type[T],
    conditions: dict[str, Any],
) -> int:
    """Delete rows from *model_class*'s table matching every condition.

    Each condition whose value is None generates an IS NULL check; others
    generate an equality check.

    Returns:
        int: The number of rows deleted.
    """
    logger.debug(f"Deleting records from '{model_class.__name__}' where {conditions}")
    with Session(engine) as session:
        stmt = delete(model_class)
        for col_name, value in conditions.items():
            col = getattr(model_class, col_name)
            stmt = stmt.where(col.is_(None)) if value is None else stmt.where(col == value)
        result = session.execute(stmt)
        session.commit()
        deleted_rows = result.rowcount
    logger.debug(f"Deleted {deleted_rows} rows from '{model_class.__name__}' where {conditions}")
    return deleted_rows


def find_errors_or_stuck_in_db[T: (ProjectTableEntry, SampleTableEntry, AssemblyTableEntry)](
    engine: Engine,
    model_class: type[T],
    time_threshold: int = 15,
) -> list[T]:
    """Return rows in HAS_ERRORS status or stuck in SUBMITTING > *time_threshold* minutes."""
    min_start_time = datetime.now(tz=pytz.utc) - timedelta(minutes=time_threshold)
    with Session(engine) as session:
        status_col = model_class.status
        started_at_col = model_class.started_at
        stmt = select(model_class).where(
            (status_col == str(Status.HAS_ERRORS))
            | ((status_col == str(Status.SUBMITTING)) & (started_at_col < min_start_time))
        )
        rows = list(session.scalars(stmt).all())
        session.expunge_all()
        return rows


def find_stuck_in_submission_db(
    engine: Engine,
    time_threshold: int = 48,
) -> list[SubmissionTableEntry]:
    """Return submission_table rows stuck in HAS_ERRORS_EXT_METADATA_UPLOAD."""
    min_start_time = datetime.now(tz=pytz.utc) - timedelta(hours=time_threshold)
    with Session(engine) as session:
        stmt = select(SubmissionTableEntry).where(
            SubmissionTableEntry.status_all == str(StatusAll.HAS_ERRORS_EXT_METADATA_UPLOAD),
            SubmissionTableEntry.started_at < min_start_time,
        )
        rows = list(session.scalars(stmt).all())
        session.expunge_all()
        return rows


def find_waiting_in_db(
    engine: Engine,
    time_threshold: int = 48,
) -> list[AssemblyTableEntry]:
    """Return rows stuck in WAITING status for longer than *time_threshold* hours."""
    min_start_time = datetime.now(tz=pytz.utc) - timedelta(hours=time_threshold)
    with Session(engine) as session:
        status_col = AssemblyTableEntry.status
        started_at_col = AssemblyTableEntry.started_at
        stmt = select(AssemblyTableEntry).where(
            (status_col == str(Status.WAITING)) & (started_at_col < min_start_time)
        )
        rows = list(session.scalars(stmt).all())
        session.expunge_all()
        return rows


def update_db_where_conditions[T](
    engine: Engine,
    model_class: type[T],
    conditions: Mapping[str, Any],
    update_values: dict[str, Any],
) -> int:
    """UPDATE rows in *model_class*'s table.

    Only rows that match *conditions* AND where at least one column in
    *update_values* would actually change are updated (IS DISTINCT FROM).
    Returns the number of rows updated.
    """
    updated_row_count = 0
    logger.debug(
        f"Updating '{model_class.__name__}' with conditions '{conditions}'"
        f" and values '{update_values}'"
    )
    try:
        with Session(engine) as session:
            stmt = update(model_class)
            for col_name, value in conditions.items():
                stmt = stmt.where(getattr(model_class, col_name) == value)
            # Only update when at least one value actually differs (avoids spurious rowcount=0)
            stmt = stmt.where(
                or_(
                    *[
                        getattr(model_class, col_name).is_distinct_from(value)
                        for col_name, value in update_values.items()
                    ]
                )
            )
            stmt = stmt.values(**update_values)
            result = session.execute(stmt)
            session.commit()
            updated_row_count = result.rowcount
    except Exception as e:
        logger.warning(f"update_db_where_conditions errored with: {e}")
    logger.debug(
        f"Updated {updated_row_count} rows in '{model_class.__name__}'"
        f" for conditions '{conditions}' and update values '{update_values}'"
    )
    return updated_row_count


def update_with_retry[T](
    db_config: Engine,
    conditions: Mapping[str, Any],
    model_class: type[T],
    update_values: dict[str, Any],
    reraise: bool = True,
) -> int:
    """Update the database with retry logic.

    *conditions* and *update_values* map column names to values.
    They are included in log messages to aid debugging.
    """

    def _do_update() -> int:
        number_rows_updated = update_db_where_conditions(
            db_config,
            model_class=model_class,
            conditions=conditions,
            update_values=update_values,
        )
        if number_rows_updated != 1:
            msg = f"{model_class.__name__} update failed"
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
            f"Updating {model_class.__name__} with conditions {conditions}"
            f" and values {update_values}"
        )
        result = retryer(_do_update)
        logger.info(
            f"{model_class.__name__} update succeeded for {conditions} with values {update_values}"
        )
        return result
    except Exception as e:
        error_msg = (
            f"{model_class.__name__} update failed for {conditions}"
            f" with values {update_values} after {number_of_retries} attempts."
        )
        logger.error(error_msg)
        if reraise:
            logger.error("Raising exception after retries failed")
            raise ValueError(error_msg) from e
        return 0


def add_to_project_table(engine: Engine, entry: ProjectTableEntry) -> int | None:
    """Insert *entry* into project_table and return the generated project_id."""
    entry.started_at = datetime.now(tz=pytz.utc)
    try:
        with Session(engine) as session:
            session.add(entry)
            session.flush()  # Sends INSERT; project_id is populated via RETURNING.
            project_id = entry.project_id
            session.commit()
        return project_id
    except Exception as e:
        logger.warning(f"add_to_project_table errored with: {e}")
        return None


def add_to_sample_table(engine: Engine, entry: SampleTableEntry) -> bool:
    """Insert *entry* into sample_table. Returns True on success."""
    entry.started_at = datetime.now(tz=pytz.utc)
    try:
        with Session(engine, expire_on_commit=False) as session:
            session.add(entry)
            session.commit()
        return True
    except Exception as e:
        logger.warning(f"add_to_sample_table errored with: {e}")
        return False


def add_to_assembly_table(engine: Engine, entry: AssemblyTableEntry) -> bool:
    """Insert *entry* into assembly_table. Returns True on success."""
    entry.started_at = datetime.now(tz=pytz.utc)
    try:
        with Session(engine, expire_on_commit=False) as session:
            session.add(entry)
            session.commit()
        return True
    except Exception as e:
        logger.warning(f"add_to_assembly_table errored with: {e}")
        return False


def in_submission_table(engine: Engine, conditions: dict[str, Any]) -> bool:
    """Return True if any row in submission_table matches *conditions*."""
    with Session(engine) as session:
        stmt = select(SubmissionTableEntry)
        for col_name, value in conditions.items():
            stmt = stmt.where(getattr(SubmissionTableEntry, col_name) == value)
        return session.scalar(stmt) is not None


def add_to_submission_table(engine: Engine, entry: SubmissionTableEntry) -> bool:
    """Insert *entry* into submission_table. Returns True on success."""
    entry.started_at = datetime.now(tz=pytz.utc)
    try:
        with Session(engine, expire_on_commit=False) as session:
            session.add(entry)
            session.commit()
        return True
    except Exception as e:
        logger.warning(f"add_to_submission_table errored with: {e}")
        return False


def is_revision(engine: Engine, seq_key: AccessionVersion) -> bool:
    """Return True if *seq_key* is the latest of multiple versions for its accession."""
    if seq_key.version == 1:
        return False
    rows = find_conditions_in_db(
        engine,
        SubmissionTableEntry,
        {"accession": seq_key.accession},
    )
    all_versions = sorted(row.version for row in rows)
    return len(all_versions) > 1 and seq_key.version == all_versions[-1]


def last_version(engine: Engine, seq_key: AccessionVersion) -> int | None:
    """Return the previous version number for *seq_key*, or None if not a revision."""
    if not is_revision(engine, seq_key):
        return None
    rows = find_conditions_in_db(
        engine,
        SubmissionTableEntry,
        {"accession": seq_key.accession},
    )
    all_versions = sorted(row.version for row in rows)
    return all_versions[-2]
