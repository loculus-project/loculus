"""Functions to interface with the backend"""

import dataclasses
import datetime as dt
import json
import logging
import time
import uuid
from collections.abc import Sequence
from http import HTTPStatus
from pathlib import Path
from urllib.parse import urlparse

import jwt
import pytz
import requests
from pydantic import ValidationError

from .config import Config
from .datatypes import (
    BackendEntry,
    FileUploadInfo,
    InternalMetadata,
    ProcessedEntry,
    UnprocessedData,
    UnprocessedEntry,
)
from .processing_functions import trim_ns

logger = logging.getLogger(__name__)


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

    with requests.post(url, data=data, timeout=10) as response:
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


def _backend_entry_to_unprocessed(entry: BackendEntry) -> UnprocessedEntry:
    accession_version = f"{entry.accession}.{entry.version}"
    trimmed_sequences = {
        key: trim_ns(value) if value else None
        for key, value in entry.data.unalignedNucleotideSequences.items()
    }
    return UnprocessedEntry(
        accessionVersion=accession_version,
        data=UnprocessedData(
            internal_metadata=InternalMetadata(
                accession_version=accession_version,
                submitter=entry.submitter,
                group_id=entry.groupId,
                submitted_at=entry.submittedAt,
                submission_id=entry.submissionId,
            ),
            metadata=entry.data.metadata,
            unalignedNucleotideSequences=trimmed_sequences if entry.data.unalignedNucleotideSequences else {},
        ),
    )


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
            backend_entry = BackendEntry.model_validate_json(json_str_processed)
        except (json.JSONDecodeError, ValidationError) as e:
            error_msg = f"Failed to parse JSON: {json_str_processed}"
            raise ValueError(error_msg) from e
        entries.append(_backend_entry_to_unprocessed(backend_entry))
    return entries


def fetch_unprocessed_sequences(
    etag: str | None, config: Config
) -> tuple[str | None, Sequence[UnprocessedEntry] | None]:
    request_id = str(uuid.uuid4())
    n = config.batch_size
    url = config.backend_host.rstrip("/") + "/extract-unprocessed-data"
    logger.debug(f"[{request_id}] Fetching {n} unprocessed sequences from {url}")
    params = {"numberOfSequenceEntries": n, "pipelineVersion": config.pipeline_version}
    headers = {
        "Authorization": "Bearer " + get_jwt(config),
        "x-request-id": request_id,
        **({"If-None-Match": etag} if etag else {}),
    }
    logger.debug(f"[{request_id}] Requesting data with ETag: {etag}")
    response = requests.post(
        url, data=params, headers=headers, timeout=config.backend_request_timeout_seconds
    )
    logger.info(
        f"[{request_id}] Unprocessed data from backend: status code {response.status_code}, "
        f"request id: {response.headers.get('x-request-id')}"
    )
    match response.status_code:
        case HTTPStatus.NOT_MODIFIED:
            return etag, None
        case HTTPStatus.OK:
            try:
                parsed_ndjson = parse_ndjson(response.text)
            except ValueError as e:
                logger.error(f"[{request_id}] {e}")
                time.sleep(10 * 1)
                return None, None
            return response.headers["ETag"], parsed_ndjson
        case HTTPStatus.UNPROCESSABLE_ENTITY:
            logger.debug(f"[{request_id}] {response.text}.\nSleeping for a while.")
            time.sleep(60 * 1)
            return None, None
        case _:
            msg = f"[{request_id}] Fetching unprocessed data failed. Status code: {response.status_code}"
            raise Exception(
                msg,
                response.text,
            )


