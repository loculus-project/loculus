import logging
import sys

from .ncbi import (
    write_to_sqlite,
    download_ncbi_archive,
    extract_names_df,
    extract_nodes_df,
)

logger = logging.getLogger(__name__)


def run() -> None:
    logging.basicConfig(level=logging.INFO)

    try:
        archive = download_ncbi_archive()
        df_names = extract_names_df(archive)
        df_nodes = extract_nodes_df(archive)

        df_names = df_names.merge(
            df_nodes.loc[:, ["tax_id", "rank_level"]], on="tax_id", how="left"
        )
        df_nodes = df_nodes.drop("rank_level", axis=1)

        write_to_sqlite(df_names, df_nodes, "tests/ncbi_scientific_names.sqlite")
    except:
        logger.exception("NCBI taxonomy download pipeline failed")
        sys.exit(1)


if __name__ == "__main__":
    run()
