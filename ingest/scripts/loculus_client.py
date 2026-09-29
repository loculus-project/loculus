import dataclasses
import json
import logging
import os
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from http import HTTPMethod, HTTPStatus
from io import BytesIO
from time import sleep
from typing import Any, Literal

import jsonlines
import orjson
import requests

logger = logging.getLogger(__name__)

KEYCLOAK_RETRY_INITIAL_DELAY_SECONDS = 5.0
KEYCLOAK_RETRY_MAX_DELAY_SECONDS = 30.0
KEYCLOAK_RETRY_MAX_WAIT_SECONDS = 300.0

# A backend rollout breaks streams to the pod that shuts down (502s, cut connections) for ~30 s, and
# a failed fetch fails the whole ingest run: 8 attempts over ~8.5 min ride that out.
SUBMITTED_RETRY_INITIAL_DELAY_SECONDS = 10.0
SUBMITTED_RETRY_MAX_DELAY_SECONDS = 120.0
SUBMITTED_RETRY_MAX_ATTEMPTS = 8


@dataclass(kw_only=True)
class ApproveConfig:
    """The minimal config the approve path needs: just enough to authenticate
    against keycloak and hit the backend's approve-processed-data endpoint."""

    organism: str
    backend_url: str
    keycloak_token_url: str
    keycloak_client_id: str
    username: str
    password: str
    backend_request_timeout_seconds: int = 600


@dataclass(kw_only=True)
class Config(ApproveConfig):
    group_name: str
    nucleotide_sequences: list[str]
    segmented: bool
    batch_chunk_size: int
    slack_hook: str = ""


def backend_url(config: ApproveConfig) -> str:
    """Right strip the URL to remove trailing slashes"""
    return f"{config.backend_url.rstrip('/')}"


def organism_url(config: ApproveConfig) -> str:
    return f"{backend_url(config)}/{config.organism.strip('/')}"


def get_jwt(config: ApproveConfig) -> str:
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

    # Keycloak restarts with deployments (~1-2 min unreachable). A failed token request fails the
    # whole ingest run, and its job retries then stop at the version check, so ride out a restart
    # instead. Client errors (e.g. wrong credentials) still fail at once.
    waited = 0.0
    delay = KEYCLOAK_RETRY_INITIAL_DELAY_SECONDS
    while True:
        try:
            response = requests.post(
                keycloak_token_url,
                data=data,
                headers=headers,
                timeout=config.backend_request_timeout_seconds,
            )
            if response.status_code < HTTPStatus.INTERNAL_SERVER_ERROR:
                break
            problem = f"status {response.status_code}"
        except (requests.ConnectionError, requests.Timeout) as e:
            problem = type(e).__name__
        if waited >= KEYCLOAK_RETRY_MAX_WAIT_SECONDS:
            logger.error(f"Keycloak token request still failing ({problem}) after {waited:.0f} s")
            if problem.startswith("status"):
                break
            msg = f"Keycloak unreachable at {keycloak_token_url} ({problem})"
            raise requests.ConnectionError(msg)
        logger.warning(f"Keycloak token request failed ({problem}); retrying in {delay:.0f} s")
        sleep(delay)
        waited += delay
        delay = min(delay * 2, KEYCLOAK_RETRY_MAX_DELAY_SECONDS)
    response.raise_for_status()

    jwt_keycloak = response.json()
    return jwt_keycloak["access_token"]


