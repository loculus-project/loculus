import logging

import click

from .api import start_api
from .config import get_config
from .deacon import DeaconFilter, load_deacon_index

logger = logging.getLogger(__name__)


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
def run(config_file: str):
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
        datefmt="%H:%M:%S",
    )

    config = get_config(config_file)
    logging.getLogger().setLevel(config.log_level)
    logging.getLogger("requests").setLevel(logging.INFO)
    logger.info(f"Config: {config}")

    # Load before the API binds, so the pod is only ready once filtering can work.
    deacon_filter = DeaconFilter(load_deacon_index(), config)

    logger.info("Starting API...")
    start_api(config, deacon_filter)


if __name__ == "__main__":
    run()
