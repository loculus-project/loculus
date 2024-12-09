import argparse
import dataclasses
import json
import logging
import random
import time
from dataclasses import dataclass, field

import requests

logging.basicConfig(level=logging.DEBUG)

parser = argparse.ArgumentParser()
parser.add_argument(
    "--backend-host",
    type=str,
    default="http://127.0.0.1:8079",
    help="Host address of the loculus backend",
)
parser.add_argument(
    "--watch",
    action="store_true",
    help="Watch and keep running. Fetches new data every 10 seconds.",
)
parser.add_argument("--withErrors", action="store_true", help="Add errors to processed data.")
parser.add_argument("--withWarnings", action="store_true", help="Add warnings to processed data.")
parser.add_argument(
    "--randomWarnError", action="store_true", help="Make errors and warnings occur stochastically"
)
parser.add_argument(
    "--maxSequences", type=int, help="Max number of sequence entry versions to process."
)
parser.add_argument(
    "--keycloak-host", type=str, default="http://172.0.0.1:8083", help="Host address of Keycloak"
)
parser.add_argument(
    "--keycloak-user",
    type=str,
    default="preprocessing_pipeline",
    help="Keycloak user to use for authentication",
)
parser.add_argument(
    "--keycloak-password", type=str, help="Keycloak password to use for authentication"
)
parser.add_argument(
    "--keycloak-token-path",
    type=str,
    default="/realms/loculus/protocol/openid-connect/token",
    help="Path to Keycloak token endpoint",
)
parser.add_argument("--pipeline-version", type=int, default=1)

args = parser.parse_args()
backendHost = args.backend_host
watch_mode = args.watch
addErrors = args.withErrors
addWarnings = args.withWarnings
randomWarnError = args.randomWarnError
keycloakHost = args.keycloak_host
keycloakUser = args.keycloak_user
keycloakPassword = args.keycloak_password
keycloakTokenPath = args.keycloak_token_path
pipeline_version = args.pipeline_version


@dataclass
class AnnotationSource:
    name: str
    type: str


@dataclass
class ProcessingAnnotation:
    unprocessedFields: list[AnnotationSource]  # noqa: N815
    processedFields: list[AnnotationSource]  # noqa: N815
    message: str


@dataclass
class Sequence:
    accession: int
    version: int
    data: dict
    errors: list[ProcessingAnnotation] = field(default_factory=list)
    warnings: list[ProcessingAnnotation] = field(default_factory=list)


def fetch_unprocessed_sequences(etag: str | None, n: int) -> tuple[str | None, list[Sequence]]:
    url = backendHost + "/extract-unprocessed-data"
    params = {"numberOfSequenceEntries": n, "pipelineVersion": pipeline_version}
    headers = {
        "Authorization": "Bearer " + get_jwt(),
        **({"If-None-Match": etag} if etag else {}),
    }
    response = requests.post(url, data=params, headers=headers)
    match response.status_code:
        case 200:
            return response.headers.get("ETag"), parse_ndjson(response.text)
        case 304:
            return etag, []
        case 422:
            logging.debug(f"{response.text}. Sleeping for a while.")
            time.sleep(60 * 10)
            return None, []
        case _:
            raise Exception(
                f"Fetching unprocessed data failed. Status code: {response.status_code}",
                response.text,
            )


def parse_ndjson(ndjson_data: str) -> list[Sequence]:
    json_strings = ndjson_data.split("\n")
    entries = []
    for json_str in json_strings:
        if json_str:
            json_object = json.loads(json_str)
            entries.append(
                Sequence(json_object["accession"], json_object["version"], json_object["data"])
            )
    return entries


