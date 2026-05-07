import logging
import sqlite3
from collections.abc import Generator
from typing import Annotated

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Response

from taxonomy_service.datatypes import SubtreeRequestBody, Taxon
from taxonomy_service.helpers import (
    ROOT_TAX_ID,
    convert_to_lineage_dict,
    fetch_by_id,
    fetch_by_sci_name,
    fetch_common_name,
    get_spanning_tree,
    lineage_dict_to_string,
    prune_tree,
)

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


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Taxonomy service is running"}


@app.get("/taxa")
def query_taxa(scientific_name: str, db: DbConnection) -> list[Taxon] | None:
    """Given a scientific name, find all taxa associated with it."""
    taxa = fetch_by_sci_name(db, scientific_name)

    if taxa is None:
        raise HTTPException(status_code=404, detail=f"'{scientific_name}' not found")

    return taxa


@app.get("/taxa/{tax_id}")
def get_taxon(
    tax_id: int,
    db: DbConnection,
    find_common_name: bool = False,
) -> Taxon:
    taxon = fetch_by_id(db, tax_id)
    if taxon is None:
        raise HTTPException(status_code=404, detail=f"'{tax_id}' not found")

    if find_common_name:
        taxon_with_common_name = fetch_common_name(db, taxon)
        if taxon_with_common_name is None:
            raise HTTPException(
                status_code=404,
                detail=f"Unable to find common name for taxon {tax_id}",
            )
        return taxon_with_common_name

    return taxon


@app.post("/silo-lineage")
def post_silo_lineage(
    payload: SubtreeRequestBody,
    db: DbConnection,
    prune: bool = False,
    allow_large: bool = False,
) -> Response:
    """Return a taxonomy based on the taxa provided in the request body
    The taxonomy is returned as a SILO-compatible yaml file.

    Args:
        prune: bool     If False, return a lineage that contains all provided tax_ids,
                        as well as all taxa on the path from the provided tax_ids to the root.
                        If True, return a lineage that only contains the provided tax_ids
                        (and root), but with the overall hierarchy preserved by connecting
                        the children of pruned taxa to the parent taxon.
        allow_large: bool
                        If False, return status 413 if the generated yaml file is
                        larger than `LARGE_FILE_THRESHOLD`
    """
    tax_ids = set(payload.tax_ids)
    if not tax_ids:
        return Response(content="{}\n", media_type="application/yaml")

    spanning_tree, missing_ids = get_spanning_tree(db, tax_ids)
    if missing_ids:
        logger.warning(
            f"one or more provided taxa don't exist "
            f"and will be attached to the root taxon: {sorted(missing_ids)}"
        )

    if prune:
        spanning_tree = prune_tree(
            spanning_tree, tax_ids | {ROOT_TAX_ID}, root_id=ROOT_TAX_ID
        )

    lineage = convert_to_lineage_dict(spanning_tree)
    for m in missing_ids:
        lineage[str(m)] = {
            "aliases": [f"Taxon {m}"],
            "parents": [f"{ROOT_TAX_ID}"],  # attach these to the root
        }

    lineage_yaml = lineage_dict_to_string(lineage, allow_large)
    return Response(content=lineage_yaml, media_type="application/yaml")


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
