from __future__ import annotations

from datetime import datetime

import pytz
from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_as_dataclass,
    mapped_column,
    registry,
    relationship,
)

from ena_deposition.db_helper import Status, StatusAll

mapper_registry = registry()


class Base(DeclarativeBase):
    pass


# -----------------------------
# project_table
# -----------------------------
@mapped_as_dataclass(mapper_registry)
class Project(Base):
    __tablename__ = "project_table"

    project_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    organism: Mapped[str] = mapped_column(Text, nullable=False)

    errors: Mapped[dict | None] = mapped_column(JSONB)
    warnings: Mapped[dict | None] = mapped_column(JSONB)

    status: Mapped[Status] = mapped_column(
        Enum(Status, name="status_enum", native_enum=True),
        nullable=False,
    )

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))

    result: Mapped[dict | None] = mapped_column(JSONB)

    center_name: Mapped[str | None] = mapped_column(Text)

    ena_first_publicly_visible: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ncbi_first_publicly_visible: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    submissions: Mapped[list[Submission]] = relationship(
        back_populates="project",
        cascade="save-update, merge",
        passive_deletes=False,
    )

    __table_args__ = (
        Index("idx_project_table_group_id", "group_id"),
        Index("idx_project_table_organism", "organism"),
    )

    def __init__(
        self,
        *,
        group_id: int,
        organism: str,
        center_name: str | None,
        status: Status = Status.READY,
        started_at: datetime | None = None,
        finished_at: datetime | None = None,
        result: dict | None = None,
    ):
        if not started_at:
            started_at = datetime.now(tz=pytz.utc)
        self.group_id = group_id
        self.organism = organism
        self.status = status
        self.started_at = started_at
        self.finished_at = finished_at
        self.result = result
        self.center_name = center_name


# -----------------------------
# submission_table
# -----------------------------
@mapped_as_dataclass(mapper_registry)
class Submission(Base):
    __tablename__ = "submission_table"

    accession: Mapped[str] = mapped_column(Text, primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    organism: Mapped[str] = mapped_column(Text, nullable=False)
    group_id: Mapped[int] = mapped_column(BigInteger, nullable=False)

    errors: Mapped[dict | None] = mapped_column(JSONB)
    warnings: Mapped[dict | None] = mapped_column(JSONB)

    status_all: Mapped[StatusAll] = mapped_column(
        Enum(StatusAll, name="status_all_enum", native_enum=True),
        nullable=False,
    )

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))

    # "metadata" is a reserved attribute name on Base, so map it as metadata_
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    unaligned_nucleotide_sequences: Mapped[dict | None] = mapped_column(JSONB)
    external_metadata: Mapped[dict | None] = mapped_column(JSONB)

    center_name: Mapped[str | None] = mapped_column(Text)

    project_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("project_table.project_id", name="fk_submission_project"),
    )

    project: Mapped[Project | None] = relationship(back_populates="submissions")

    def __init__(
        self,
        *,
        accession: str,
        version: int,
        organism: str,
        group_id: int,
        status_all: StatusAll = StatusAll.READY_TO_SUBMIT,
        started_at: datetime | None = None,
        metadata_: dict | None = None,
        unaligned_nucleotide_sequences: dict | None = None,
        external_metadata: dict | None = None,
        center_name: str | None = None,
        project_id: int | None = None,
    ):
        if not started_at:
            started_at = datetime.now(tz=pytz.utc)
        self.accession = accession
        self.version = version
        self.organism = organism
        self.group_id = group_id
        self.status_all = status_all
        self.started_at = started_at
        self.metadata_ = metadata_
        self.unaligned_nucleotide_sequences = unaligned_nucleotide_sequences
        self.external_metadata = external_metadata
        self.center_name = center_name
        self.project_id = project_id


# -----------------------------
# sample_table
# -----------------------------
@mapped_as_dataclass(mapper_registry)
class Sample(Base):
    __tablename__ = "sample_table"

    accession: Mapped[str] = mapped_column(Text, primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    errors: Mapped[dict | None] = mapped_column(JSONB)
    warnings: Mapped[dict | None] = mapped_column(JSONB)

    status: Mapped[Status] = mapped_column(
        Enum(Status, name="status_enum", native_enum=True),
        nullable=False,
    )

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))

    result: Mapped[dict | None] = mapped_column(JSONB)

    ena_first_publicly_visible: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ncbi_first_publicly_visible: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def __init__(
        self,
        *,
        accession: str,
        version: int,
        status: Status = Status.READY,
        started_at: datetime | None = None,
        finished_at: datetime | None = None,
        result: dict | None = None,
        ena_first_publicly_visible: datetime | None = None,
        ncbi_first_publicly_visible: datetime | None = None,
    ):
        if not started_at:
            started_at = datetime.now(tz=pytz.utc)
        self.accession = accession
        self.version = version
        self.status = status
        self.started_at = started_at
        self.finished_at = finished_at
        self.result = result
        self.ena_first_publicly_visible = ena_first_publicly_visible
        self.ncbi_first_publicly_visible = ncbi_first_publicly_visible


# -----------------------------
# assembly_table
# -----------------------------
@mapped_as_dataclass(mapper_registry)
class Assembly(Base):
    __tablename__ = "assembly_table"

    accession: Mapped[str] = mapped_column(Text, primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    errors: Mapped[dict | None] = mapped_column(JSONB)
    warnings: Mapped[dict | None] = mapped_column(JSONB)

    status: Mapped[Status] = mapped_column(
        Enum(Status, name="status_enum", native_enum=True),
        nullable=False,
    )

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))

    result: Mapped[dict | None] = mapped_column(JSONB)

    ena_nucleotide_first_publicly_visible: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    ncbi_nucleotide_first_publicly_visible: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    ena_gca_first_publicly_visible: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ncbi_gca_first_publicly_visible: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    def __init__(
        self,
        *,
        accession: str,
        version: int,
        status: Status = Status.READY,
        started_at: datetime | None = None,
        finished_at: datetime | None = None,
        result: dict | None = None,
        ena_nucleotide_first_publicly_visible: datetime | None = None,
        ncbi_nucleotide_first_publicly_visible: datetime | None = None,
        ena_gca_first_publicly_visible: datetime | None = None,
        ncbi_gca_first_publicly_visible: datetime | None = None,
    ):
        if not started_at:
            started_at = datetime.now(tz=pytz.utc)
        self.accession = accession
        self.version = version
        self.status = status
        self.started_at = started_at
        self.finished_at = finished_at
        self.result = result
        self.ena_nucleotide_first_publicly_visible = ena_nucleotide_first_publicly_visible
        self.ncbi_nucleotide_first_publicly_visible = ncbi_nucleotide_first_publicly_visible
        self.ena_gca_first_publicly_visible = ena_gca_first_publicly_visible
        self.ncbi_gca_first_publicly_visible = ncbi_gca_first_publicly_visible
