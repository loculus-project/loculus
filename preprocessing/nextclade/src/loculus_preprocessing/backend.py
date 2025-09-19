"""Functions to interface with the backend"""

import dataclasses
import datetime as dt
import json
import logging
import time
from collections.abc import Sequence
from http import HTTPStatus
from pathlib import Path
from urllib.parse import urlparse

import jwt
import pytz
import requests
import random

from .config import Config
from .datatypes import (
    FileUploadInfo,
    ProcessedEntry,
    UnprocessedData,
    UnprocessedEntry,
)
from .processing_functions import trim_ns

logger = logging.getLogger(__name__)


def retry_with_exponential_backoff(func, config, max_attempts=None):
    """
    Retry a function with exponential backoff on timeout or connection errors.
    
    Args:
        func: Function to retry
        config: Config object with retry settings
        max_attempts: Override for config.backend_retry_attempts
    
    Returns:
        Result of successful function call
    
    Raises:
        Last exception if all attempts fail
    """
    max_attempts = max_attempts or config.backend_retry_attempts
    initial_wait = config.backend_retry_initial_wait
    max_wait = config.backend_retry_max_wait
    multiplier = config.backend_retry_multiplier
    
    last_exception = None
    
    for attempt in range(1, max_attempts + 1):
        try:
            return func()
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_exception = e
            
            if attempt == max_attempts:
                # This is the last attempt, don't sleep and re-raise
                logger.error(
                    f"Backend request failed after {max_attempts} attempts over "
                    f"approximately {initial_wait * (multiplier ** max_attempts - 1) / (multiplier - 1):.1f} seconds. "
                    f"Final error: {type(e).__name__}: {e}"
                )
                raise
            
            # Calculate wait time with exponential backoff and jitter
            wait_time = min(initial_wait * (multiplier ** (attempt - 1)), max_wait)
            # Add jitter to avoid thundering herd
            wait_time = wait_time * (0.5 + random.random() * 0.5)
            
            logger.warning(
                f"Backend request failed (attempt {attempt}/{max_attempts}): {type(e).__name__}: {e}. "
                f"Retrying in {wait_time:.1f} seconds..."
            )
            
            time.sleep(wait_time)
    
    # This should never be reached, but just in case
    if last_exception:
        raise last_exception


class JwtCache:
    def __init__(self) -> None:
        self.token: str = ""
        self.expiration: dt.datetime = dt.datetime.min

    def get_token(self) -> str | None:
        # Only use token if it's got more than 5 minutes left
        if self.token and self.expiration > dt.datetime.now(tz=pytz.UTC) + dt.timedelta(minutes=5):
            return self.token
        return None

    def set_token(self, token: str, expiration: dt.datetime):
        self.token = token
        self.expiration = expiration


jwt_cache = JwtCache()


def get_jwt(config: Config) -> str:
    if cached_token := jwt_cache.get_token():
        logger.debug("Using cached JWT")
        return cached_token

    url = config.keycloak_host.rstrip("/") + "/" + config.keycloak_token_path.lstrip("/")
    data = {
        "client_id": "backend-client",
        "username": config.keycloak_user,
        "password": config.keycloak_password,
        "grant_type": "password",
    }

    logger.debug(f"Requesting JWT from {url}")

    with requests.post(url, data=data, timeout=config.backend_timeout_seconds) as response:
        if response.ok:
            logger.debug("JWT fetched successfully.")
            token = response.json()["access_token"]
            decoded = jwt.decode(token, options={"verify_signature": False})
            expiration = dt.datetime.fromtimestamp(decoded.get("exp", 0), tz=pytz.UTC)
            jwt_cache.set_token(token, expiration)
            return token
        error_msg = f"Fetching JWT failed with status code {response.status_code}: {response.text}"
        logger.error(error_msg)
        raise Exception(error_msg)


def parse_ndjson(ndjson_data: str) -> Sequence[UnprocessedEntry]:
    entries: list[UnprocessedEntry] = []
    if len(ndjson_data) == 0:
        return entries
    for json_str in ndjson_data.split("\n"):
        if len(json_str) == 0 or json_str.isspace():
            continue
        # Loculus currently cannot handle non-breaking spaces.
        json_str_processed = json_str.replace("\N{NO-BREAK SPACE}", " ")
        try:
            json_object = json.loads(json_str_processed)
        except json.JSONDecodeError as e:
            error_msg = f"Failed to parse JSON: {json_str_processed}"
            raise ValueError(error_msg) from e
        unaligned_nucleotide_sequences = json_object["data"]["unalignedNucleotideSequences"]
        trimmed_unaligned_nucleotide_sequences = {
            key: trim_ns(value) if value else None
            for key, value in unaligned_nucleotide_sequences.items()
        }
        unprocessed_data = UnprocessedData(
            submitter=json_object["submitter"],
            group_id=json_object["groupId"],
            submittedAt=json_object["submittedAt"],
            metadata=json_object["data"]["metadata"],
            unalignedNucleotideSequences=trimmed_unaligned_nucleotide_sequences
            if unaligned_nucleotide_sequences
            else {},
        )
        entry = UnprocessedEntry(
            accessionVersion=f"{json_object['accession']}.{json_object['version']}",
            data=unprocessed_data,
        )
        entries.append(entry)
    return entries


