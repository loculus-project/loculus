import json
import logging
import os
from collections.abc import Iterator
from http import HTTPMethod
from typing import Any

import jsonlines
import requests

from .config import Config

logger = logging.getLogger(__name__)


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
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    files: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    data: str | None = None,
) -> requests.Response:
    """Generic request function to handle repetitive tasks like fetching JWT and setting headers."""
    if headers is None:
        headers = {}
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
        msg = f"External metadata submission failed with: {response.status_code} - {response.text}"
        logger.error(msg)
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
        error_length_limit = 100
        if len(response_summary) > error_length_limit:
            response_summary = response_summary[:50] + "\n[..]\n" + response_summary[-50:]
        logger.error(f"Error decoding JSON from /groups/{group_id}: {response_summary}")
        raise ValueError from err

    return entries


def fetch_released_entries(config: Config, organism: str) -> Iterator[dict[str, Any]]:
    """Get sequences that are ready for release"""

    url = f"{organism_url(config, organism)}/get-released-data"

    headers = {"Content-Type": "application/json"}

    with requests.get(url, headers=headers, timeout=3600, stream=True) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            full_json = json.loads(line)
            filtered_json = {
                k: v
                for k, v in full_json.items()
                if k in {"metadata", "unalignedNucleotideSequences"}
            }
            yield filtered_json
