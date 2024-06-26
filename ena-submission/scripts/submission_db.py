import psycopg2
from psycopg2 import sql
from enum import Enum


class StatusAll(Enum):
    READY_TO_SUBMIT = 0
    SUBMITTING_PROJECT = 1
    SUBMITTING_SAMPLE = 2
    SUBMITTING_ASSEMBLY = 3
    SUBMITTED_ALL = 4
    SENT_TO_LOCULUS = 5
    HAS_ERRORS_PROJECT = 6
    HAS_ERRORS_ASSEMBLY = 7
    HAS_ERRORS_SAMPLE = 8


class Status(Enum):
    READY = 0
    SUBMITTING = 1
    SUBMITTED = 2
    HAS_ERRORS = 3


def connect_to_db(username="postgres", password="unsecure", host="127.0.0.1"):
    """
    Establish connection to ena_submitter DB, if DB doesn't exist create it.
    """
    try:
        con = psycopg2.connect(
            dbname="ena_submitter",
            user=username,
            host=host,
            password=password,
        )
    except:
        # Create database if it does not yet exist
        try:
            con = psycopg2.connect(
                dbname="postgres",
                user=username,
                host=host,
                password=password,
            )

            con.autocommit = True

            cursor = con.cursor()
            sql = """ CREATE database ena_submitter """
            cursor.execute(sql)
            print("Created database ena_submitter")
        except ConnectionError as e:
            raise ConnectionError("Could not create ena_submitter DB") from e
    return con


def table_exists(cur, table):
    cur.execute(
        "select * from information_schema.tables where table_name=%s", (f"{table}",)
    )
    return bool(cur.rowcount)


def create_submission_table(con):
    cur = con.cursor()

    if not table_exists(cur, "submission_table"):
        cur.execute("""CREATE TABLE submission_table (
            accession text not null,
            version bigint not null,
            groupId bigint not null,
            errors jsonb,
            warnings jsonb,
            status_all text not null,
            started_at timestamp not null,
            finished_at timestamp,
            external_metadata jsonb,
            primary key (accession, version)
            );""")

        cur.close()
        con.commit()


def create_project_table(con):
    cur = con.cursor()

    if not table_exists(cur, "project_table"):
        cur.execute("""CREATE TABLE project_table (
            groupId bigint not null,
            errors jsonb,
            warnings jsonb,
            status text not null,
            started_at timestamp not null,
            finished_at timestamp,
            project_metadata jsonb,
            primary key (groupId)
            );""")

        cur.close()
        con.commit()


def create_sample_table(con):
    cur = con.cursor()

    if not table_exists(cur, "sample_table"):
        cur.execute("""CREATE TABLE sample_table (
            accession text not null,
            version bigint not null,
            errors jsonb,
            warnings jsonb,
            status text not null,
            started_at timestamp not null,
            finished_at timestamp,
            sample_metadata jsonb,
            primary key (accession, version)
            );""")

        cur.close()
        con.commit()


def create_assembly_table(con):
    cur = con.cursor()

    if not table_exists(cur, "assembly_table"):
        cur.execute("""CREATE TABLE assembly_table (
            accession text not null,
            version bigint not null,
            errors jsonb,
            warnings jsonb,
            status text not null,
            started_at timestamp not null,
            finished_at timestamp,
            assembly_metadata jsonb,
            primary key (accession, version)
            );""")

        cur.close()
        con.commit()


def init():
    ## Connect to ena_submission DB and create DB and tables if they do not already exist.
    con = connect_to_db()
    create_submission_table(con)
    create_project_table(con)
    create_sample_table(con)
    create_assembly_table(con)

    con.close()


def in_submission_table(accession, version) -> bool:
    con = connect_to_db()
    cur = con.cursor()
    cur.execute(
        "select * from submission_table where accession=%s and version=%s",
        (f"{accession}", f"{version}"),
    )
    return bool(cur.rowcount)


def add_to_submission_table(entry):
    print("added")


if __name__ == "__main__":
    init()
