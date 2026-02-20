import io
import logging
import sqlite3
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import urljoin

import pandas as pd

logger = logging.getLogger(__name__)

NCBI_URL = "https://ftp.ncbi.nih.gov/pub/taxonomy/"
TAXONOMY_ARCHIVE = "taxdmp.zip"
# Ordering of ranks in nodes.dmp as per ChatGPT -- not authoritative
NCBI_RANK_ORDER = {
    # we will order from specific -> general, so
    # setting `no rank` to -1 means it will always come last
    "no rank": -1,
    # very high-level / viral and cellular roots
    "acellular root": 1,
    "cellular root": 2,
    "root": 3,  # sometimes appears in NCBI
    "superkingdom": 4,  # potentially, superkingdom and domain are synonyms in NCBI
    "domain": 5,
    "kingdom": 6,
    "subkingdom": 7,
    "superphylum": 8,
    "phylum": 9,
    "subphylum": 10,
    "superclass": 11,
    "class": 12,
    "subclass": 13,
    "infraclass": 14,
    "cohort": 15,
    "subcohort": 16,
    "superorder": 17,
    "order": 18,
    "suborder": 19,
    "infraorder": 20,
    "parvorder": 21,
    "superfamily": 22,
    "family": 23,
    "subfamily": 24,
    "tribe": 25,
    "subtribe": 26,
    "genus": 27,
    "subgenus": 28,
    # between genus and species
    "section": 29,
    "subsection": 30,
    "series": 31,
    "species group": 32,
    "species subgroup": 33,
    # species level and below
    "species": 34,
    "subspecies": 35,
    "varietas": 36,
    "subvariety": 37,
    "forma": 38,
    "forma specialis": 39,
    "strain": 40,
    "isolate": 41,
    "genotype": 42,
    "serogroup": 43,
    "serotype": 44,
    "biotype": 45,
    "pathogroup": 46,
    "morph": 47,
    # informal / flexible
    # "clade": 48,
}


def download_ncbi_archive(
    ftp_server: str = NCBI_URL, target_archive: str = TAXONOMY_ARCHIVE
) -> io.BytesIO:
    full_url = urljoin(ftp_server.rstrip("/") + "/", target_archive)
    logger.info(f"downloading NCBI taxonomy archive from: {full_url}")

    with urllib.request.urlopen(full_url) as response:
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
                engine="python",
                header=None,
            )
    logger.info(f"Extracted file '{target_file}' from archive")
    return df


def extract_names_df(archive: io.BytesIO) -> pd.DataFrame:
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
    df = (
        extract_ncbi_taxonomy_file(archive, "nodes.dmp")
        .rename(columns={0: "tax_id", 1: "parent_id", 2: "rank"})
        .astype({"tax_id": "int", "parent_id": "int", "rank": "category"})
        # entries with no/unrecognized ranks get assigned -1 -> 'no rank'
        .assign(rank_level=lambda x: x["rank"].map(NCBI_RANK_ORDER).fillna(-1))
        .loc[:, ["tax_id", "parent_id", "rank_level"]]
    )

    return df


def write_to_sqlite(df_names: pd.DataFrame, df_nodes: pd.DataFrame, output_db: Path) -> None:
    logger.info(f"saving NCBI taxonomic names to {output_db}")

    df_rank_levels = pd.DataFrame(list(NCBI_RANK_ORDER.items()), columns=["rank", "rank_level"])

    with sqlite3.connect(output_db) as conn:
        df_names.to_sql("tax_id_names_table", conn, if_exists="replace", index=False)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_scientific_name ON tax_id_names_table(scientific_name);"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tax_id_names ON tax_id_names_table(tax_id);")

        df_nodes.to_sql("parent_mappings_table", conn, if_exists="replace", index=False)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tax_id_pmap ON parent_mappings_table(tax_id);")

        df_rank_levels.to_sql("rank_levels_table", conn, if_exists="replace", index=False)

    logger.info("successfully created database")
