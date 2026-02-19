import io
import logging
import sqlite3
import urllib.request
import zipfile
from urllib.parse import urljoin

import pandas as pd

logger = logging.getLogger(__name__)

NCBI_URL = "https://ftp.ncbi.nih.gov/pub/taxonomy/"
TAXONOMY_ARCHIVE = "taxdmp.zip"


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


def extract_ncbi_taxonomy_file(archive: io.BytesIO, target_file: str = "names.dmp") -> pd.DataFrame:
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


def format_names_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={0: "tax_id", 1: "name_txt", 3: "name_class"}).loc[
        :, ["tax_id", "name_txt", "name_class"]
    ]
    return (
        df.loc[df["name_class"] == "scientific name", ["tax_id", "name_txt"]]
        .drop_duplicates()
        .reset_index(drop=True)
    )


def df_names_to_sqlite(df: pd.DataFrame, output_db: str) -> None:
    logger.info(f"saving NCBI taxonomic names to {output_db}")
    with sqlite3.connect(output_db) as conn:
        df.to_sql("scientific_names", conn, if_exists="replace", index=False)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_name_txt ON scientific_names(name_txt);")
    logger.info("successfully wrote scientific_names table")
