import logging

import click

from .api import start_api
from .config import get_config

logger = logging.getLogger(__name__)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
def run(config_file: str):
    logging.basicConfig(
        encoding="utf-8",
        level=logging.INFO,
        format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
        datefmt="%H:%M:%S",
    )

    config = get_config(config_file)
    logging.getLogger().setLevel(config.log_level)
    logging.getLogger("requests").setLevel(logging.INFO)
    logger.info(f"Config: {config}")

    start_api(config)


if __name__ == "__main__":
    run()
