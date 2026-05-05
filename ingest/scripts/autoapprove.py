"""Continuously approve INSDC-ingest sequences for all configured organisms.

Reads a single config that lists every organism and shared backend/keycloak
settings, then loops forever calling the backend's approve-processed-data
endpoint for each organism in turn.
"""

import logging
from time import sleep

import click
import yaml
from loculus_client import Config, approve

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s %(filename)15s - %(message)s",
    datefmt="%H:%M:%S",
)


def _config_for_organism(full_config: dict, organism: str) -> Config:
    return Config(
        organism=organism,
        backend_url=full_config["backend_url"],
        keycloak_token_url=full_config["keycloak_token_url"],
        keycloak_client_id=full_config["keycloak_client_id"],
        username=full_config["username"],
        password=full_config["password"],
        group_name="",
        nucleotide_sequences=[],
        segmented=False,
        batch_chunk_size=0,
        time_between_approve_requests_seconds=full_config.get(
            "time_between_approve_requests_seconds", 60
        ),
        backend_request_timeout_seconds=full_config.get(
            "backend_request_timeout_seconds", 600
        ),
    )


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def autoapprove(config_file, log_level):
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)

    organisms: list[str] = full_config["organisms"]
    interval_seconds: int = full_config.get("time_between_approve_requests_seconds", 60)

    logger.info(f"Auto-approving for organisms: {organisms} every {interval_seconds}s")

    while True:
        for organism in organisms:
            try:
                config = _config_for_organism(full_config, organism)
                response = approve(config)
                logger.info(f"Approved {len(response)} sequences for {organism}")
            except Exception:
                logger.exception(f"Failed to approve sequences for {organism}")
        sleep(interval_seconds)


if __name__ == "__main__":
    autoapprove()
