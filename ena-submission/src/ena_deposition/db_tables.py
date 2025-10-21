from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


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
class Submission(Base):
    __tablename__ = "submission_table"

    accession: Mapped[str] = mapped_column(Text, primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    organism: Mapped[str] = mapped_column(Text, nullable=False)
    group_id: Mapped[int] = mapped_column(BigInteger, nullable=False)

    errors: Mapped[dict | None] = mapped_column(JSONB)
    warnings: Mapped[dict | None] = mapped_column(JSONB)

    status_all: Mapped[str] = mapped_column(Text, nullable=False)

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
