"""Continuously approve INSDC-ingest sequences for all configured organisms.

Loops forever, calling the backend's approve-processed-data endpoint for each
organism in turn. All settings come from CLI args / env vars so we don't need
a separate ConfigMap.
"""

import logging
import os
from time import sleep

import click
from loculus_client import Config, approve

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s %(filename)15s - %(message)s",
    datefmt="%H:%M:%S",
)


def _config_for_organism(
    organism: str,
    backend_url: str,
    keycloak_token_url: str,
    request_timeout_seconds: int,
) -> Config:
    return Config(
        organism=organism,
        backend_url=backend_url,
        keycloak_token_url=keycloak_token_url,
        keycloak_client_id="backend-client",
        username="insdc_ingest_user",
        password="insdc_ingest_user",
        group_name="",
        nucleotide_sequences=[],
        segmented=False,
        batch_chunk_size=0,
        backend_request_timeout_seconds=request_timeout_seconds,
    )


@click.command()
@click.option("--organism", "organisms", multiple=True, required=True)
@click.option("--interval-seconds", type=int, default=60)
@click.option("--request-timeout-seconds", type=int, default=600)
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def autoapprove(organisms, interval_seconds, request_timeout_seconds, log_level):
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    backend_url = os.environ["BACKEND_URL"]
    keycloak_token_url = os.environ["KEYCLOAK_TOKEN_URL"]

    logger.info(
        f"Auto-approving for organisms {list(organisms)} every {interval_seconds}s"
    )

    while True:
        for organism in organisms:
            try:
                config = _config_for_organism(
                    organism, backend_url, keycloak_token_url, request_timeout_seconds
                )
                response = approve(config)
                logger.info(f"Approved {len(response)} sequences for {organism}")
            except Exception:
                logger.exception(f"Failed to approve sequences for {organism}")
        sleep(interval_seconds)


if __name__ == "__main__":
    autoapprove()
