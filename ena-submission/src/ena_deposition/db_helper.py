import os
from enum import Enum
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
