import dataclasses
import json
import logging
import os
from collections import defaultdict
from dataclasses import dataclass
from http import HTTPMethod
from io import BytesIO
from pathlib import Path
from time import sleep
from typing import Any, Literal

import jsonlines
import orjsonl
import requests

logger = logging.getLogger(__name__)


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
    batch_chunk_size: int
    time_between_approve_requests_seconds: int = 30
    backend_request_timeout_seconds: int = 600


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

    response = requests.post(keycloak_token_url, data=data, headers=headers, timeout=config.backend_request_timeout_seconds)
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
    timeout = config.backend_request_timeout_seconds
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


@dataclass
class BatchIterator:
    current_fasta_submission_id: str | None = None
    fasta_record_header: str | None = None

    record_counter: int = 0

    metadata_header: str | None = None
    submission_id_index: int | None = None  # index of id in metadata header

    sequences_batch_output: list[str] = dataclasses.field(default_factory=list)
    metadata_batch_output: list[str] = dataclasses.field(default_factory=list)


def submit(
    url,
    config: Config,
    params: dict[str, str],
    batch_it: BatchIterator,
):
    batch_num = -(int(batch_it.record_counter) // -config.batch_chunk_size)  # ceiling division
    logger.info(f"Submitting batch {batch_num}")

    metadata_in_memory = BytesIO("".join(batch_it.metadata_batch_output).encode("utf-8"))
    fasta_in_memory = BytesIO("".join(batch_it.sequences_batch_output).encode("utf-8"))

    files = {
        "metadataFile": ("metadata.tsv", metadata_in_memory, "text/tab-separated-values"),
        "sequenceFile": ("sequences.fasta", fasta_in_memory, "text/plain"),
    }
    response = make_request(HTTPMethod.POST, url, config, params=params, files=files)
    logger.info(f"Batch {batch_num} Response: {response.status_code}")
    if response.status_code != 200:  # noqa: PLR2004
        logger.error(f"Error in batch {batch_num}: {response.text}")

    return response


def add_seq_to_batch(
    batch_it: BatchIterator, fasta_file_stream, metadata_submission_id: str, config: Config
):
    while True:
        # get all fasta sequences for the current metadata id
        line = fasta_file_stream.readline()
        if not line:  # EOF
            return batch_it
        if line.startswith(">"):
            batch_it.fasta_record_header = line
            if config.segmented:
                fasta_submission_id = "_".join(
                    batch_it.fasta_record_header[1:].strip().split("_")[:-1]
                )
            else:
                fasta_submission_id = batch_it.fasta_record_header[1:].strip()
            if fasta_submission_id == metadata_submission_id:
                continue
            if fasta_submission_id < metadata_submission_id:
                msg = "Fasta file is not sorted by id"
                logger.error(msg)
                raise ValueError(msg)

            return batch_it

        # add to batch sequences output
        if batch_it.fasta_record_header:
            batch_it.sequences_batch_output.extend((batch_it.fasta_record_header, line))
            batch_it.fasta_record_header = None
        else:
            batch_it.sequences_batch_output.append(line)  # Handle multi-line sequences


def post_fasta_batches(
    url,
    fasta_file: str,
    metadata_file: str,
    config: Config,
    params: dict[str, str],
) -> requests.Response:
    """Chunks metadata files, joins with sequences and submits each chunk via POST."""

    batch_it = BatchIterator()

    with (
        open(fasta_file, encoding="utf-8") as fasta_file_stream,
        open(metadata_file, encoding="utf-8") as metadata_file_stream,
    ):
        for record in metadata_file_stream:
            batch_it.record_counter += 1

            # process metadata header
            if batch_it.record_counter == 1:
                batch_it.submission_id_index = record.strip().split("\t").index("id")
                batch_it.metadata_header = record
                batch_it.metadata_batch_output.append(batch_it.metadata_header)
                continue

            # add header to batch metadata output
            if (
                batch_it.record_counter > 1
                and batch_it.record_counter % config.batch_chunk_size == 1
            ):
                batch_it.metadata_batch_output.append(batch_it.metadata_header)

            batch_it.metadata_batch_output.append(record)
            metadata_submission_id = record.split("\t")[batch_it.submission_id_index].strip()

            if (
                batch_it.current_fasta_submission_id
                and metadata_submission_id != batch_it.current_fasta_submission_id
            ):
                msg = f"Fasta id {batch_it.current_fasta_submission_id} not in correct order in metadata"
                logger.error(msg)
                raise ValueError(msg)

            # Add all seq with the same metadata_submission_id to the batch
            batch_it = add_seq_to_batch(batch_it, fasta_file_stream, metadata_submission_id, config)

            # submit the batch if it is full
            if batch_it.record_counter % config.batch_chunk_size == 0:
                response = submit(
                    url,
                    config,
                    params,
                    batch_it,
                )
                batch_it.sequences_batch_output = []
                batch_it.metadata_batch_output = []

    if batch_it.record_counter % config.batch_chunk_size != 0:
        # submit the last chunk
        response = submit(url, config, params, batch_it)

    return response


def submit_or_revise(
    metadata, sequences, config: Config, group_id, mode=Literal["submit", "revise"]
):
    """
    Submit/revise data to Loculus -requires metadata and sequences sorted by id.
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

    response = post_fasta_batches(url, sequences, metadata, config, params=params)

    return response.json()


def revoke(accession_to_revoke: str, message: str, config: Config) -> str:
    url = f"{organism_url(config)}/revoke"
    body = {"accessions": [accession_to_revoke], "versionComment": message}
    response = make_request(HTTPMethod.POST, url, config, json_body=body)
    logger.debug(f"revocation response: {response.json()}")
    return response.json()


def regroup_and_revoke(metadata, sequences, map, config: Config, group_id):
    """
    Submit segments in new sequence groups and revoke segments in old (incorrect) groups in Loculus.
    """
    response = submit_or_revise(metadata, sequences, config, group_id, mode="submit")
    submission_id_to_new_accessions = {}  # Map from submissionId to new loculus accession
    for item in response:
        submission_id_to_new_accessions[item["submissionId"]] = item["accession"]

    to_revoke = json.load(open(map, encoding="utf-8"))

    old_to_new_loculus_keys: dict[
        str, list[str]
    ] = {}  # Map from old loculus accession to corresponding new accession(s)
    for key, value in to_revoke.items():
        for loc_accession in value:
            new_accessions_for_this_old_accession = old_to_new_loculus_keys.get(loc_accession, [])
            new_accessions_for_this_old_accession.append(submission_id_to_new_accessions[key])
            old_to_new_loculus_keys[loc_accession] = new_accessions_for_this_old_accession

    responses = []
    for old_loc_accession, new_loc_accession in old_to_new_loculus_keys.items():
        logger.debug(f"revoking: {old_loc_accession}")
        comment = (
            "INSDC re-ingest found metadata changes which lead the segments in this "
            "sequence to be grouped differently. The newly grouped sequences can be found "
            f"here: {', '.join(new_loc_accession)}."
        )
        response = revoke(old_loc_accession, comment, config)
        logger.debug(f"revocation response: {response}")
        responses.append(response)

    return responses


def approve(config: Config):
    """
    Approve all sequences
    """
    payload = {"scope": "ALL", "submitterNamesFilter": ["insdc_ingest_user"]}

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


def get_submitted(config: Config, output: str):
    """Get previously submitted sequences as ndjson
    This way we can avoid submitting the same sequences again
    Adds status to the output (as this is not returned by get-original-metadata)
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
            logger.info(f"Got {len(entries)} records as expected")
            break
        logger.error(
            f"Got incomplete original metadata stream: expected {len(entries)}"
            f"records but got {expected_record_count}. Retrying after 60 seconds."
        )
        sleep(60)

    statuses: dict[str, dict[int, str]] = get_sequence_status(config)
    logger.info(f"Got info on {len(statuses.keys())} previously submitted sequences/accessions")

    for entry in entries:
        status = statuses.get(entry["accession"], {}).get(entry["version"], "UNKNOWN")
        entry_with_status = entry.copy()
        entry_with_status["status"] = status
        orjsonl.append(output, entry_with_status)

    if len(entries) == 0:
        with open(output, "w", encoding="utf-8"):
            pass
