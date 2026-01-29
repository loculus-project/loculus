from __future__ import annotations

import logging

from .config import ImporterConfig
from .paths import ImporterPaths
from .runner import run_forever

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"

logger = logging.getLogger(__name__)


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)


def main() -> None:
    configure_logging()
    config = ImporterConfig.from_env()
    logger.info(f"Importer configuration: {config}")
    paths = ImporterPaths.from_root(
        config.root_dir, config.silo_binary, config.preprocessing_config
    )
    run_forever(config, paths)


if __name__ == "__main__":
    main()
