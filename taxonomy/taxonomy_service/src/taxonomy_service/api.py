import logging
import sqlite3
from collections.abc import Generator
from typing import Annotated

import uvicorn
from fastapi import Depends, FastAPI, HTTPException

from .config import Config

logger = logging.getLogger()

app = FastAPI(
    title="Taxonomy service", description="Loculus taxonomy API for hostname validation"
)


def get_db_connection() -> Generator[sqlite3.Connection]:
    conn = sqlite3.connect(
        f"file:{app.state.config.tax_db_path}?mode=ro",
        uri=True,
        check_same_thread=False,  # DB is read-only so this should be fine
    )
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


DbConnection = Annotated[sqlite3.Connection, Depends(get_db_connection)]


def fetch_by_sci_name(
    db_conn: sqlite3.Connection, name: str
) -> list[dict[str, str | int | None]] | None:
    """Check if a scientific name exists in the taxonomy and, if so, return all taxa associated
    with that name

    args:
        db_conn (sqlite3.Connection):   connection to a database. The caller is responsible
                                        for closing it
        name (str):                     scientific name to query the database with
    """
    taxa = db_conn.execute(
        "SELECT * FROM taxonomy WHERE scientific_name = ? COLLATE NOCASE", (name,)
    ).fetchall()

    if not taxa:
        return None

    return [dict(taxon) for taxon in taxa]


def fetch_by_id(
    db_conn: sqlite3.Connection, tax_id: int
) -> dict[str, str | int | None] | None:
    """Return the taxon associated with `tax_id`. Return None if `tax_id` does not exist in the DB

    args:
        db_conn (sqlite3.Connection):   connection to a database. The caller is responsible for closing it
        tax_id (int):                   NCBI taxon ID to query the database with
    """
    taxon = db_conn.execute(
        "SELECT * FROM taxonomy WHERE tax_id = ?", (tax_id,)
    ).fetchone()
    if not taxon:
        return None
    return dict(taxon)


def fetch_common_name(
    db_conn: sqlite3.Connection, tax_id: int
) -> dict[str, str | int | None] | None:
    """Return a taxon with a common name

    If the supplied `tax_id` is associated with a common name, return the taxon.

    If there is no common name associated with the taxon, keep stepping up the taxonomy until
    a taxon is found with a common name, and return that

    args:
        db_conn (sqlite3.Connection):   connection to a database. The caller is responsible for closing it
        tax_id (int):                   NCBI taxon ID of the taxon for which to find a common name
    """
    # creating a reusable cursor here instead of calling `fetch_by_id` in the while loop
    cursor = db_conn.cursor()
    while tax_id > 1:  # tax_id 1 is the root
        taxon = cursor.execute(
            "SELECT * FROM taxonomy WHERE tax_id = ?", (tax_id,)
        ).fetchone()
        if taxon is None or taxon["depth"] == 0:
            # for safety, break when depth is 0 (in case NCBI decide at some
            # point that the root should no longer be 1)
            break
        if taxon["common_name"] is not None:
            return dict(taxon)
        tax_id = taxon["parent_id"]

    return None


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Taxonomy service is running"}


@app.get("/ancestors")
def get_ancestors(query: int, targets: list[int], db: DbConnection) -> list[int]:
    hits = []

    # for t in targets:
    #     if q is_descendent(t):
    #         hits.append(t)

    return hits


@app.get("/taxa")
def query_taxa(
    scientific_name: str, db: DbConnection
) -> list[dict[str, str | int | None]] | None:
    """Given a scientific name, try to find all taxa associated with it."""
    taxa = fetch_by_sci_name(db, scientific_name)

    if taxa is None:
        raise HTTPException(status_code=404, detail=f"'{scientific_name}' not found")

    return taxa


@app.get("/taxa/{tax_id}")
def get_taxon(
    tax_id: int, db: DbConnection, find_common_name: bool = False
) -> dict[str, str | int | None]:
    if find_common_name:
        taxon = fetch_common_name(db, tax_id)
        if taxon is None:
            raise HTTPException(
                status_code=404, detail=f"Unable to find common name for taxon {tax_id}"
            )
        return taxon

    taxon = fetch_by_id(db, tax_id)
    if taxon is None:
        raise HTTPException(status_code=404, detail=f"'{tax_id}' not found")

    return taxon


def init_app(config: Config):
    app.state.config = config


def start_api(config: Config):
    init_app(config)
    host = config.tax_service_host or "127.0.0.1"
    port = config.tax_service_port or 5000
    logger.info(f"Starting taxonomy service API on port {port}")

    uvicorn_config = uvicorn.Config(
        app, host=host, port=port, log_level="info", workers=1
    )
    server = uvicorn.Server(uvicorn_config)

    server.run()
