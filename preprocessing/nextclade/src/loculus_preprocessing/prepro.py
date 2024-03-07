import dataclasses
import json
import logging
import subprocess
import time
from collections.abc import Sequence
from tempfile import TemporaryDirectory
from typing import Any

import requests
from Bio import SeqIO

from .backend import get_jwt
from .config import Config
from .datatypes import (
    AccessionVersion,
    AminoAcidSequence,
    GeneName,
    NucleotideSequence,
    ProcessedData,
    ProcessedEntry,
    ProcessingAnnotation,
    UnprocessedData,
    UnprocessedEntry,
    UnprocessedWithNextclade,
)
from .processing_functions import ProcessingFunctions


def fetch_unprocessed_sequences(n: int, config: Config) -> Sequence[UnprocessedEntry]:
    url = config.backend_host.rstrip("/") + "/extract-unprocessed-data"
    logging.debug(f"Fetching {n} unprocessed sequences from {url}")
    params = {"numberOfSequenceEntries": n}
    headers = {"Authorization": "Bearer " + get_jwt(config)}
    response = requests.post(url, data=params, headers=headers)
    if not response.ok:
        raise Exception(
            "Fetching unprocessed data failed. Status code: {}".format(response.status_code),
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
            unalignedNucleotideSequences=json_object["data"]["unalignedNucleotideSequences"],
        )
        entry = UnprocessedEntry(
            accessionVersion=f"{json_object['accession']}.{json_object['version']}",
            data=unprocessed_data,
        )
        entries.append(entry)
    return entries


