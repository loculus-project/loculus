import argparse
from copy import deepcopy
import dataclasses
import json
import logging
import os
import time
import requests
import yaml
from Bio import SeqIO
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import List, Literal, Optional
from tempfile import TemporaryDirectory


@dataclass
class Config:
    backend_host: str = "http://127.0.0.1:8079"
    keycloak_host: str = "http://172.0.0.1:8083"
    keycloak_user: str = "dummy_preprocessing_pipeline"
    keycloak_password: str = "dummy_preprocessing_pipeline"
    keycloak_token_path: str = "realms/loculusRealm/protocol/openid-connect/token"
    nextclade_dataset_name: str = "nextstrain/mpox/all-clades"
    nextclade_dataset_version: str = "2024-01-16--20-31-02Z"
    config_file: Optional[str] = None
    log_level: str = "DEBUG"
    genes: dict[str, int] = field(default_factory=dict)
    keep_tmp_dir: bool = False
    reference_length: int = 197209
    batch_size: int = 5


def load_config_from_yaml(config_file: str, config: Config):
    config = deepcopy(config)
    with open(config_file, "r") as file:
        yaml_config = yaml.safe_load(file)
        logging.debug(f"Loaded config from {config_file}: {yaml_config}")
    for key, value in yaml_config.items():
        if hasattr(config, key):
            setattr(config, key, value)
    return config


parser = argparse.ArgumentParser()
parser.add_argument(
    "--backend-host",
    type=str,
    help="Host address of the Loculus backend",
)
parser.add_argument("--keycloak-host", type=str, help="Host address of Keycloak")
parser.add_argument(
    "--keycloak-user", type=str, help="Keycloak user to use for authentication"
)
parser.add_argument(
    "--keycloak-password", type=str, help="Keycloak password to use for authentication"
)
parser.add_argument(
    "--keycloak-token-path", type=str, help="Path to Keycloak token endpoint"
)
parser.add_argument("--config-file", type=str, help="Path to config file")
parser.add_argument("--log-level", type=str, help="Log level")
parser.add_argument("--keep-tmp-dir", action="store_true", help="Keep tmp dir")

# Config precedence: CLI args > config file > default

args = parser.parse_args()

logging.basicConfig(level=args.log_level or logging.INFO)

config = Config()

if args.config_file:
    config = load_config_from_yaml(args.config_file, config)

for key, value in vars(args).items():
    if value is not None and hasattr(config, key):
        setattr(config, key, value)
# Use the final configuration values

logging.getLogger().setLevel(config.log_level)

logging.info("Using config: {}".format(config))

AccessionVersion = str


@dataclass
class UnprocessedData:
    metadata: Mapping[str, str]
    unalignedNucleotideSequences: Mapping[str, str]


@dataclass
class UnprocessedEntry:
    accessionVersion: AccessionVersion  # {accession}.{version}
    data: UnprocessedData


@dataclass
class ProcessedData:
    metadata: Mapping[str, str]
    unalignedNucleotideSequences: Mapping[str, str]
    alignedNucleotideSequences: Mapping[str, str]
    nucleotideInsertions: Mapping[str, str]
    alignedAminoAcidSequences: Mapping[str, str]
    aminoAcidInsertions: Mapping[str, str]


@dataclass
class AnnotationSource:
    field: str
    type: Literal["metadata", "nucleotideSequence"]


@dataclass
class ProcessingAnnotation:
    source: AnnotationSource
    affected: AnnotationSource
    message: str


@dataclass
class ProcessedEntry:
    accession: int
    version: int
    data: ProcessedData
    errors: Optional[List[ProcessingAnnotation]] = field(default_factory=list)
    warnings: Optional[List[ProcessingAnnotation]] = field(default_factory=list)


NextcladeResult = Mapping[str, str]


def fetch_unprocessed_sequences(n: int) -> Sequence[UnprocessedEntry]:
    url = config.backend_host.rstrip("/") + "/extract-unprocessed-data"
    logging.debug(f"Fetching {n} unprocessed sequences from {url}")
    params = {"numberOfSequenceEntries": n}
    headers = {"Authorization": "Bearer " + get_jwt()}
    response = requests.post(url, data=params, headers=headers)
    if not response.ok:
        raise Exception(
            "Fetching unprocessed data failed. Status code: {}".format(
                response.status_code
            ),
            response.text,
        )
    return parse_ndjson(response.text)


