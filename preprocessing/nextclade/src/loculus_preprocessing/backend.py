"""Functions to interface with the backend"""

import dataclasses
import datetime as dt
import json
import logging
import time
from collections.abc import Sequence
from http import HTTPStatus
from pathlib import Path

import jwt
import pytz
import requests

from .config import Config
from .datatypes import (
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
    n = config.batch_size
    url = config.backend_host.rstrip("/") + "/extract-unprocessed-data"
    logger.debug(f"Fetching {n} unprocessed sequences from {url}")
    params = {"numberOfSequenceEntries": n, "pipelineVersion": config.pipeline_version}
    headers = {
        "Authorization": "Bearer " + get_jwt(config),
        **({"If-None-Match": etag} if etag else {}),
    }
    logger.debug(f"Requesting data with ETag: {etag}")
    response = requests.post(url, data=params, headers=headers, timeout=10)
    logger.info(
        f"Unprocessed data from backend: status code {response.status_code}, "
        f"request id: {response.headers.get('x-request-id')}"
    )
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
    }
    params = {"pipelineVersion": config.pipeline_version}
    response = requests.post(url, data=ndjson_string, headers=headers, params=params, timeout=10)
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


def download_minimizer(url, save_path):
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()

        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        Path(save_path).write_bytes(response.content)

        logger.info(f"Minimizer downloaded successfully and saved to '{save_path}'")

    except requests.exceptions.RequestException as e:
        msg = f"Failed to download minimizer: {e}"
        logger.error(msg)
        raise RuntimeError(msg) from e
