import logging
import sys

from .ncbi import (
    df_names_to_sqlite,
    download_ncbi_archive,
    extract_ncbi_taxonomy_file,
    format_names_df,
)

logger = logging.getLogger(__name__)


def run() -> None:
    logging.basicConfig(level=logging.INFO)

    try:
        archive = download_ncbi_archive()
        df_names = extract_ncbi_taxonomy_file(archive, "names.dmp")
        df_names_reformat = format_names_df(df_names)
        df_names_to_sqlite(df_names_reformat, "tests/ncbi_scientific_names.sql")
    except:
        logger.exception("NCBI taxonomy download pipeline failed")
        sys.exit(1)


if __name__ == "__main__":
    run()