def parse_ndjson(ndjson_data: str) -> Sequence[UnprocessedEntry]:
    entries = []
    for json_str in ndjson_data.split("\n"):
        if len(json_str) == 0:
            continue
        json_object = json.loads(json_str)
        unprocessed_data = UnprocessedData(
            metadata=json_object["data"]["metadata"],
            unalignedNucleotideSequences=json_object["data"][
                "unalignedNucleotideSequences"
            ],
        )
        entry = UnprocessedEntry(
            accessionVersion=f"{json_object['accession']}.{json_object['version']}",
            data=unprocessed_data,
        )
        entries.append(entry)
    return entries


def run_nextclade(
    unprocessed: Sequence[UnprocessedEntry], dataset_dir: str
) -> Mapping[AccessionVersion, NextcladeResult]:
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as result_dir:
        # TODO: Generalize for multiple segments (flu)
        input_file = result_dir + "/input.fasta"
        with open(input_file, "w") as f:
            for sequence in unprocessed:
                f.write(f">{sequence.accessionVersion}\n")
                f.write(f"{sequence.data.unalignedNucleotideSequences['main']}\n")
        command = " ".join(
            [
                "nextclade3 run",
                f"--output-all {result_dir}",
                f"--input-dataset {dataset_dir}",
                f"--output-translations {result_dir}/nextclade.cds_translation.{{cds}}.fasta",
                "--",
                f"{input_file}",
            ]
        )
        logging.debug(f"Running nextclade: {command}")

        # TODO: Capture stderr and log at DEBUG level
        exit_code = os.system(command)
        if exit_code != 0:
            raise Exception("nextclade failed with exit code {}".format(exit_code))

        logging.debug(f"Nextclade results available in {result_dir}")

        # TODO: Process metadata. For now, just use "date"
        for unprocessed_sequence in unprocessed:
            logging.debug(f"Metadata: {unprocessed_sequence.data.metadata}")

        def process_date(date: str) -> str:
            """Parse date string. If it's incomplete, add 01-01, if year lacks, add 1900"""
            components = date.split("-")

            if len(components) == 0 or date == "":
                # No date provided
                return "1900-01-01"
            elif len(components) == 1:
                # Only year is provided
                return f"{date}-01-01"
            elif len(components) == 2:
                # Year and month are provided
                return f"{date}-01"
            elif len(components) == 3:
                # Full date is provided
                return date
            else:
                # Invalid date format
                raise ValueError("Invalid date format")

        # TODO: Process metadata from unprocessed metadata
        processed_metadata = {
            unprocessed_sequence.accessionVersion: {
                "collection_date": process_date(
                    unprocessed_sequence.data.metadata["collection_date"]
                ),
                "release_date": unprocessed_sequence.data.metadata["Release date"],
                "isolate": unprocessed_sequence.data.metadata["Isolate Lineage"],
                "region": unprocessed_sequence.data.metadata["Geographic Region"],
                "location": unprocessed_sequence.data.metadata["Geographic Location"],
                "submitters": unprocessed_sequence.data.metadata["Submitter Names"],
                "affiliation": unprocessed_sequence.data.metadata["Submitter Affiliation"],
            }
            for unprocessed_sequence in unprocessed
        }

        processed = {
            unprocessed_sequence.accessionVersion: {
                "unalignedNuc": unprocessed_sequence.data.unalignedNucleotideSequences,
                "alignedNuc": "N" * config.reference_length,
                "alignedTranslations": {gene: "X" * gene_length  for gene, gene_length in config.genes.items()},
                "metadata": processed_metadata[unprocessed_sequence.accessionVersion],
            }
            for unprocessed_sequence in unprocessed
        }

        with open(result_dir + "/nextclade.aligned.fasta", "r") as alignedNucs:
            aligned_nuc = SeqIO.parse(alignedNucs, "fasta")
            for aligned_sequence in aligned_nuc:
                sequence_id = aligned_sequence.id
                processed[sequence_id]["alignedNuc"] = str(aligned_sequence.seq)

        for gene in config.genes:
            translation_path = result_dir + f"/nextclade.cds_translation.{gene}.fasta"
            try:
                with open(translation_path) as alignedTranslations:
                    aligned_translation = SeqIO.parse(alignedTranslations, "fasta")
                    for aligned_sequence in aligned_translation:
                        sequence_id = aligned_sequence.id
                        processed[sequence_id]["alignedTranslations"][gene] = str(
                            aligned_sequence.seq
                        )
            except FileNotFoundError:
                # TODO: Add warning to each sequence
                for id in processed.keys():
                    processed[id]["alignedTranslations"][gene] = ""
                logging.info(
                    f"Gene {gene} not found in Nextclade results expected at: {translation_path}"
                )

        # TODO: More QC can be lifted from here
        with open(result_dir + "/nextclade.json") as nextclade_json:
            for result in json.load(nextclade_json)["results"]:
                id = result["seqName"]
                processed[id]["metadata"].update({"clade": result["clade"]})
                processed[id]["metadata"].update({"lineage": result["customNodeAttributes"]["lineage"]})
                processed[id]["metadata"].update({"completeness": f"{result["coverage"]}"})
        return processed


