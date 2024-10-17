import concurrent.futures
import logging
import threading

import click

from .config import Config, get_config
from .create_assembly import create_assembly
from .create_project import create_project
from .create_sample import create_sample
from .trigger_submission_to_ena import trigger_submission_to_ena
from .upload_external_metadata_to_loculus import upload_external_metadata

stop_event = threading.Event()


@click.command()
@click.option(
    "--config-file",
    required=True,
    type=click.Path(exists=True),
)
@click.option(
    "--input-file",
    type=click.Path(exists=True),
)
def run(config_file, input_file):
    logging.basicConfig(
        encoding="utf-8",
        level=logging.INFO,
        format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
        datefmt="%H:%M:%S",
    )

    config: Config = get_config(config_file)
    logging.getLogger().setLevel(config.log_level)
    logging.getLogger("requests").setLevel(logging.INFO)
    logging.info(f"Config: {config}")

    global stop_event

    if input_file:
        logging.info("Triggering submission from file")
        trigger_submission_to_ena(config, stop_event, input_file=input_file)

    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [
            executor.submit(create_project, config, stop_event),
            executor.submit(create_sample, config, stop_event),
            executor.submit(create_assembly, config, stop_event),
            executor.submit(upload_external_metadata, config, stop_event),
        ]
        if not input_file:
            futures.append(executor.submit(trigger_submission_to_ena, config, stop_event))
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except Exception as e:
                print(f"Task generated an exception: {e}")
                stop_event.set()  # Set the stop_event to notify other threads
                for f in futures:
                    if not f.done():
                        f.cancel()
                break


if __name__ == "__main__":
    run()
