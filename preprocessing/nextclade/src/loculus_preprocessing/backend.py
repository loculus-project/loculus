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
        logging.debug("Using cached JWT")
        return cached_token

    url = config.keycloak_host.rstrip("/") + "/" + config.keycloak_token_path.lstrip("/")
    data = {
        "client_id": "backend-client",
        "username": config.keycloak_user,
        "password": config.keycloak_password,
        "grant_type": "password",
    }

    logging.debug(f"Requesting JWT from {url}")

    with requests.post(url, data=data, timeout=10) as response:
        if response.ok:
            logging.debug("JWT fetched successfully.")
            token = response.json()["access_token"]
            decoded = jwt.decode(token, options={"verify_signature": False})
            expiration = dt.datetime.fromtimestamp(decoded.get("exp", 0), tz=pytz.UTC)
            jwt_cache.set_token(token, expiration)
            return token
        error_msg = f"Fetching JWT failed with status code {response.status_code}: {response.text}"
        logging.error(error_msg)
        raise Exception(error_msg)


def parse_ndjson(ndjson_data: str) -> Sequence[UnprocessedEntry]:
    entries: list[UnprocessedEntry] = []
    if len(ndjson_data) == 0:
        return entries
    for json_str in ndjson_data.split("\n"):
        if len(json_str) == 0:
            continue
        # Loculus currently cannot handle non-breaking spaces.
        json_str_processed = json_str.replace("\N{NO-BREAK SPACE}", " ")
        json_object = json.loads(json_str_processed)
        unprocessed_data = UnprocessedData(
            submitter=json_object["submitter"],
            metadata=json_object["data"]["metadata"],
            unalignedNucleotideSequences=json_object["data"]["unalignedNucleotideSequences"],
        )
        entry = UnprocessedEntry(
            accessionVersion=f"{json_object['accession']}.{
                json_object['version']}",
            data=unprocessed_data,
        )
        entries.append(entry)
    return entries


def fetch_unprocessed_sequences(
    etag: str | None, config: Config
) -> tuple[str | None, Sequence[UnprocessedEntry] | None]:
    n = config.batch_size
    url = config.backend_host.rstrip("/") + "/extract-unprocessed-data"
    logging.debug(f"Fetching {n} unprocessed sequences from {url}")
    params = {"numberOfSequenceEntries": n, "pipelineVersion": config.pipeline_version}
    headers = {
        "Authorization": "Bearer " + get_jwt(config),
        **({"If-None-Match": etag} if etag else {}),
    }
    logging.debug(f"Requesting data with ETag: {etag}")
    response = requests.post(url, data=params, headers=headers, timeout=10)
    match response.status_code:
        case HTTPStatus.NOT_MODIFIED:
            return etag, None
        case HTTPStatus.OK:
            return response.headers["ETag"], parse_ndjson(response.text)
        case HTTPStatus.UNPROCESSABLE_ENTITY:
            logging.debug(f"{response.text}.\nSleeping for a while.")
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
            f"Submitting processed data failed. Status code: {response.status_code}\n"
            f"Response: {response.text}\n"
            f"Data sent: {ndjson_string[:1000]}...\n"
        )
        raise RuntimeError(msg)
    logging.info("Processed data submitted successfully")
