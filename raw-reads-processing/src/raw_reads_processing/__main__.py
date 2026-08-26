import logging

import click

from .api import start_api
from .config import get_config
from .deacon import prepare_deacon_index, start_deacon_server
from .readtools_server import start_readtools_server, wait_until_ready

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

    logger.info("Preparing deacon index and starting deacon server...")
    prepare_deacon_index()
    deacon_process = start_deacon_server()

    readtools_process = None
    if config.readtools_server_enabled:
        logger.info("Starting readtools validation server and warming it up...")
        readtools_process = start_readtools_server(config)
        # Warm-up takes a while; block so we never serve a request on a cold JVM.
        wait_until_ready(config, readtools_process)

    logger.info("Starting API...")
    start_api(config, deacon_process, readtools_process)


if __name__ == "__main__":
    run()
