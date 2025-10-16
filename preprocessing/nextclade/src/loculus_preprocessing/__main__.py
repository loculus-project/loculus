import logging

from .config import get_config
from .logging_config import configure_logging
from .prepro import run

logger = logging.getLogger(__name__)


def cli_entry() -> None:
    configure_logging(level=logging.INFO)

    config = get_config()

    logging.getLogger().setLevel(config.log_level)

    logger.info(f"Using config: {config}")

    run(config)


if __name__ == "__main__":
    cli_entry()