def make_request(  # noqa: PLR0913, PLR0917
    method: HTTPMethod,
    url: str,
    config: ApproveConfig,
    params: dict[str, Any] | None = None,
    files: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    stream: bool = False,
) -> requests.Response:
    """
    Generic request function to handle repetitive tasks like fetching JWT and setting headers.
    With stream, a GET's body is read as it is consumed instead of into memory first.
    """
    jwt = get_jwt(config)
    headers = {"Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}
    timeout = config.backend_request_timeout_seconds
    match method:
        case HTTPMethod.GET:
            response = requests.get(
                url, headers=headers, params=params, timeout=timeout, stream=stream
            )
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
        response.close()
        sleep(30)
        return make_request(method, url, config, params, files, json_body, stream)

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

    record_count: int = 0  # metadata records read so far, not counting the header

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
    batch_num = -(batch_it.record_count // -config.batch_chunk_size)  # ceiling division
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
) -> requests.Response | None:
    """Chunks metadata files, joins with sequences and submits each chunk via POST.

    Returns None if the metadata file held no records, in which case nothing was sent.
    """

    batch_it = BatchIterator()
    response = None

    with (
        open(fasta_file, encoding="utf-8") as fasta_file_stream,
        open(metadata_file, encoding="utf-8") as metadata_file_stream,
    ):
        for record in metadata_file_stream:
            # the first line is the metadata header
            if batch_it.metadata_header is None:
                batch_it.submission_id_index = record.strip().split("\t").index("id")
                batch_it.metadata_header = record
                continue

            batch_it.record_count += 1

            # every batch's metadata needs to start with the header
            if not batch_it.metadata_batch_output:
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
            if batch_it.record_count % config.batch_chunk_size == 0:
                response = submit(
                    url,
                    config,
                    params,
                    batch_it,
                )
                batch_it.sequences_batch_output = []
                batch_it.metadata_batch_output = []

    # submit the last, partial chunk
    if batch_it.record_count % config.batch_chunk_size != 0:
        response = submit(url, config, params, batch_it)

    return response


def count_lines(path, chunk_size=1024 * 1024):
    """Memory efficient way to count the number of lines in a file by reading in chunks."""
    count = 0
    last_char = b""
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            count += chunk.count(b"\n")
            last_char = chunk[-1:]  # keep last byte
    if count != 0 and last_char != b"\n":
        count += 1
    return count


def submit_or_revise(
    metadata, sequences, config: Config, group_id, mode=Literal["submit", "revise"]
) -> list[dict[str, Any]]:
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

    metadata_lines = max(count_lines(metadata) - 1, 0)

    logger.info(f"{logging_strings['gerund']} {metadata_lines} sequence(s) to Loculus")

    if metadata_lines == 0:
        return []

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


def approve(config: ApproveConfig):
    """
    Approve all sequences
    """
    payload = {"scope": "ALL", "submitterNamesFilter": ["insdc_ingest_user"]}

    url = f"{organism_url(config)}/approve-processed-data"

    response = make_request(HTTPMethod.POST, url, config, json_body=payload)

    return response.json()


class MissingStatusError(ValueError):
    """A /get-submitted-metadata entry without status: the backend pod is older than this ingest"""


def get_submitted_metadata(
    config: Config,
    handle_entries: Callable[[Iterator[dict[str, Any]]], int],
    fields: list[str] | None = None,
    accessionVersionsFilter: list[str] | None = None,  # noqa: N803
) -> None:
    """Stream /get-submitted-metadata through handle_entries, which returns how many entries it
    took; the whole stream is fetched again, with backoff, until that is the number of records the
    backend announced. A connection error, a 5xx, or a stream that is cut (mid-line, or short) is
    retried; handle_entries must start over each time it is called."""
    url = f"{organism_url(config)}/get-submitted-metadata"

    params = {
        "groupIdsFilter": [],
        "statusesFilter": [],
    }
    if fields:
        params["fields"] = fields
    if accessionVersionsFilter:
        params["accessionVersionsFilter"] = accessionVersionsFilter

    delay = SUBMITTED_RETRY_INITIAL_DELAY_SECONDS
    for attempt in range(1, SUBMITTED_RETRY_MAX_ATTEMPTS + 1):
        logger.info("Getting previously submitted sequences")
        problem = fetch_submitted_metadata_once(config, url, params, handle_entries)
        if problem is None:
            return
        if attempt == SUBMITTED_RETRY_MAX_ATTEMPTS:
            msg = f"/get-submitted-metadata failed {attempt} times, last: {problem}"
            logger.error(msg)
            raise requests.ConnectionError(msg)
        logger.warning(
            f"/get-submitted-metadata failed ({problem}); retrying in {delay:.0f} s "
            f"(attempt {attempt} of {SUBMITTED_RETRY_MAX_ATTEMPTS})"
        )
        sleep(delay)
        delay = min(delay * 2, SUBMITTED_RETRY_MAX_DELAY_SECONDS)


def fetch_submitted_metadata_once(
    config: Config,
    url: str,
    params: dict[str, Any],
    handle_entries: Callable[[Iterator[dict[str, Any]]], int],
) -> str | None:
    """One fetch for get_submitted_metadata: None if complete, else what went wrong if it is worth
    retrying. Other errors (e.g. a 4xx) are raised."""
    try:
        with make_request(HTTPMethod.GET, url, config, params=params, stream=True) as response:
            expected_record_count = int(response.headers["x-total-records"])
            lines = response.iter_lines(chunk_size=1 << 20)
            record_count = handle_entries(jsonlines.Reader(lines).iter())
    except requests.HTTPError as err:
        if err.response is None or err.response.status_code < HTTPStatus.INTERNAL_SERVER_ERROR:
            raise
        return f"status {err.response.status_code}"
    except (
        requests.ConnectionError,
        requests.Timeout,
        requests.exceptions.ChunkedEncodingError,
        requests.exceptions.ContentDecodingError,
    ) as err:
        return f"{type(err).__name__}: {err}"
    except jsonlines.Error as err:
        line = str(getattr(err, "line", ""))
        max_error_length = 100
        if len(line) > max_error_length:
            line = line[:50] + "\n[..]\n" + line[-50:]
        return f"invalid JSON line (a cut stream?): {line}"
    except MissingStatusError as err:
        return str(err)  # an old pod still serving during a rollout
    if record_count != expected_record_count:
        return f"got {record_count} records but expected {expected_record_count}"
    logger.info(f"Got {record_count} records as expected")
    return None


def get_submitted(
    config: Config,
    output: str | None,
    fields: list[str] | None = None,
    accessionVersionsFilter: list[str] | None = None,  # noqa: N803
):
    """Get previously submitted sequences, each with its status, as ndjson
    This way we can avoid submitting the same sequences again

    Without output, returns the entries. With output, the entries are streamed to disk (for
    SARS-CoV-2, millions of entries that took ~2 kB of memory each as dicts), then moved into place.
    The status comes with each entry, from the same snapshot as its metadata.
    """
    if not output:
        entries: list[dict[str, Any]] = []

        def collect(new_entries: Iterator[dict[str, Any]]) -> int:
            entries[:] = new_entries
            return len(entries)

        get_submitted_metadata(config, collect, fields, accessionVersionsFilter)
        return entries

    partial = f"{output}.partial"

    def write(new_entries: Iterator[dict[str, Any]]) -> int:
        count = 0
        with open(partial, "wb") as f:
            for entry in new_entries:
                if "status" not in entry:
                    msg = "an entry without status: the backend is older than this ingest"
                    raise MissingStatusError(msg)
                entry["status"] = entry.pop("status")  # last, as downstream files always had it
                f.write(orjson.dumps(entry) + b"\n")
                count += 1
        return count

    try:
        get_submitted_metadata(config, write, fields, accessionVersionsFilter)
        os.replace(partial, output)
    finally:
        if os.path.exists(partial):
            os.remove(partial)
    return None
