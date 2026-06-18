from __future__ import annotations

import logging
import os

from .config import ImporterConfig
from .overview import OverviewImporterConfig, run_overview_forever
from .paths import ImporterPaths
from .runner import run_forever

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"

logger = logging.getLogger(__name__)


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)


def main() -> None:
    configure_logging()
    if os.environ.get("SILO_IMPORT_MODE") == "overview":
        overview_config = OverviewImporterConfig.from_env()
        logger.info(f"Overview importer configuration: {overview_config}")
        paths = ImporterPaths.from_root(
            overview_config.root_dir,
            overview_config.silo_binary,
            overview_config.preprocessing_config,
        )
        run_overview_forever(overview_config, paths)
        return

    importer_config = ImporterConfig.from_env()
    logger.info(f"Importer configuration: {importer_config}")
    paths = ImporterPaths.from_root(
        importer_config.root_dir,
        importer_config.silo_binary,
        importer_config.preprocessing_config,
    )
    run_forever(importer_config, paths)


if __name__ == "__main__":
    main()
