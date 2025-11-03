import logging

from .config import get_config
from .prepro import run

logger = logging.getLogger(__name__)


def cli_entry() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format='[%(request_id)s] %(levelname)s - %(name)s - %(message)s',
        defaults={'request_id': 'N/A'}
    )

    config = get_config()

    logging.getLogger().setLevel(config.log_level)

    logger.info(f"Using config: {config}")

    run(config)


if __name__ == "__main__":
    cli_entry()