def enrich_with_nextclade(
    unprocessed: Sequence[UnprocessedEntry], dataset_dir: str, config: Config
) -> dict[AccessionVersion, UnprocessedWithNextclade]:
    unaligned_nucleotide_sequences: dict[AccessionVersion, NucleotideSequence] = {}
    input_metadata: dict[AccessionVersion, dict[str, Any]] = {}
    for entry in unprocessed:
        id = entry.accessionVersion
        unaligned_nucleotide_sequences[id] = entry.data.unalignedNucleotideSequences["main"]
        input_metadata[id] = entry.data.metadata

    with TemporaryDirectory(delete=not config.keep_tmp_dir) as result_dir:
        # TODO: Generalize for multiple segments (flu)
        input_file = result_dir + "/input.fasta"
        with open(input_file, "w") as f:
            for id, sequence in unaligned_nucleotide_sequences.items():
                f.write(f">{id}\n")
                f.write(f"{sequence}\n")

        command = [
            "nextclade3",
            "run",
            f"--output-all={result_dir}",
            f"--input-dataset={dataset_dir}",
            f"--output-translations={result_dir}/nextclade.cds_translation.{{cds}}.fasta",
            "--",
            f"{input_file}",
        ]
        logging.debug(f"Running nextclade: {command}")

        # TODO: Capture stderr and log at DEBUG level
        exit_code = subprocess.run(command).returncode
        if exit_code != 0:
            raise Exception("nextclade failed with exit code {}".format(exit_code))

        logging.debug(f"Nextclade results available in {result_dir}")

        # TODO: Process metadata. For now, just use "date"
        # for unprocessed_sequence in unprocessed:
        #     logging.debug(f"Metadata: {unprocessed_sequence.data.metadata}")

        # def process_date(date: str) -> str:
        #     """Parse date string. If it's incomplete, add 01-01, if year lacks, add 1900"""
        #     components = date.split("-")

        #     if len(components) == 0 or date == "":
        #         # No date provided
        #         return "1900-01-01"
        #     elif len(components) == 1:
        #         # Only year is provided
        #         return f"{date}-01-01"
        #     elif len(components) == 2:
        #         # Year and month are provided
        #         return f"{date}-01"
        #     elif len(components) == 3:
        #         # Full date is provided
        #         return date
        #     else:
        #         # Invalid date format
        #         raise ValueError("Invalid date format")

        # # TODO: Process metadata. For now, just use "date"
        # processed_metadata = {
        #     unprocessed_sequence.accessionVersion: {
        #         "collection_date": process_date(
        #             unprocessed_sequence.data.metadata["collection_date"]
        #         )
        #     }
        #     for unprocessed_sequence in unprocessed
        # }

        # processed: dict[str, dict[str, Any]] = {
        #     unprocessed_sequence.accessionVersion: {
        #         "unalignedNuc": unprocessed_sequence.data.unalignedNucleotideSequences,
        #         "alignedNuc": "N" * config.reference_length,
        #         "alignedTranslations": {
        #             gene: "X" * gene_length for gene, gene_length in config.genes.items()
        #         },
        #         "metadata": processed_metadata[unprocessed_sequence.accessionVersion],
        #     }
        #     for unprocessed_sequence in unprocessed
        # }

        # Lift aligned nucs
        aligned_nucleotide_sequences: dict[AccessionVersion, NucleotideSequence] = {}
        with open(result_dir + "/nextclade.aligned.fasta", "r") as alignedNucs:
            aligned_nuc = SeqIO.parse(alignedNucs, "fasta")
            for aligned_sequence in aligned_nuc:
                sequence_id: str = aligned_sequence.id
                aligned_nucleotide_sequences[sequence_id] = str(aligned_sequence.seq)

        aligned_aminoacid_sequences: dict[AccessionVersion, dict[GeneName, AminoAcidSequence]] = {}
        for sequence_id in aligned_nucleotide_sequences.keys():
            aligned_aminoacid_sequences[sequence_id] = {}
        for gene in config.genes:
            translation_path = result_dir + f"/nextclade.cds_translation.{gene}.fasta"
            try:
                with open(translation_path) as alignedTranslations:
                    aligned_translation = SeqIO.parse(alignedTranslations, "fasta")
                    for aligned_sequence in aligned_translation:
                        sequence_id = aligned_sequence.id
                        aligned_aminoacid_sequences[sequence_id][gene] = str(aligned_sequence.seq)
            except FileNotFoundError:
                # TODO: Add warning to each sequence
                for id in aligned_aminoacid_sequences.keys():
                    aligned_aminoacid_sequences[id][gene] = ""
                logging.info(
                    f"Gene {gene} not found in Nextclade results expected at: {translation_path}"
                )

        nextclade_metadata: dict[AccessionVersion, dict[str, Any]] = {}
        # TODO: More QC can be lifted from here
        with open(result_dir + "/nextclade.json") as nextclade_json:
            for result in json.load(nextclade_json)["results"]:
                id = result["seqName"]
                nextclade_metadata[id] = result

    return {
        id: UnprocessedWithNextclade(
            inputMetadata=input_metadata[id],
            nextcladeMetadata=nextclade_metadata[id],
            unalignedNucleotideSequences=unaligned_nucleotide_sequences[id],
            alignedNucleotideSequences=aligned_nucleotide_sequences[id],
            nucleotideInsertions=[],
            alignedAminoAcidSequences=aligned_aminoacid_sequences[id],
            aminoAcidInsertions={gene: [] for gene in config.genes},
        )
        for id in unaligned_nucleotide_sequences.keys()
    }


def accession_from_str(id_str: AccessionVersion) -> str:
    return id_str.split(".")[0]


def version_from_str(id_str: AccessionVersion) -> int:
    return int(id_str.split(".")[1])


