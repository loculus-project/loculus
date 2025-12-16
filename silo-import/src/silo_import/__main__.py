from __future__ import annotations

import logging

from .config import ImporterConfig
from .paths import ImporterPaths
from .runner import run_forever

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)


def main() -> None:
    configure_logging()
    logger = logging.getLogger(__name__)
    config = ImporterConfig.from_env()
    logger.info(
        "Starting silo-import with config: hard_refresh_interval=%ds, poll_interval=%ds, silo_run_timeout=%ds",
        config.hard_refresh_interval,
        config.poll_interval,
        config.silo_run_timeout,
    )
    paths = ImporterPaths.from_root(config.root_dir)
    run_forever(config, paths)


if __name__ == "__main__":
    main()
