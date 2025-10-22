from dataclasses import dataclass
import os
from enum import StrEnum
from urllib.parse import quote_plus

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine


def db_init(db_password_default: str, db_username_default: str, db_url_default: str) -> Engine:
    db_password = os.getenv("DB_PASSWORD", db_password_default)
    db_username = os.getenv("DB_USERNAME", db_username_default)
    db_url = os.getenv("DB_URL", db_url_default)

    # Convert JDBC-like URL → SQLAlchemy-compatible DSN
    # Example JDBC: jdbc:postgresql://host:port/dbname
    # Should become: postgresql+psycopg://user:pass@host:port/dbname
    sqlalchemy_url = db_url.replace("jdbc:", "").replace("postgresql:", "postgresql+psycopg:")
    sqlalchemy_url = sqlalchemy_url.replace(
        "postgresql+psycopg://", f"postgresql+psycopg://{db_username}:{quote_plus(db_password)}@"
    )
    sqlalchemy_url += "?options=-csearch_path%3Dena_deposition_schema"

    return create_engine(
        sqlalchemy_url,
        pool_size=2,
        max_overflow=0,  # disallow extra connections beyond pool_size
        pool_pre_ping=True,  # automatically test connections
        pool_recycle=1800,  # recycle connections every 30min
    )


@dataclass
class AccessionVersion:
    accession: str
    version: int


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
