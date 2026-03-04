import io
import logging
import sqlite3
import urllib.request
import zipfile
from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

NCBI_TAXONOMY_ARCHIVE = "https://ftp.ncbi.nih.gov/pub/taxonomy/taxdmp.zip"


def download_ncbi_archive(taxonomy_url: str = NCBI_TAXONOMY_ARCHIVE) -> io.BytesIO:
    logger.info(f"downloading NCBI taxonomy archive from: {taxonomy_url}")

    with urllib.request.urlopen(taxonomy_url, timeout=300) as response:
        zip_bytes = io.BytesIO(
            response.read()
        )  # read the whole archive into memory (it's around 69M)

    logger.info("successfully downloaded NCBI taxonomy archive")
    return zip_bytes


def extract_ncbi_taxonomy_file(archive: io.BytesIO, target_file: str) -> pd.DataFrame:
    with zipfile.ZipFile(archive) as z:
        if target_file not in z.namelist():
            msg = f"{target_file} does not exist in NCBI archive"
            raise FileNotFoundError(msg)
        with z.open(target_file) as f:
            df = pd.read_csv(
                f,
                sep=r"\s*\|\s*",
                engine="python",  # need to use Python engine to do regex separator
                header=None,
            )
    logger.info(f"Extracted file '{target_file}' from archive")
    return df


def extract_names_df(archive: io.BytesIO) -> pd.DataFrame:
    """Extract 'names.dmp' from the NCBI taxonomy archive into a pd.DataFrame
    Columns in the output df are:
    - tax_id (int):             the NCBI taxon ID for this entry
    - common_name (str):        '; ' separated common names for this taxon, sorted alphabetically
                                    (taxa can have multiple common names)
    - scientific_name (str):    the scientific name for this taxon
    """
    df = (
        extract_ncbi_taxonomy_file(archive, "names.dmp")
        .rename(columns={0: "tax_id", 1: "name_txt", 3: "name_class"})
        .loc[:, ["tax_id", "name_txt", "name_class"]]
    )

    df = df[df["name_class"].isin({"scientific name", "common name", "genbank common name"})]
    df["name_class"] = (
        df["name_class"].replace("genbank common name", "common name").astype("category")
    )

    df_wide = (
        df.pivot_table(
            index="tax_id",
            values="name_txt",
            columns="name_class",
            aggfunc=lambda x: "; ".join(sorted(x)),
        )
        .reset_index()
        .rename(columns={"scientific name": "scientific_name", "common name": "common_name"})
    )

    df_wide.columns.name = None

    return df_wide


def extract_nodes_df(archive: io.BytesIO) -> pd.DataFrame:
    """Extract 'nodes.dmp' from the NCBI taxonomy archive into a pd.DataFrame
    Columns in the output df are:
    - tax_id (int):     the NCBI taxon ID for this entry
    - parent_id (int):  the NCBI taxon ID for this entry's parent in the taxonomy
    """
    df = (
        extract_ncbi_taxonomy_file(archive, "nodes.dmp")
        .rename(columns={0: "tax_id", 1: "parent_id"})
        .astype({"tax_id": "int", "parent_id": "int"})
        .loc[:, ["tax_id", "parent_id"]]
    )

    return df


def add_tree_depth(df: pd.DataFrame, root_id: int):
    if df.columns.equals(["tax_id", "parent_id"]):
        raise ValueError(
            f"Expected pd.DataFrame with columns '['tax_id', 'parent_id']', got '{df.columns}'"
        )
    if not df["tax_id"].nunique() == df.shape[0]:
        raise ValueError("At least one tax_id has multiple parents, this should not be possible")

    # Build a directed graph from the dataframe
    # Include all tax_ids, but since the root is specified as
    # it's own parent in nodes.dmp, we exclude that edge to avoid cycles
    G = nx.DiGraph()
    G.add_nodes_from(df["tax_id"])
    G.add_edges_from(
        df[df["tax_id"] != root_id][["parent_id", "tax_id"]].itertuples(index=False, name=None)
    )

    depth_map: dict[int, int] = nx.single_source_shortest_path_length(G, root_id)

    df["depth"] = df["tax_id"].map(depth_map).fillna(-1).astype(int)


def create_taxonomy_df(archive: io.BytesIO) -> pd.DataFrame:
    df_names = extract_names_df(archive)
    df_nodes = extract_nodes_df(archive)
    add_tree_depth(df_nodes, root_id=1)
    if df_nodes[df_nodes["depth"] == -1].shape[0] > 0:
        raise ValueError("nodes.dmp contains orphan nodes, this should not happen")

    df_taxonomy = df_names.merge(df_nodes, on="tax_id", how="inner")
    if df_taxonomy.shape[0] < df_names.shape[0]:
        logger.warning("One or more taxa had no parent in the taxonomy and were dropped")

    return df_taxonomy


def write_to_sqlite(df: pd.DataFrame, output_db: Path) -> None:
    logger.info(f"saving NCBI taxonomy to {output_db}")

    with sqlite3.connect(output_db) as conn:
        df.to_sql("taxonomy", conn, if_exists="replace", index=False)

        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_id ON taxonomy(tax_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_parent_id ON taxonomy(parent_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_scientific_name ON taxonomy(scientific_name);")

        conn.execute("ANALYZE;")

    logger.info("successfully created database")
