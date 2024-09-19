import os
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

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
        maxconn=4,  # max 7*4 connections to db allowed
        dbname="loculus",
        user=db_username,
        host=db_host,
        password=db_password,
        options="-c search_path=ena-submission",
    )


class Status(Enum):
    READY = 0
    SUBMITTING = 1
    SUBMITTED = 2
    HAS_ERRORS = 3
    WAITING = 4  # Only for assembly creation

    def __str__(self):
        return self.name


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


def get_bio_sample_accessions(db_conn_pool: SimpleConnectionPool) -> dict[str, str]:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            # Result is a jsonb column
            query = "SELECT accession, result FROM sample_table WHERE STATUS = 'SUBMITTED'"

            cur.execute(query)

            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    return {result["accession"]: result["result"]["biosample_accession"] for result in results}


def get_insdc_accessions(db_conn_pool: SimpleConnectionPool) -> dict[str, str]:
    con = db_conn_pool.getconn()
    try:
        with con, con.cursor(cursor_factory=RealDictCursor) as cur:
            # Result is a jsonb column
            query = "SELECT accession, result FROM assembly_table WHERE STATUS = 'SUBMITTED'"

            cur.execute(query)

            results = cur.fetchall()
    finally:
        db_conn_pool.putconn(con)

    return {
        result["accession"]: [
            result["result"][key] for key in result["result"] if key.startswith("insdc_accession")
        ]
        for result in results
    }
