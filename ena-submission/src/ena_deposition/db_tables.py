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

from ena_deposition.db_helper import StatusAll

mapper_registry = registry()


class Base(DeclarativeBase):
    pass


# -----------------------------
# project_table
# -----------------------------
class Project(Base):
    __tablename__ = "project_table"

    project_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    organism: Mapped[str] = mapped_column(Text, nullable=False)

    errors: Mapped[dict | None] = mapped_column(JSONB)
    warnings: Mapped[dict | None] = mapped_column(JSONB)

    status: Mapped[str] = mapped_column(Text, nullable=False)

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
        Enum(StatusAll, name="status_all_enum", native_enum=True),  # <— key line
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
class Sample(Base):
    __tablename__ = "sample_table"

    accession: Mapped[str] = mapped_column(Text, primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    errors: Mapped[dict | None] = mapped_column(JSONB)
    warnings: Mapped[dict | None] = mapped_column(JSONB)

    status: Mapped[str] = mapped_column(Text, nullable=False)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))

    result: Mapped[dict | None] = mapped_column(JSONB)

    ena_first_publicly_visible: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ncbi_first_publicly_visible: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# -----------------------------
# assembly_table
# -----------------------------
class Assembly(Base):
    __tablename__ = "assembly_table"

    accession: Mapped[str] = mapped_column(Text, primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    errors: Mapped[dict | None] = mapped_column(JSONB)
    warnings: Mapped[dict | None] = mapped_column(JSONB)

    status: Mapped[str] = mapped_column(Text, nullable=False)

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
