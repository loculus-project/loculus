import dataclasses
import json
import logging
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from http import HTTPMethod
from io import BytesIO
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
    batch_chunk_size: int


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


@dataclass
class BatchIterator:
    current_fasta_submission_id: str | None = None
    fasta_record_header: str | None = None

    record_counter: int = 0

    metadata_header: str | None = None
    submission_id_index: int | None = None  # index of submissionId in metadata header

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
        # get all fasta sequences for the current metadata submissionId
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
                msg = "Fasta file is not sorted by submissionId"
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
                batch_it.submission_id_index = record.strip().split("\t").index("submissionId")
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
                msg = f"Fasta SubmissionId {batch_it.current_fasta_submission_id} not in correct order in metadata"
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
    Submit/revise data to Loculus -requires metadata and sequences sorted by submissionId.
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

    url = f"{organism_url(config)}/revoke"
    responses = []
    for old_loc_accession, new_loc_accession in old_to_new_loculus_keys.items():
        logger.debug(f"revoking: {old_loc_accession}")
        comment = (
            "INSDC re-ingest found metadata changes which lead the segments in this "
            "sequence to be grouped differently. The newly grouped sequences can be found "
            f"here: {', '.join(new_loc_accession)}."
        )
        body = {"accessions": [old_loc_accession], "versionComment": comment}
        response = make_request(HTTPMethod.POST, url, config, json_body=body)
        logger.debug(f"revocation response: {response.json()}")
        responses.append(response.json())

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
          jointAccession: abcd
          submitter: insdc_ingest_user
        - version: 2
          hash: efg
          status: HAS_ERRORS
          jointAccession: abcd
          submitter: curator
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
    loculus_to_insdc_accession_map: dict[str, list[str]] = {}
    revocation_dict: dict[
        str, list[str]
    ] = {}  # revocations do not have original data or INSDC accession

    statuses: dict[str, dict[int, str]] = get_sequence_status(config)

    logger.info(f"Backend has status of: {len(statuses)} sequence entries from ingest")
    logger.info(f"Ingest has submitted: {len(entries)} sequence entries to ingest")

    for entry in entries:
        loculus_accession = entry["accession"]
        loculus_version = int(entry["version"])
        submitter = entry["submitter"]
        if entry["isRevocation"]:
            if loculus_accession not in revocation_dict:
                revocation_dict[loculus_accession] = []
            revocation_dict[loculus_accession].append(loculus_version)
            continue
        original_metadata: dict[str, str] = entry["originalMetadata"]
        hash_value = original_metadata.get("hash", "")
        if config.segmented:
            insdc_accessions = [
                original_metadata[key] for key in insdc_key if original_metadata[key]
            ]
            joint_accession = "/".join(
                [
                    f"{original_metadata[key]}.{segment}"
                    for key, segment in zip(insdc_key, config.nucleotide_sequences)  # noqa: B905
                    if original_metadata[key]
                ]
            )
        else:
            insdc_accessions = [original_metadata.get("insdcAccessionBase", "")]
            joint_accession = original_metadata.get("insdcAccessionBase", "")

        loculus_to_insdc_accession_map[loculus_accession] = insdc_accessions
        for insdc_accession in insdc_accessions:
            if insdc_accession not in submitted_dict:
                submitted_dict[insdc_accession] = {
                    "loculus_accession": loculus_accession,
                    "versions": [],
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
                    "submitter": submitter,
                }
            )
    # Ensure revocations added to correct INSDC accession
    for loculus_accession, insdc_accessions in loculus_to_insdc_accession_map.items():
        if loculus_accession in revocation_dict:
            for insdc_accession in insdc_accessions:
                for version in revocation_dict[loculus_accession]:
                    submitted_dict[insdc_accession]["versions"].append(
                        {
                            "version": version,
                            "hash": "",
                            "status": "REVOKED",
                            "jointAccession": "",
                            "submitter": "",
                        }
                    )
            revocation_dict.pop(loculus_accession)

    if revocation_dict.keys():
        logger.error(
            f"Revocation entries found in Loculus but not in original metadata: {revocation_dict}"
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
        relevant_config = {}
        relevant_config = {key: full_config.get(key, []) for key in Config.__annotations__}
        config = Config(**relevant_config)

    logger.info(f"Config: {config}")

    if mode in {"submit", "revise"}:
        logger.info(f"Starting {mode}")
        try:
            group_id = get_or_create_group_and_return_group_id(
                config, allow_creation=mode == "submit"
            )
        except ValueError as e:
            logger.error(f"Aborting {mode} due to error: {e}")
            return
        response = submit_or_revise(metadata, sequences, config, group_id, mode=mode)
        logger.info(f"Completed {mode}")

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
        Path(output).write_text(json.dumps(response, indent=4, sort_keys=False), encoding="utf-8")


if __name__ == "__main__":
    submit_to_loculus()