def submit_processed_sequences(
    processed: Sequence[ProcessedEntry], dataset_dir: str, config: Config
) -> None:
    request_id = str(uuid.uuid4())
    json_strings = [json.dumps(dataclasses.asdict(sequence)) for sequence in processed]
    if config.keep_tmp_dir:
        # For debugging: write all submit requests to submission_requests.json
        with open(dataset_dir + "/submission_requests.json", "w", encoding="utf-8") as f:
            for seq in processed:
                json.dump(dataclasses.asdict(seq), f)
    ndjson_string = "\n".join(json_strings)
    url = config.backend_host.rstrip("/") + "/submit-processed-data"
    headers = {
        "Content-Type": "application/x-ndjson",
        "Authorization": "Bearer " + get_jwt(config),
        "x-request-id": request_id,
    }
    params = {"pipelineVersion": config.pipeline_version}
    logger.info(f"[{request_id}] Submitting {len(processed)} processed sequences to {url}")
    response = requests.post(url, data=ndjson_string, headers=headers, params=params, timeout=10)
    if not response.ok:
        Path("failed_submission.json").write_text(ndjson_string, encoding="utf-8")
        msg = (
            f"[{request_id}] Submitting processed data failed. Status code: {response.status_code}, "
            f"request id: {response.headers.get('x-request-id')}\n"
            f"Response: {response.text}\n"
            f"Data sent: {ndjson_string[:1000]}...\n"
        )
        raise RuntimeError(msg)
    logger.info(
        f"[{request_id}] Processed data submitted successfully, request id: {response.headers.get('x-request-id')}"
    )


def request_upload(group_id: int, number_of_files: int, config: Config) -> Sequence[FileUploadInfo]:
    request_id = str(uuid.uuid4())
    # we need to parse the backend URL, to extract the API path without the organism component
    parsed = urlparse(config.backend_host)

    base_url = f"{parsed.scheme}://{parsed.netloc}"
    url = base_url + "/files/request-upload"
    params = {"groupId": group_id, "numberFiles": number_of_files}
    headers = {
        "Authorization": "Bearer " + get_jwt(config),
        "x-request-id": request_id,
    }
    logger.info(
        f"[{request_id}] Requesting upload for {number_of_files} files, group_id: {group_id}"
    )
    response = requests.post(url, headers=headers, params=params, timeout=10)
    if not response.ok:
        msg = f"[{request_id}] Upload request failed: {response.status_code}, request id: {response.headers.get('x-request-id')}, {response.text}"
        raise RuntimeError(msg)
    logger.info(
        f"[{request_id}] Upload request successful, request id: {response.headers.get('x-request-id')}"
    )
    return [FileUploadInfo(**item) for item in response.json()]


def upload_embl_file_to_presigned_url(content: str, url: str) -> None:
    headers = {"Content-Type": "chemical/x-embl-dl-nucleotide"}
    r = requests.put(url, data=content.encode("utf-8"), headers=headers, timeout=60)
    if not r.ok:
        msg = f"Upload failed: {r.status_code}, {r.text}"
        raise RuntimeError(msg)


def download_minimizer(config, save_path):
    if config.minimizer_url:
        url = config.minimizer_url
    elif config.nextclade_dataset_server:
        url = config.nextclade_dataset_server.rstrip("/") + "/minimizer_index.json"
    else:
        msg = "Cannot download minimizer: no minimizer_url or nextclade_dataset_server specified in config"
        logger.error(msg)
        raise RuntimeError(msg)

    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        Path(save_path).write_bytes(response.content)
    except requests.exceptions.RequestException as e:
        msg = f"Failed to download minimizer: {e}"
        logger.error(msg)
        raise RuntimeError(msg) from e

    logger.info(f"Minimizer downloaded successfully and saved to '{save_path}'")


def download_diamond_db(config, save_path):
    url = config.diamond_dmnd_url
    if not url:
        msg = "Cannot download diamond db: no diamond_dmnd_url specified in config"
        logger.error(msg)
        raise RuntimeError(msg)

    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        Path(save_path).write_bytes(response.content)
    except requests.exceptions.RequestException as e:
        msg = f"Failed to download diamond db: {e}"
        logger.error(msg)
        raise RuntimeError(msg) from e

    logger.info(f"Diamond db downloaded successfully and saved to '{save_path}'")
