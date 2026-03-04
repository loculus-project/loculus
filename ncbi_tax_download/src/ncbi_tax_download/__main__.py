import argparse
import logging
from pathlib import Path
import sys

from .ncbi import (
    create_taxonomy_df,
    write_to_sqlite,
    download_ncbi_archive,
)

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "-o", "--output_db", required=True, type=Path, help="Name to use for the output database"
    )

    return parser.parse_args()


def run() -> None:
    logging.basicConfig(level=logging.INFO)

    args = parse_args()
    args.output_db.parent.mkdir(parents=True, exist_ok=True)

    try:
        archive = download_ncbi_archive()
        df_taxonomy = create_taxonomy_df(archive)
        write_to_sqlite(df_taxonomy, args.output_db)
    except Exception:
        logger.exception("NCBI taxonomy download pipeline failed")
        sys.exit(1)


if __name__ == "__main__":
    run()
