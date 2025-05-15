import json
import logging
from dataclasses import dataclass
from time import sleep

import click
import requests
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass
class Config:
    ena_deposition_url: str


def ena_deposition_url(config: Config) -> str:
    """Right strip the URL to remove trailing slashes"""
    stripped = f"{config.ena_deposition_url.rstrip('/')}"
    return f"{stripped}/submitted"


def make_request(config: Config) -> requests.Response:
    """
    Generic request function to handle repetitive tasks like fetching JWT and setting headers.
    """
    url = ena_deposition_url(config)
    timeout = 600
    response = requests.get(url, timeout=timeout)

    if response.status_code == 423:
        logger.warning(f"Got 423 from {url}. Retrying after 30 seconds.")
        sleep(30)
        return make_request(config)

    if not response.ok:
        error_message = (
            f"Request failed:\n"
            f"URL: {url}\n"
            f"Status Code: {getattr(response, 'status_code', 'N/A')}\n"
            f"Response Content: {getattr(response, 'text', 'N/A')}"
        )
        logger.error(error_message)
        response.raise_for_status()
    return response.json()


@click.command()
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
@click.option(
    "--config-file",
    required=True,
    type=click.Path(exists=True),
)
@click.option(
    "--output-insdc-accessions",
    required=True,
    type=click.Path(),
)
def get_loculus_depositions(log_level, config_file, output_insdc_accessions):
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.INFO)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)
    logger.info(f"Config: {config}")

    accessions_submitted_by_loculus = make_request(config)
    logger.debug(
        f"Assembly accessions to filter out: {accessions_submitted_by_loculus['insdcAccessions']}"
    )
    logger.debug(
        f"Biosample accessions to filter out: {accessions_submitted_by_loculus['biosampleAccessions']}"
    )

    with open(output_insdc_accessions, "w", encoding="utf-8") as file:
        json.dump(accessions_submitted_by_loculus, file, indent=4)


if __name__ == "__main__":
    get_loculus_depositions()