def process_single(
    id: AccessionVersion, unprocessed: UnprocessedWithNextclade, config: Config
) -> ProcessedEntry:
    """Process a single sequence per config"""
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []
    output_metadata = {}

    for output_field, spec in config.processing_spec.items():
        input_data = {}
        for input_field in spec.inputs:
            # If field starts with "nextclade.", take from nextclade metadata
            if input_field.startswith("nextclade."):
                # Remove "nextclade." prefix
                input_field = input_field[9:]
                input_data[input_field] = unprocessed.nextcladeMetadata[input_field]
                continue
            input_data[input_field] = unprocessed.inputMetadata[input_field]
        processing_result = ProcessingFunctions.call_function(
            spec.function, input_data, output_field
        )
        errors.extend(processing_result.errors)
        warnings.extend(processing_result.warnings)
        output_metadata[output_field] = processing_result.datum

    return ProcessedEntry(
        accession=accession_from_str(id),
        version=version_from_str(id),
        data=ProcessedData(
            metadata=output_metadata,
            unalignedNucleotideSequences={"main": unprocessed.unalignedNucleotideSequences},
            alignedNucleotideSequences={"main": unprocessed.alignedNucleotideSequences},
            nucleotideInsertions={"main": unprocessed.nucleotideInsertions},
            alignedAminoAcidSequences=unprocessed.alignedAminoAcidSequences,
            aminoAcidInsertions=unprocessed.aminoAcidInsertions,
        ),
        errors=errors,
        warnings=warnings,
    )

    # Config defines output metadata, which field to take, and how to process it


def process_all(
    unprocessed: Sequence[UnprocessedEntry], dataset_dir: str, config: Config
) -> Sequence[ProcessedEntry]:
    nextclade_results = enrich_with_nextclade(unprocessed, dataset_dir, config)
    processed_results = []
    for id, result in nextclade_results.items():
        processed_single = process_single(id, result, config)
        processed_results.append(processed_single)

        # ProcessedEntry(
        #     accession=id_from_str(sequence_id),
        #     version=version_from_str(sequence_id),
        #     data=ProcessedData(
        #         metadata=nextclade_results[sequence_id]["metadata"],
        #         unalignedNucleotideSequences=nextclade_results[sequence_id]["unalignedNuc"],
        #         alignedNucleotideSequences={"main": nextclade_results[sequence_id]["alignedNuc"]},
        #         nucleotideInsertions={"main": []},
        #         alignedAminoAcidSequences=nextclade_results[sequence_id]["alignedTranslations"],
        #         aminoAcidInsertions={gene: [] for gene in config.genes},
        #     ),
        # )
        # for sequence_id in nextclade_results.keys()
    # ]

    return processed_results


def submit_processed_sequences(processed: Sequence[ProcessedEntry], config: Config) -> None:
    json_strings = [json.dumps(dataclasses.asdict(sequence)) for sequence in processed]
    ndjson_string = "\n".join(json_strings)
    url = config.backend_host.rstrip("/") + "/submit-processed-data"
    headers = {
        "Content-Type": "application/x-ndjson",
        "Authorization": "Bearer " + get_jwt(config),
    }
    response = requests.post(url, data=ndjson_string, headers=headers)
    if not response.ok:
        raise Exception(
            f"Submitting processed data failed. Status code: {response.status_code}\n"
            + f"Response: {response.text}\n"
            + f"Data sent in request: {ndjson_string[0:1000]}...\n"
        )
    logging.info("Processed data submitted successfully")


def download_nextclade_dataset(dataset_dir: str, config: Config) -> None:
    dataset_download_command = [
        "nextclade3",
        "dataset",
        "get",
        f"--name={config.nextclade_dataset_name}",
        f"--output-dir={dataset_dir}",
    ]

    logging.info(f"Downloading Nextclade dataset: {dataset_download_command}")
    if subprocess.run(dataset_download_command).returncode != 0:
        raise Exception("Dataset download failed")
    logging.info("Nextclade dataset downloaded successfully")


def run(config: Config) -> None:
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as dataset_dir:
        download_nextclade_dataset(dataset_dir, config)
        total_processed = 0
        while True:
            logging.debug("Fetching unprocessed sequences")
            unprocessed = fetch_unprocessed_sequences(config.batch_size, config)
            if len(unprocessed) == 0:
                # sleep 1 sec and try again
                logging.debug("No unprocessed sequences found. Sleeping for 1 second.")
                time.sleep(1)
                continue
            # Process the sequences, get result as dictionary
            processed = process_all(unprocessed, dataset_dir, config)
            # Submit the result
            submit_processed_sequences(processed, config)
            total_processed += len(processed)
            logging.info("Processed {} sequences".format(len(processed)))
