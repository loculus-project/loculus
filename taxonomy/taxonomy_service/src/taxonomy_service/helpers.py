import sqlite3
from collections import defaultdict
from collections.abc import Iterable

import yaml
from fastapi import HTTPException

from taxonomy_service.datatypes import Taxon

# LAPIS/SILO uses Jackson to parse YAML files, which by default sets a limit of 3MB
# If we send a lineage file over the limit to SILO it will crash and take down the
# instance, so for large files we send back status 413 instead.
LARGE_FILE_THRESHOLD = 2.5 * 1024 * 1024
ROOT_TAX_ID = 1


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
    while tax_id > ROOT_TAX_ID:
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


def find_existing_ids(db_conn: sqlite3.Connection, tax_ids: set[int]) -> set[int]:
    """Take in a set of unvalidated tax_ids and return the ones
    that exist in the database
    """
    if not tax_ids:
        return set()

    placeholders = ",".join("?" * len(tax_ids))
    existing = {
        row["tax_id"]
        for row in db_conn.execute(
            f"SELECT tax_id FROM taxonomy WHERE tax_id IN ({placeholders})",
            list(tax_ids),
        ).fetchall()
    }

    return existing


def get_spanning_tree(
    db_conn: sqlite3.Connection, tax_ids: set[int]
) -> tuple[list[Taxon], set[int]]:
    """Run a recursive CTE against the database to collect the path
    from each taxon in tax_ids to the taxonomic root

    args:
        db_conn: sqlite3.Connection:
                        Connection to the database
        tax_ids: set[int]
                        A set of taxon identifiers to build a spanning tree for

    returns:
        list[Taxon]:    The taxonomic tree spanning all input tax_ids, represented
                        as a list of taxa
        set[int]:       Taxon ids in `tax_ids` that do not exist in the database
    """
    existing_ids = find_existing_ids(db_conn, tax_ids)
    if not existing_ids:
        return [], tax_ids
    existing_ids = {ROOT_TAX_ID} | existing_ids  # always include the root node
    missing_ids = tax_ids - existing_ids

    placeholders = ",".join("?" * len(existing_ids))
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
        list(existing_ids),
    ).fetchall()

    return [Taxon.from_row(row) for row in rows], missing_ids


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
    parent_id_after_prune: int,
) -> dict[int, Taxon]:
    """Recursively walk the subtree rooted at `node_id`, keeping only taxa in `keep_ids`.

    Kept taxa are emitted with their `parent_id` rewritten to `parent_id_after_prune` (the
    nearest kept ancestor in the output), so the children of skipped taxa reattach to
    that ancestor and the overall hierarchy is preserved.

    args:
      tree_by_id (dict[int, Taxon]):  all taxa in the spanning tree, indexed by tax_id
      keep_ids (set[int]):            tax_ids that should appear in the output
      children (dict[int, list[int]]):
                                      map of tax_id -> list of child tax_ids
      node_id (int):                  tax_id of the node currently being visited
      parent_id_after_prune (int):    tax_id of the nearest kept ancestor; used as the
                                      rewritten parent_id when `node_id` is kept
    """
    result: dict[int, Taxon] = {}

    current_taxon = tree_by_id[node_id]
    if current_taxon.tax_id in keep_ids:
        result[node_id] = current_taxon.model_copy(
            update={"parent_id": parent_id_after_prune}
        )
        next_parent = current_taxon.tax_id
    else:
        next_parent = parent_id_after_prune

    for child_id in children.get(node_id, []):
        result.update(_prune(tree_by_id, keep_ids, children, child_id, next_parent))

    return result


def convert_to_lineage_dict(taxa: Iterable[Taxon]) -> dict[str, dict]:
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


def lineage_dict_to_string(lineage: dict[str, dict], allow_large: bool) -> str:
    """Generates a yaml string representation of a lineage dictionary and
    checks its size.

    If the size is > LARGE_FILE_THRESHOLD and allow_large is false, raise
    a 413 HTTPException
    """
    lineage_yaml = yaml.dump(lineage, sort_keys=False)
    yaml_size = len(lineage_yaml.encode("utf-8"))
    if yaml_size > LARGE_FILE_THRESHOLD and not allow_large:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Generated lineage file is {yaml_size / 1024 / 1024:.2f}MB, "
                f"larger than the default limit of {LARGE_FILE_THRESHOLD / 1024 / 1024:.2f}MB. "
                f"Retry request with `allow_large=true` to get the full file"
            ),
        )

    return lineage_yaml
