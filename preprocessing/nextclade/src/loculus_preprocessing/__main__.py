import logging

from .config import get_config
from .prepro import run


def cli_entry() -> None:
    logging.basicConfig(level=logging.INFO)

    config = get_config()

    logging.getLogger().setLevel(config.log_level)

    logging.info("This is the new config!!!")
    logging.info(f"Using config: {config}")

    run(config)


if __name__ == "__main__":
    cli_entry()
