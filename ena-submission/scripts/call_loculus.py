import json
import logging
import os
from dataclasses import dataclass
from http import HTTPMethod
from pathlib import Path
from typing import Any

import click
import jsonlines
import requests
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)


@dataclass
class Config:
    backend_url: str
    keycloak_token_url: str
    keycloak_client_id: str
    username: str
    password: str
    group_name: str
    ena_specific_metadata: list[str]


def backend_url(config: Config) -> str:
    """Right strip the URL to remove trailing slashes"""
    return f"{config.backend_url.rstrip('/')}"


def organism_url(config: Config, organism: str) -> str:
    return f"{backend_url(config)}/{organism.strip('/')}"


def get_jwt(config: Config) -> str:
    """Get a JWT token for the given username and password"""

    external_metadata_updater_password = os.getenv("EXTERNAL_METADATA_UPDATER_PASSWORD")
    if not external_metadata_updater_password:
        external_metadata_updater_password = config.password

    data = {
        "username": config.username,
        "password": external_metadata_updater_password,
        "grant_type": "password",
        "client_id": config.keycloak_client_id,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    keycloak_token_url = config.keycloak_token_url

    response = requests.post(keycloak_token_url, data=data, headers=headers, timeout=60)
    response.raise_for_status()

    jwt_keycloak = response.json()
    return jwt_keycloak["access_token"]


def make_request(  # noqa: PLR0913, PLR0917
    method: HTTPMethod,
    url: str,
    config: Config,
    headers: dict[str, str] = {},
    params: dict[str, Any] | None = None,
    files: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    data: str | None = None,
) -> requests.Response:
    """Generic request function to handle repetitive tasks like fetching JWT and setting headers."""
    jwt = get_jwt(config)
    headers["Authorization"] = f"Bearer {jwt}"

    match method:
        case HTTPMethod.GET:
            response = requests.get(url, headers=headers, params=params, timeout=60)
        case HTTPMethod.POST:
            if files:
                headers.pop("Content-Type")  # Remove content-type for multipart/form-data
                response = requests.post(url, headers=headers, files=files, data=params, timeout=60)
            else:
                response = requests.post(
                    url, headers=headers, json=json_body, params=params, data=data, timeout=60
                )
        case _:
            msg = f"Unsupported HTTP method: {method}"
            raise ValueError(msg)

    if not response.ok:
        msg = f"Error: {response.status_code} - {response.text}"
        raise requests.exceptions.HTTPError(msg)

    return response


def submit_external_metadata(
    external_metadata: dict[str, str],
    config: Config,
    organism: str,
) -> requests.Response:
    """Submit metadata to Loculus."""
    endpoint: str = "submit-external-metadata"

    url = f"{organism_url(config, organism)}/{endpoint}"
    params = {
        "externalMetadataUpdater": "ena",
    }

    headers = {
        "accept": "*/*",
        "Content-Type": "application/x-ndjson",
    }

    data = json.dumps(external_metadata)

    response = make_request(HTTPMethod.POST, url, config, data=data, headers=headers, params=params)

    if not response.ok:
        msg = f"Error: {response.status_code} - {response.text}"
        raise requests.exceptions.HTTPError(msg)

    return response


def get_group_info(config: Config, group_id: int) -> dict[str, Any]:
    """Get group info given id"""

    # TODO: only get a list of released accessionVersions and compare with submission DB.
    url = f"{backend_url(config)}/groups/{group_id}"

    headers = {"Content-Type": "application/json"}

    response = make_request(HTTPMethod.GET, url, config, headers=headers)

    entries: list[dict[str, Any]] = []
    try:
        entries = list(jsonlines.Reader(response.iter_lines()).iter())
    except jsonlines.Error as err:
        response_summary = response.text
        if len(response_summary) > 100:
            response_summary = response_summary[:50] + "\n[..]\n" + response_summary[-50:]
        logger.error(f"Error decoding JSON from /groups/{group_id}: {response_summary}")
        raise ValueError from err

    return entries


# TODO: Better return type, Any is too broad
def fetch_released_entries(config: Config, organism: str) -> dict[str, Any]:
    """Get sequences that are ready for release"""

    # TODO: only get a list of released accessionVersions and compare with submission DB.
    url = f"{organism_url(config, organism)}/get-released-data"

    headers = {"Content-Type": "application/json"}

    response = make_request(HTTPMethod.GET, url, config, headers=headers)

    entries: list[dict[str, Any]] = []
    try:
        entries = list(jsonlines.Reader(response.iter_lines()).iter())
    except jsonlines.Error as err:
        response_summary = response.text
        if len(response_summary) > 100:
            response_summary = response_summary[:50] + "\n[..]\n" + response_summary[-50:]
        logger.error(f"Error decoding JSON from /get-released-data: {response_summary}")
        raise ValueError() from err

    # Only keep unalignedNucleotideSequences and metadata
    data_dict: dict[str, Any] = {
        rec["metadata"]["accessionVersion"]: {
            "metadata": rec["metadata"],
            "unalignedNucleotideSequences": rec["unalignedNucleotideSequences"],
        }
        for rec in entries
    }

    return data_dict


@click.command()
@click.option(
    "--metadata",
    required=False,
    type=click.Path(exists=True),
)
@click.option(
    "--mode",
    required=True,
    type=click.Choice(["submit-external-metadata", "get-released-data"]),
)
@click.option(
    "--organism",
    required=True,
    type=str,
)
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
    "--output-file",
    required=False,
    type=click.Path(),
)
@click.option(
    "--remove-if-has-metadata",
    "-r",
    is_flag=True,
    help="Do not return released sequences with external metadata fields.",
)
def call_loculus(
    metadata,
    organism,
    mode,
    log_level,
    config_file,
    output_file,
    remove_if_has_metadata=False,
):
    """
    Call Loculus.
    """
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    old_factory = logging.getLogRecordFactory()

    def record_factory(*args, **kwargs):
        record = old_factory(*args, **kwargs)
        record.mode = f":{mode}"
        return record

    logging.setLogRecordFactory(record_factory)

    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)

    logger.info(f"Config: {config}")

    if mode == "submit-external-metadata":
        logging.info("Submitting external metadata")
        response = submit_external_metadata(metadata, config=config, organism=organism)
        logging.info(f"Completed {mode}")
        Path(output_file).write_text("", encoding="utf-8")

    if mode == "get-released-data":
        logger.info("Getting released sequences")
        response = fetch_released_entries(config, organism, remove_if_has_metadata)
        if response:
            Path(output_file).write_text(json.dumps(response), encoding="utf-8")
        else:
            print("No released sequences found")
            Path(output_file).write_text("", encoding="utf-8")


if __name__ == "__main__":
    call_loculus()
