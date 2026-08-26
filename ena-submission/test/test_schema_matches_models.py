"""
Verifies that the SQLAlchemy ORM models in submission_db_helper.py match the
actual database schema produced by the flyway migrations in flyway/sql/.

Requires a running Postgres instance with the ena-submission schema migrated,
see test_ena_submission_integration.py for how to set one up:

docker run --name test-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=unsecure \
    -e POSTGRES_DB=loculus -p 5432:5432 -d postgres
flyway -url=jdbc:postgresql://localhost:5432/loculus -schemas=ena_deposition_schema \
    -user=postgres -password=unsecure -locations=filesystem:./flyway/sql migrate
"""

# ruff: noqa: S101 (allow asserts in tests)

from typing import Any

from ena_deposition.config import get_config
from ena_deposition.submission_db_helper import Base, db_init
from sqlalchemy import MetaData, Table
from sqlalchemy.types import JSON, Boolean, DateTime, Integer, String, TypeEngine

CONFIG_FILE = "./test/test_config.yaml"
SCHEMA = "ena_deposition_schema"


# Broad base classes rather than exact types
# e.g. flyway's TEXT and SQLAlchemy's default VARCHAR (used for
# Enum(native_enum=False)) count as equivalent.
_TYPE_CATEGORIES: tuple[tuple[type[TypeEngine[Any]], str], ...] = (
    (JSON, "json"),
    (Boolean, "boolean"),
    (DateTime, "datetime"),
    (Integer, "integer"),
    (String, "string"),
)


def _type_category(type_: TypeEngine[Any]) -> str:
    return next(
        (name for base, name in _TYPE_CATEGORIES if isinstance(type_, base)),
        type_.__class__.__name__.lower(),
    )


def _compare_table(orm_table: Table, db_table: Table) -> list[str]:
    mismatches: list[str] = []

    orm_columns = {c.name: c for c in orm_table.columns}
    db_columns = {c.name: c for c in db_table.columns}

    missing_in_db = orm_columns.keys() - db_columns.keys()
    if missing_in_db:
        mismatches.append(f"columns defined in ORM but missing in DB: {sorted(missing_in_db)}")
    extra_in_db = db_columns.keys() - orm_columns.keys()
    if extra_in_db:
        mismatches.append(f"columns in DB but not defined in ORM: {sorted(extra_in_db)}")

    for name in sorted(orm_columns.keys() & db_columns.keys()):
        orm_col = orm_columns[name]
        db_col = db_columns[name]

        orm_category = _type_category(orm_col.type)
        db_category = _type_category(db_col.type)
        if orm_category != db_category:
            mismatches.append(
                f"column '{name}': type category mismatch "
                f"(ORM: {orm_col.type} -> {orm_category}, DB: {db_col.type} -> {db_category})"
            )
        elif orm_category == "datetime":
            orm_tz = bool(getattr(orm_col.type, "timezone", False))
            db_tz = bool(getattr(db_col.type, "timezone", False))
            if orm_tz != db_tz:
                mismatches.append(
                    f"column '{name}': timezone-awareness mismatch "
                    f"(ORM timezone={orm_tz}, DB timezone={db_tz})"
                )

        # Server-generated (autoincrement) primary keys are declared
        # nullable=True on the ORM side (the value isn't known until
        # insert) even though the DB enforces NOT NULL.
        is_autoincrement_pk = orm_col.primary_key and orm_col.autoincrement is True
        if not is_autoincrement_pk and orm_col.nullable != db_col.nullable:
            mismatches.append(
                f"column '{name}': nullable mismatch "
                f"(ORM nullable={orm_col.nullable}, DB nullable={db_col.nullable})"
            )

    orm_pk = {c.name for c in orm_table.primary_key.columns}
    db_pk = {c.name for c in db_table.primary_key.columns}
    if orm_pk != db_pk:
        mismatches.append(f"primary key mismatch (ORM: {sorted(orm_pk)}, DB: {sorted(db_pk)})")

    orm_fks = {
        (fk.parent.name, fk.column.table.name, fk.column.name) for fk in orm_table.foreign_keys
    }
    db_fks = {
        (fk.parent.name, fk.column.table.name, fk.column.name) for fk in db_table.foreign_keys
    }
    if orm_fks != db_fks:
        mismatches.append(f"foreign key mismatch (ORM: {orm_fks}, DB: {db_fks})")

    orm_indexes = {(ix.name, tuple(sorted(c.name for c in ix.columns))) for ix in orm_table.indexes}
    db_indexes = {(ix.name, tuple(sorted(c.name for c in ix.columns))) for ix in db_table.indexes}
    if orm_indexes != db_indexes:
        mismatches.append(f"index mismatch (ORM: {orm_indexes}, DB: {db_indexes})")

    return mismatches


def test_orm_models_match_flyway_schema() -> None:
    """The ORM models in submission_db_helper.py are hand-maintained rather than
    generated from the flyway migrations, so nothing stops them from drifting
    apart. This reflects the actual (migrated) DB schema and diffs it against
    `Base.metadata` to catch that drift."""
    config = get_config(CONFIG_FILE)
    engine = db_init(config.db_password, config.db_username, config.db_url)

    db_metadata = MetaData()
    db_metadata.reflect(bind=engine, schema=SCHEMA)

    failures: dict[str, list[str]] = {}
    orm_tables = {t.name: t for t in Base.metadata.tables.values()}
    db_table_names = {key.split(".", 1)[1] for key in db_metadata.tables} - {
        "flyway_schema_history"
    }
    for extra in sorted(db_table_names - orm_tables.keys()):
        failures[extra] = [f"table '{extra}' exists in DB {SCHEMA} but is not defined in the ORM"]
    for orm_table in orm_tables.values():
        table_name = orm_table.name
        db_table_key = f"{SCHEMA}.{table_name}"
        if db_table_key not in db_metadata.tables:
            failures[table_name] = [f"table '{table_name}' defined in ORM but missing in DB"]
            continue
        mismatches = _compare_table(orm_table, db_metadata.tables[db_table_key])
        if mismatches:
            failures[table_name] = mismatches

    engine.dispose()

    assert not failures, "\n".join(
        f"{table}:\n  " + "\n  ".join(issues) for table, issues in failures.items()
    )