def fetch_unprocessed_sequences(
    etag: str | None, config: Config
) -> tuple[str | None, Sequence[UnprocessedEntry] | None]:
    """
    Fetch unprocessed sequences from backend with retry logic and exponential backoff.
    """
    def _do_fetch():
        n = config.batch_size
        url = config.backend_host.rstrip("/") + "/extract-unprocessed-data"
        logger.debug(f"Fetching {n} unprocessed sequences from {url}")
        params = {"numberOfSequenceEntries": n, "pipelineVersion": config.pipeline_version}
        headers = {
            "Authorization": "Bearer " + get_jwt(config),
            **({"If-None-Match": etag} if etag else {}),
        }
        logger.debug(f"Requesting data with ETag: {etag}")
        response = requests.post(url, data=params, headers=headers, timeout=config.backend_timeout_seconds)
        logger.info(
            f"Unprocessed data from backend: status code {response.status_code}, "
            f"request id: {response.headers.get('x-request-id')}"
        )
        return response

    response = retry_with_exponential_backoff(_do_fetch, config)

    match response.status_code:
        case HTTPStatus.NOT_MODIFIED:
            return etag, None
        case HTTPStatus.OK:
            try:
                parsed_ndjson = parse_ndjson(response.text)
            except ValueError as e:
                logger.error(e)
                time.sleep(10 * 1)
                return None, None
            return response.headers["ETag"], parsed_ndjson
        case HTTPStatus.UNPROCESSABLE_ENTITY:
            logger.debug(f"{response.text}.\nSleeping for a while.")
            time.sleep(60 * 1)
            return None, None
        case _:
            msg = f"Fetching unprocessed data failed. Status code: {response.status_code}"
            raise Exception(
                msg,
                response.text,
            )


def submit_processed_sequences(
    processed: Sequence[ProcessedEntry], dataset_dir: str, config: Config
) -> None:
    """
    Submit processed sequences to backend with retry logic and exponential backoff.
    """
    json_strings = [json.dumps(dataclasses.asdict(sequence)) for sequence in processed]
    if config.keep_tmp_dir:
        # For debugging: write all submit requests to submission_requests.json
        with open(dataset_dir + "/submission_requests.json", "w", encoding="utf-8") as f:
            for seq in processed:
                json.dump(dataclasses.asdict(seq), f)
    ndjson_string = "\n".join(json_strings)

    def _do_submit():
        url = config.backend_host.rstrip("/") + "/submit-processed-data"
        headers = {
            "Content-Type": "application/x-ndjson",
            "Authorization": "Bearer " + get_jwt(config),
        }
        params = {"pipelineVersion": config.pipeline_version}
        response = requests.post(url, data=ndjson_string, headers=headers, params=params, timeout=config.backend_timeout_seconds)
        return response

    response = retry_with_exponential_backoff(_do_submit, config)

    if not response.ok:
        Path("failed_submission.json").write_text(ndjson_string, encoding="utf-8")
        msg = (
            f"Submitting processed data failed. Status code: {response.status_code}, "
            f"request id: {response.headers.get('x-request-id')}\n"
            f"Response: {response.text}\n"
            f"Data sent: {ndjson_string[:1000]}...\n"
        )
        raise RuntimeError(msg)
    logger.info("Processed data submitted successfully")


def request_upload(group_id: int, number_of_files: int, config: Config) -> Sequence[FileUploadInfo]:
    """
    Request upload URLs from backend with retry logic and exponential backoff.
    """
    def _do_request():
        # we need to parse the backend URL, to extract the API path without the organism component
        parsed = urlparse(config.backend_host)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        url = base_url + "/files/request-upload"
        params = {"groupId": group_id, "numberFiles": number_of_files}
        headers = {"Authorization": "Bearer " + get_jwt(config)}
        response = requests.post(url, headers=headers, params=params, timeout=config.backend_timeout_seconds)
        return response

    response = retry_with_exponential_backoff(_do_request, config)

    if not response.ok:
        msg = f"Upload request failed: {response.status_code}, {response.text}"
        raise RuntimeError(msg)
    return [FileUploadInfo(**item) for item in response.json()]


def upload_embl_file_to_presigned_url(content: str, url: str) -> None:
    headers = {"Content-Type": "chemical/x-embl-dl-nucleotide"}
    r = requests.put(url, data=content.encode("utf-8"), headers=headers, timeout=60)
    if not r.ok:
        msg = f"Upload failed: {r.status_code}, {r.text}"
        raise RuntimeError(msg)


def download_minimizer(url, save_path):
    try:
        response = requests.get(url, timeout=30)  # Use a reasonable timeout for downloads
        response.raise_for_status()

        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        Path(save_path).write_bytes(response.content)

        logger.info(f"Minimizer downloaded successfully and saved to '{save_path}'")

    except requests.exceptions.RequestException as e:
        msg = f"Failed to download minimizer: {e}"
        logger.error(msg)
        raise RuntimeError(msg) from e
