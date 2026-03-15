import json
import logging
import os
import uuid
from collections.abc import Iterator
from http import HTTPMethod
from typing import Any

import orjson
import requests

from .config import Config
from .loculus_models import Group, GroupDetails

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


def make_request(
    method: HTTPMethod,
    url: str,
    config: Config,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    files: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    data: str | None = None,
    auth: bool = True
) -> requests.Response:
    """Generic request function to handle repetitive tasks like fetching JWT and setting headers."""
    if headers is None:
        headers = {}
    if auth:
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
    logger.debug(
        f"Submitting external metadata for organism: {organism}, metadata: {external_metadata}"
    )
    endpoint: str = "submit-external-metadata"
    loculus_organism = config.enaOrganisms[organism].loculusOrganism or organism

    url = f"{organism_url(config, loculus_organism)}/{endpoint}"
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

    logger.debug(
        "External metadata submitted successfully for "
        f"organism: {organism}, metadata: {external_metadata}"
    )

    return response


def get_group_info(config: Config, group_id: int) -> Group:
    """Get group info given id"""

    try:
        group_id = int(group_id)
    except ValueError as e:
        msg = f"Invalid group_id: {group_id}. It must be an integer."
        logger.error(msg)
        raise ValueError(msg) from e

    url = f"{backend_url(config)}/groups/{group_id}"

    headers = {"Content-Type": "application/json"}

    try:
        response = make_request(HTTPMethod.GET, url, config, headers=headers, auth=False)
    except requests.exceptions.HTTPError as err:
        logger.error(f"Error fetching group info for {group_id} from Loculus: {err}")
        raise requests.exceptions.HTTPError from err
    # response.json() returns python dict
    return GroupDetails.model_validate(response.json()).group


def fetch_released_entries(config: Config, organism: str) -> Iterator[dict[str, Any]]:
    """Get sequences that are ready for release"""

    request_id = str(uuid.uuid4())
    url = f"{organism_url(config, organism)}/get-released-data"

    headers = {
        "Content-Type": "application/json",
        "X-Request-ID": request_id,
    }
    logger.info(f"Fetching released data from {url} with request id {request_id}")

    with requests.get(url, headers=headers, timeout=3600, stream=True) as response:
        response.raise_for_status()
        for line_no, line in enumerate(response.iter_lines(chunk_size=65536), start=1):
            if not line:
                continue

            try:
                full_json = orjson.loads(line)
            except orjson.JSONDecodeError as e:
                head = line[:200]
                tail = line[-200:] if len(line) > 200 else line  # noqa: PLR2004

                error_msg = (
                    f"Invalid NDJSON from {url}\n"
                    f"request_id={request_id}\n"
                    f"line={line_no}\n"
                    f"bytes={len(line)}\n"
                    f"json_error={e}\n"
                    f"head={head!r}\n"
                    f"tail={tail!r}"
                )

                logger.error(error_msg)
                raise RuntimeError(error_msg) from e

            yield {
                k: v
                for k, v in full_json.items()
                if k in {"metadata", "unalignedNucleotideSequences"}
            }
