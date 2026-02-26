import argparse
import logging
from pathlib import Path
import sys

from .ncbi import (
    create_taxonomy_df,
    write_to_sqlite,
    download_ncbi_archive,
    extract_names_df,
    extract_nodes_df,
)

logger = logging.getLogger(__name__)


def parse_cl() -> argparse.Namespace:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "-o", "--output_db", required=True, type=Path, help="Name to use for the output database"
    )

    return parser.parse_args()


def run() -> None:
    logging.basicConfig(level=logging.INFO)

    args = parse_cl()
    parent = args.output_db.parent if args.output_db.parent != Path("") else Path(".")
    if not parent.exists():
        raise FileNotFoundError(f"directory {parent} does not exist.")

    try:
        archive = download_ncbi_archive()
        df_taxonomy = create_taxonomy_df(archive)
        write_to_sqlite(df_taxonomy, args.output_db)
    except:
        logger.exception("NCBI taxonomy download pipeline failed")
        sys.exit(1)


if __name__ == "__main__":
    run()
