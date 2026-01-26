import concurrent.futures
import logging
import threading

import click

from ena_deposition.check_external_visibility import check_and_update_visibility

from .api.app import start_api
from .config import Config, get_config
from .create_assembly import create_assembly
from .create_project import create_project
from .create_sample import create_sample
from .upload_external_metadata_to_loculus import upload_external_metadata

stop_event = threading.Event()

logger = logging.getLogger(__name__)


@click.command()
@click.option(
    "--config-file",
    required=True,
    type=click.Path(exists=True),
)
def run(config_file: str) -> None:
    logging.basicConfig(
        encoding="utf-8",
        level=logging.INFO,
        format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
        datefmt="%H:%M:%S",
    )

    config: Config = get_config(config_file)
    logging.getLogger().setLevel(config.log_level)
    logging.getLogger("requests").setLevel(logging.INFO)  # For requests, debug level is too verbose
    logger.info(f"Config: {config}")

    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [
            executor.submit(create_project, config, stop_event),
            executor.submit(create_sample, config, stop_event),
            executor.submit(create_assembly, config, stop_event),
            executor.submit(upload_external_metadata, config, stop_event),
            executor.submit(start_api, config, stop_event),
            executor.submit(check_and_update_visibility, config, stop_event),
        ]
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except concurrent.futures.CancelledError:
                logger.debug("A task was cancelled")
            except Exception:
                logger.exception("Task generated an exception")
                stop_event.set()  # Set the stop_event to notify other threads
                for f in futures:
                    if not f.done():
                        f.cancel()
                break


if __name__ == "__main__":
    run()
