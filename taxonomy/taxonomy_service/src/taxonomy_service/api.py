from collections import defaultdict
import logging
import sqlite3
from collections.abc import Generator, Iterable
from typing import Annotated

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Response
import yaml

from taxonomy_service.datatypes import SubtreeRequestBody

from taxonomy_service.datatypes import Taxon

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


def fetch_by_sci_name(db_conn: sqlite3.Connection, name: str) -> list[Taxon] | None:
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

    return [Taxon.from_row(row) for row in taxa]


def fetch_by_id(db_conn: sqlite3.Connection, tax_id: int) -> Taxon | None:
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

    return Taxon.from_row(taxon)


def fetch_common_name(db_conn: sqlite3.Connection, taxon: Taxon) -> Taxon | None:
    """Return a taxon with a common name

    If the supplied `taxon` is associated with a common name, return the taxon.

    If there is no common name associated with the taxon, keep stepping up the taxonomy until
    a taxon is found with a common name, and return that

    args:
        db_conn (sqlite3.Connection):   connection to a database. The caller is responsible for closing it
        taxon (Taxon):                  Taxon for which to find a common name
    """
    if taxon.common_name is not None:
        return taxon

    # creating a reusable cursor here instead of calling `fetch_by_id` in the while loop
    cursor = db_conn.cursor()
    tax_id = taxon.parent_id
    while tax_id > 1:  # tax_id 1 is the root
        row = cursor.execute(
            "SELECT * FROM taxonomy WHERE tax_id = ?", (tax_id,)
        ).fetchone()
        if row is None:
            break

        taxon = Taxon.from_row(row)
        if taxon.depth == 0:
            # for safety, break when depth is 0 (in case NCBI decide at some
            # point that the root should no longer be 1)
            break
        if taxon.common_name is not None:
            return taxon

        tax_id = taxon.parent_id

    return None


def get_spanning_tree(db_conn: sqlite3.Connection, tax_ids: set[int]) -> list[Taxon]:
    """Run a recursive CTE against the database to collect the path
    from each taxon in tax_ids to the root node.

    Uses UNION to prevent having to evaluate parts of paths shared by
    several input taxa multiple times.
    """
    placeholders = ",".join("?" * len(tax_ids))
    rows = db_conn.execute(
        f"""
      WITH RECURSIVE ancestors AS (
          SELECT *
          FROM taxonomy WHERE tax_id IN ({placeholders})
          UNION
          SELECT t.*
          FROM taxonomy t JOIN ancestors a ON t.tax_id = a.parent_id
          WHERE t.tax_id != t.parent_id
      )
      SELECT * FROM ancestors
      ORDER BY depth, tax_id
    """,
        list(tax_ids),
    ).fetchall()

    return [Taxon.from_row(row) for row in rows]


def map_child_nodes(tree: list[Taxon]) -> dict[int, list[int]]:
    """Take a list of Taxons (each of which declares its parent) and
    return a dict that maps each Taxon's id to its children
    """
    children: dict[int, list[int]] = defaultdict(list)

    for taxon in tree:
        if taxon.tax_id != taxon.parent_id:
            children[taxon.parent_id].append(taxon.tax_id)
    for child_list in children.values():
        child_list.sort()

    return children


def prune_tree(
    tree: list[Taxon],
    keep_ids: set[int],
    root_id: int,
) -> list[Taxon]:
    """Return a list of Taxa pruned to `keep_ids`, rooted at `root_id`.
    Pruned taxa are skipped; their children reattach to the nearest kept ancestor
    to preserve the overall hierarchy.
    """
    indexed_by_id: dict[int, Taxon] = {t.tax_id: t for t in tree}
    children = map_child_nodes(tree)
    return list(_prune(indexed_by_id, keep_ids, children, root_id, root_id).values())


def _prune(
    tree_by_id: dict[int, Taxon],
    keep_ids: set[int],
    children: dict[int, list[int]],
    node_id: int,
    parent_in_output: int,
) -> dict[int, Taxon]:
    result: dict[int, Taxon] = {}

    current_taxon = tree_by_id[node_id]
    if current_taxon.tax_id in keep_ids:
        result[node_id] = current_taxon.model_copy(
            update={"parent_id": parent_in_output}
        )
        next_parent = current_taxon.tax_id
    else:
        next_parent = parent_in_output

    for child_id in children.get(node_id, []):
        result.update(_prune(tree_by_id, keep_ids, children, child_id, next_parent))

    return result


def convert_to_silo_yaml(taxa: Iterable[Taxon]) -> dict[str, dict]:
    """Generate a dict that can be dumped to a SILO-compatible yaml
    file representing the taxonomic hierarchy.
    """
    result: dict[str, dict] = {}

    for taxon in taxa:
        alias = f"Taxon {taxon.tax_id}: {taxon.scientific_name}"
        if taxon.common_name is not None:
            alias += f"; {taxon.common_name}"
        result[str(taxon.tax_id)] = {
            "aliases": [alias],
            "parents": [str(taxon.parent_id)]
            if taxon.tax_id != taxon.parent_id
            else [],
        }

    return result


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
def get_silo_lineage(
    payload: SubtreeRequestBody, db: DbConnection, prune: bool = False
) -> Response:
    taxon_ids = {1}  # always include the root node
    for i in payload.tax_ids:
        try:
            taxon_ids.add(int(i))
        except ValueError:
            raise HTTPException(
                status_code=400, detail=f"tax_ids must be numeric, got '{i}'"
            )

    spanning_tree = get_spanning_tree(db, taxon_ids)
    if prune:
        spanning_tree = prune_tree(spanning_tree, taxon_ids, root_id=1)
    lineage = convert_to_silo_yaml(spanning_tree)

    missing = (taxon_ids - {1}) - {int(k) for k in lineage}
    if missing:
        logger.warning(f"one or more requested taxa don't exist: {sorted(missing)}")
        for m in missing:
            lineage[str(m)] = {
                "aliases": [f"Taxon {m}"],
                "parents": ["1"],  # attach these directly to root node
            }

    return Response(
        content=yaml.dump(lineage, sort_keys=False), media_type="application/yaml"
    )


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
