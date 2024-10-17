import json
import logging
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from http import HTTPMethod
from pathlib import Path
from time import sleep
from typing import Any, Literal

import click
import jsonlines
import pytz
import requests
import yaml

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.INFO,
    format="%(asctime)s %(levelname)8s %(filename)15s%(mode)s - %(message)s ",
    datefmt="%H:%M:%S",
)

_start_time: datetime | None = None


@dataclass
class Config:
    organism: str
    backend_url: str
    keycloak_token_url: str
    keycloak_client_id: str
    username: str
    password: str
    group_name: str
    nucleotide_sequences: list[str]
    segmented: bool


def backend_url(config: Config) -> str:
    """Right strip the URL to remove trailing slashes"""
    return f"{config.backend_url.rstrip('/')}"


def organism_url(config: Config) -> str:
    return f"{backend_url(config)}/{config.organism.strip('/')}"


def get_jwt(config: Config) -> str:
    """
    Get a JWT token for the given username and password
    """

    keycloak_ingest_password = os.getenv("KEYCLOAK_INGEST_PASSWORD")
    if not keycloak_ingest_password:
        keycloak_ingest_password = config.password

    data = {
        "username": config.username,
        "password": keycloak_ingest_password,
        "grant_type": "password",
        "client_id": config.keycloak_client_id,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    keycloak_token_url = config.keycloak_token_url

    response = requests.post(keycloak_token_url, data=data, headers=headers, timeout=600)
    response.raise_for_status()

    jwt_keycloak = response.json()
    return jwt_keycloak["access_token"]


def make_request(  # noqa: PLR0913, PLR0917
    method: HTTPMethod,
    url: str,
    config: Config,
    params: dict[str, Any] | None = None,
    files: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
) -> requests.Response:
    """
    Generic request function to handle repetitive tasks like fetching JWT and setting headers.
    """
    jwt = get_jwt(config)
    headers = {"Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}
    timeout = 600
    match method:
        case HTTPMethod.GET:
            response = requests.get(url, headers=headers, params=params, timeout=timeout)
        case HTTPMethod.POST:
            if files:
                headers.pop("Content-Type")  # Remove content-type for multipart/form-data
                response = requests.post(
                    url, headers=headers, files=files, data=params, timeout=timeout
                )
            else:
                response = requests.post(
                    url, headers=headers, json=json_body, params=params, timeout=timeout
                )
        case _:
            msg = f"Unsupported HTTP method: {method}"
            raise ValueError(msg)

    if response.status_code == 423:
        logger.warning(f"Got 423 from {url}. Retrying after 30 seconds.")
        sleep(30)
        return make_request(method, url, config, params, files, json_body)

    if not response.ok:
        error_message = (
            f"Request failed:\n"
            f"URL: {url}\n"
            f"Method: {method}\n"
            f"Status Code: {getattr(response, 'status_code', 'N/A')}\n"
            f"Response Content: {getattr(response, 'text', 'N/A')}"
        )
        logger.error(error_message)
        response.raise_for_status()
    return response


def create_group_and_return_group_id(config: Config) -> str:
    create_group_url = f"{backend_url(config)}/groups"
    group_name = config.group_name

    data = {
        "groupName": "Automated Ingest from INSDC/NCBI Virus by Loculus",
        "institution": "Automated Ingest from INSDC/NCBI Virus by Loculus",
        "address": {
            "line1": "N/A",
            "line2": "N/A",
            "city": "N/A",
            "state": "N/A",
            "postalCode": "N/A",
            "country": "Switzerland",
        },
        "contactEmail": "support@pathoplexus.org",
    }

    logger.info(f"Creating group: {group_name}")
    create_group_response = make_request(HTTPMethod.POST, create_group_url, config, json_body=data)

    group_id = create_group_response.json()["groupId"]

    logger.info(f"Group created: {group_id}")

    return group_id


def get_or_create_group_and_return_group_id(config: Config, allow_creation: bool = False) -> str:
    """Returns group id"""
    get_user_groups_url = f"{backend_url(config)}/user/groups"

    logger.info(f"Getting groups for user: {config.username}")
    get_groups_response = make_request(HTTPMethod.GET, get_user_groups_url, config)

    if len(get_groups_response.json()) > 0:
        group_id = get_groups_response.json()[0]["groupId"]
        logger.info(f"User is already in group: {group_id}")

        return group_id
    if not allow_creation:
        msg = "User is not in any group and creation is not allowed"
        raise ValueError(msg)

    logger.info("User is not in any group. Creating a new group")
    return create_group_and_return_group_id(config)


def submit_or_revise(
    metadata, sequences, config: Config, group_id, mode=Literal["submit", "revise"]
):
    """
    Submit/revise data to Loculus.
    """
    logging_strings: dict[str, str]
    endpoint: str
    match mode:
        case "submit":
            logging_strings = {
                "noun": "Submission",
                "gerund": "Submitting",
            }
            endpoint = "submit"
        case "revise":
            logging_strings = {
                "noun": "Revision",
                "gerund": "Revising",
            }
            endpoint = "revise"
        case _:
            msg = f"Invalid mode: {mode}"
            raise ValueError(msg)

    url = f"{organism_url(config)}/{endpoint}"

    metadata_lines = len(Path(metadata).read_text(encoding="utf-8").splitlines()) - 1
    logger.info(f"{logging_strings['gerund']} {metadata_lines} sequence(s) to Loculus")

    params = {
        "groupId": group_id,
    }
    if mode == "submit":
        params["dataUseTermsType"] = "OPEN"

    with open(metadata, "rb") as metadata_file, open(sequences, "rb") as sequences_file:
        files = {
            "metadataFile": metadata_file,
            "sequenceFile": sequences_file,
        }
        response = make_request(HTTPMethod.POST, url, config, params=params, files=files)
    logger.debug(f"{logging_strings["noun"]} response: {response.json()}")

    return response.json()


def regroup_and_revoke(metadata, sequences, map, config: Config, group_id):
    """
    Submit segments in new sequence groups and revoke segments in old (incorrect) groups in Loculus.
    """
    response = submit_or_revise(metadata, sequences, config, group_id, mode="submit")
    new_accessions = response[0]["accession"]  # Will be later added as version comment

    url = f"{organism_url(config)}/revoke"

    to_revoke = json.load(open(map, encoding="utf-8"))

    loc_values = {loc for seq in to_revoke.values() for loc in seq.keys()}
    loculus_accessions = set(loc_values)

    accessions = {"accessions": list(loculus_accessions)}

    response = make_request(HTTPMethod.POST, url, config, json_body=accessions)
    logger.debug(f"revocation response: {response.json()}")

    return response.json()


def approve(config: Config):
    """
    Approve all sequences
    """
    payload = {"scope": "ALL"}

    url = f"{organism_url(config)}/approve-processed-data"

    response = make_request(HTTPMethod.POST, url, config, json_body=payload)

    return response.json()


def get_sequence_status(config: Config):
    """Get status of each sequence"""
    url = f"{organism_url(config)}/get-sequences"

    params = {
        "organism": config.organism,
    }

    response = make_request(HTTPMethod.GET, url, config, params=params)

    # Turn into dict with {accession: {version: status}}
    result = defaultdict(dict)
    entries = []
    try:
        entries = response.json()["sequenceEntries"]
    except requests.JSONDecodeError:
        logger.warning(f"Error decoding JSON of /get-sequences: {response.text}")
    for entry in entries:
        accession = entry["accession"]
        version = entry["version"]
        status = entry["status"]
        result[accession][version] = status

    return result


def get_submitted(config: Config):
    """Get previously submitted sequences
    This way we can avoid submitting the same sequences again
    Output is a dictionary with INSDC accession as key
    concrete_insdc_accession:
        loculus_accession: abcd
        versions:
        - version: 1
          hash: abcd
          status: APPROVED_FOR_RELEASE
        - version: 2
          hash: efg
          status: HAS_ERRORS
    ...
    """

    url = f"{organism_url(config)}/get-original-metadata"

    if config.segmented:
        insdc_key = [
            "insdcAccessionBase" + "_" + segment for segment in config.nucleotide_sequences
        ]
    else:
        insdc_key = ["insdcAccessionBase"]

    fields = ["hash", *insdc_key]

    params = {
        "fields": fields,
        "groupIdsFilter": [],
        "statusesFilter": [],
    }

    while True:
        logger.info("Getting previously submitted sequences")

        response = make_request(HTTPMethod.GET, url, config, params=params)
        expected_record_count = int(response.headers["x-total-records"])

        entries: list[dict[str, Any]] = []
        try:
            entries = list(jsonlines.Reader(response.iter_lines()).iter())
        except jsonlines.Error as err:
            response_summary = response.text
            max_error_length = 100
            if len(response_summary) > max_error_length:
                response_summary = response_summary[:50] + "\n[..]\n" + response_summary[-50:]
            logger.error(f"Error decoding JSON from /get-original-metadata: {response_summary}")
            raise ValueError from err

        if len(entries) == expected_record_count:
            f"Got {len(entries)} records as expected"
            break
        logger.error(
            f"Got incomplete original metadata stream: expected {len(entries)}"
            f"records but got {expected_record_count}. Retrying after 60 seconds."
        )
        sleep(60)

    # Initialize the dictionary to store results
    submitted_dict: dict[str, dict[str, str | list]] = {}

    statuses: dict[str, dict[int, str]] = get_sequence_status(config)

    logger.info(f"Backend has status of: {len(statuses)} sequence entries from ingest")
    logger.info(f"Ingest has submitted: {len(entries)} sequence entries to ingest")

    logger.debug(entries)
    logger.debug(statuses)
    for entry in entries:
        loculus_accession = entry["accession"]
        loculus_version = int(entry["version"])
        original_metadata: dict[str, str] = entry["originalMetadata"]
        hash_value = original_metadata.get("hash", "")
        if config.segmented:
            insdc_accessions = [
                original_metadata[key] for key in insdc_key if original_metadata[key]
            ]
            joint_accession = "/".join(
                [
                    f"{original_metadata[key]}.{segment}"
                    for key, segment in zip(insdc_key, config.nucleotide_sequences)
                    if original_metadata[key]
                ]
            )
        else:
            insdc_accessions = [original_metadata.get("insdcAccessionBase", "")]
            joint_accession = original_metadata.get("insdcAccessionBase", "")

        for insdc_accession in insdc_accessions:
            if insdc_accession not in submitted_dict:
                submitted_dict[insdc_accession] = {
                    "loculus_accession": loculus_accession,
                    "versions": [],
                    "jointAccession": joint_accession,
                }
            elif loculus_accession != submitted_dict[insdc_accession]["loculus_accession"]:
                message = (
                    f"INSDC accession {insdc_accession} has multiple loculus accessions: "
                    f"{loculus_accession} and "
                    f"{submitted_dict[insdc_accession]['loculus_accession']}!"
                )
                logger.error(message)
                raise ValueError(message)

            submitted_dict[insdc_accession]["versions"].append(
                {
                    "version": loculus_version,
                    "hash": hash_value,
                    "status": statuses[loculus_accession][loculus_version],
                    "jointAccession": joint_accession,
                }
            )

    logger.info(f"Got info on {len(submitted_dict)} previously submitted sequences/accessions")

    return submitted_dict


@click.command()
@click.option(
    "--metadata",
    required=False,
    type=click.Path(exists=True),
)
@click.option(
    "--sequences",
    required=False,
    type=click.Path(exists=True),
)
@click.option(
    "--mode",
    required=True,
    type=click.Choice(["submit", "revise", "approve", "regroup-and-revoke", "get-submitted"]),
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
    "--output",
    required=False,
    type=click.Path(),
)
@click.option(
    "--revoke-map",
    required=False,
    type=click.Path(exists=True),
)
@click.option(
    "--approve-timeout",
    required=False,
    type=int,
)
def submit_to_loculus(
    metadata, sequences, mode, log_level, config_file, output, revoke_map, approve_timeout
):
    """
    Submit data to Loculus.
    """
    global _start_time
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

    if mode in {"submit", "revise"}:
        logging.info(f"Starting {mode}")
        try:
            group_id = get_or_create_group_and_return_group_id(
                config, allow_creation=mode == "submit"
            )
        except ValueError as e:
            logger.error(f"Aborting {mode} due to error: {e}")
            return
        response = submit_or_revise(metadata, sequences, config, group_id, mode=mode)
        logging.info(f"Completed {mode}")

    if mode == "approve":
        while True:
            if not _start_time:
                _start_time = datetime.now(tz=pytz.utc)
            logger.info("Approving sequences")
            response = approve(config)
            logger.info(f"Approved: {len(response)} sequences")
            sleep(30)
            if datetime.now(tz=pytz.utc) - timedelta(minutes=approve_timeout) > _start_time:
                break

    if mode == "regroup-and-revoke":
        try:
            group_id = get_or_create_group_and_return_group_id(
                config, allow_creation=mode == "submit"
            )
        except ValueError as e:
            logger.error(f"Aborting {mode} due to error: {e}")
            return
        logger.info("Submitting new segment groups and revoking old segment groups")
        response = regroup_and_revoke(metadata, sequences, revoke_map, config, group_id)
        logger.info(f"Revoked: {len(response)} sequence entries of old segment groups")

    if mode == "get-submitted":
        logger.info("Getting submitted sequences")
        response = get_submitted(config)
        Path(output).write_text(json.dumps(response, indent=4, sort_keys=True), encoding="utf-8")


if __name__ == "__main__":
    submit_to_loculus()