def process(unprocessed: list[Sequence]) -> list[Sequence]:
    with open("mock-sequences.json", "r") as f:
        mock_sequences = json.load(f)
    possible_lineages = ["A.1", "A.1.1", "A.2"]

    processed = []
    for sequence in unprocessed:
        metadata = sequence.data.get("metadata", {})
        metadata["pangoLineage"] = random.choice(possible_lineages)

        updated_sequence = Sequence(
            sequence.accession,
            sequence.version,
            {"metadata": metadata, **mock_sequences},
        )

        disable_randomly = randomWarnError and random.choice([True, True, False])
        if addErrors and not disable_randomly:
            updated_sequence.errors = [
                ProcessingAnnotation(
                    unprocessedFields=[AnnotationSource(list(metadata.keys())[0], "Metadata")],
                    processedFields=[AnnotationSource(list(metadata.keys())[0], "Metadata")],
                    message="This is a metadata error",
                ),
                ProcessingAnnotation(
                    unprocessedFields=[
                        AnnotationSource(
                            list(mock_sequences["alignedNucleotideSequences"].keys())[0],
                            "NucleotideSequence",
                        )
                    ],
                    processedFields=[
                        AnnotationSource(
                            list(mock_sequences["alignedNucleotideSequences"].keys())[0],
                            "NucleotideSequence",
                        )
                    ],
                    message="This is a sequence error",
                ),
            ]

        disable_randomly = randomWarnError and random.choice([True, False])
        if addWarnings and not disable_randomly:
            updated_sequence.warnings = [
                ProcessingAnnotation(
                    unprocessedFields=[AnnotationSource(list(metadata.keys())[0], "Metadata")],
                    processedFields=[AnnotationSource(list(metadata.keys())[0], "Metadata")],
                    message="This is a metadata warning",
                ),
                ProcessingAnnotation(
                    unprocessedFields=[
                        AnnotationSource(
                            list(mock_sequences["alignedNucleotideSequences"].keys())[0],
                            "NucleotideSequence",
                        )
                    ],
                    processedFields=[
                        AnnotationSource(
                            list(mock_sequences["alignedNucleotideSequences"].keys())[0],
                            "NucleotideSequence",
                        )
                    ],
                    message="This is a sequence warning",
                ),
            ]

        processed.append(updated_sequence)

    return processed


def submit_processed_sequences(processed: list[Sequence]):
    logging.info(sequence for sequence in processed)
    json_strings = [json.dumps(dataclasses.asdict(sequence)) for sequence in processed]
    ndjson_string = "\n".join(json_strings)
    logging.info(ndjson_string)
    url = backendHost + "/submit-processed-data?pipelineVersion=" + str(pipeline_version)
    headers = {"Content-Type": "application/x-ndjson", "Authorization": "Bearer " + get_jwt()}
    response = requests.post(url, data=ndjson_string, headers=headers)
    if not response.ok:
        raise Exception(
            f"Submitting processed data failed. Status code: {response.status_code}",
            response.text,
        )


def get_jwt():
    url = keycloakHost + keycloakTokenPath
    data = {
        "client_id": "backend-client",
        "username": keycloakUser,
        "password": keycloakPassword,
        "grant_type": "password",
    }
    response = requests.post(url, data=data)
    if not response.ok:
        raise Exception(f"Fetching JWT failed. Status code: {response.status_code}", response.text)
    return response.json()["access_token"]


def main():
    total_processed = 0
    locally_processed = 0
    etag = None
    last_force_refresh = time.time()

    if watch_mode:
        logging.debug("Started in watch mode - waiting 10 seconds before fetching data.")
        time.sleep(10)

    sequences_to_fetch = args.maxSequences if args.maxSequences and args.maxSequences < 100 else 100

    while True:
        if last_force_refresh + 3600 < time.time():
            etag = None
            last_force_refresh = time.time()

        etag, unprocessed = fetch_unprocessed_sequences(etag, sequences_to_fetch)
        if len(unprocessed) == 0:
            if watch_mode:
                logging.debug(f"Processed {locally_processed} sequences. Sleeping for 10 seconds.")
                time.sleep(2)
                locally_processed = 0
                continue
            break
        etag = None
        processed = process(unprocessed)
        submit_processed_sequences(processed)
        total_processed += len(processed)
        locally_processed += len(processed)

        if args.maxSequences and total_processed >= args.maxSequences:
            break
    logging.debug(f"Total processed sequences: {total_processed}")


if __name__ == "__main__":
    main()