def id_from_str(id_str: AccessionVersion) -> int:
    return int(id_str.split(".")[0])


def version_from_str(id_str: AccessionVersion) -> int:
    return int(id_str.split(".")[1])


def process(
    unprocessed: Sequence[UnprocessedEntry], dataset_dir: str
) -> Sequence[ProcessedEntry]:
    nextclade_results = run_nextclade(unprocessed, dataset_dir)
    processed = [
        ProcessedEntry(
            accession=id_from_str(sequence_id),
            version=version_from_str(sequence_id),
            data=ProcessedData(
                metadata=nextclade_results[sequence_id]["metadata"],
                unalignedNucleotideSequences=nextclade_results[sequence_id][
                    "unalignedNuc"
                ],
                alignedNucleotideSequences={
                    "main": nextclade_results[sequence_id]["alignedNuc"]
                },
                nucleotideInsertions={"main": []},
                alignedAminoAcidSequences=nextclade_results[sequence_id][
                    "alignedTranslations"
                ],
                aminoAcidInsertions={gene: [] for gene in config.genes},
            ),
        )
        for sequence_id in nextclade_results.keys()
    ]

    return processed


def submit_processed_sequences(processed: Sequence[ProcessedEntry]):
    json_strings = [json.dumps(dataclasses.asdict(sequence)) for sequence in processed]
    ndjson_string = "\n".join(json_strings)
    url = config.backend_host.rstrip("/") + "/submit-processed-data"
    headers = {
        "Content-Type": "application/x-ndjson",
        "Authorization": "Bearer " + get_jwt(),
    }
    response = requests.post(url, data=ndjson_string, headers=headers)
    if not response.ok:
        raise Exception(
            f"Submitting processed data failed. Status code: {response.status_code}\n"
            + f"Response: {response.text}\n"
            + f"Data sent in request: {ndjson_string[0:1000]}...\n"
        )
    logging.info("Processed data submitted successfully")


def get_jwt():
    url = config.keycloak_host.rstrip("/") + "/" + config.keycloak_token_path.lstrip("/")
    data = {
        "client_id": "test-cli",
        "username": config.keycloak_user,
        "password": config.keycloak_password,
        "grant_type": "password",
    }

    logging.debug(f"Requesting JWT from {url}")

    with requests.post(url, data=data) as response:
        if response.ok:
            logging.debug("JWT fetched successfully.")
            return response.json()["access_token"]
        else:
            error_msg = (
                f"Fetching JWT failed with status code {response.status_code}: "
                f"{response.text}"
            )
            logging.error(error_msg)
            raise Exception(error_msg)


def main():
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as dataset_dir:
        dataset_download_command = " ".join(
            [
                "nextclade3 dataset get",
                f"--name {config.nextclade_dataset_name}",
                f"--output-dir {dataset_dir}",
            ]
        )

        logging.debug(f"Downloading Nextclade dataset: {dataset_download_command}")
        if os.system(dataset_download_command) != 0:
            raise Exception("Dataset download failed")
        total_processed = 0
        while True:
            logging.debug("Fetching unprocessed sequences")
            unprocessed = fetch_unprocessed_sequences(config.batch_size)
            if len(unprocessed) == 0:
                # sleep 1 sec and try again
                logging.debug("No unprocessed sequences found. Sleeping for 1 second.")
                time.sleep(1)
                continue
            # Process the sequences, get result as dictionary
            processed = process(unprocessed, dataset_dir)
            # Submit the result
            submit_processed_sequences(processed)
            total_processed += len(processed)
            logging.info("Processed {} sequences".format(len(processed)))
        logging.info("Total processed sequences: {}".format(total_processed))


if __name__ == "__main__":
    main()
