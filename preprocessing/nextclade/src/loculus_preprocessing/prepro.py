import dataclasses
import json
import logging
import subprocess
import time
from tempfile import TemporaryDirectory
from typing import Any, Sequence

import requests
from Bio import SeqIO

from .backend import get_jwt
from .config import Config
from .datatypes import (
    AccessionVersion,
    AminoAcidSequence,
    AnnotationSource,
    GeneName,
    NucleotideSequence,
    ProcessedData,
    ProcessedEntry,
    ProcessingAnnotation,
    ProcessingInput,
    ProcessingSpec,
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


def enrich_with_nextclade(
    unprocessed: Sequence[UnprocessedEntry], dataset_dir: str, config: Config
) -> dict[AccessionVersion, UnprocessedWithNextclade]:
    unaligned_nucleotide_sequences: dict[AccessionVersion, NucleotideSequence] = {}
    input_metadata: dict[AccessionVersion, dict[str, Any]] = {}
    aligned_aminoacid_sequences: dict[
        AccessionVersion, dict[GeneName, AminoAcidSequence | None]
    ] = {}
    for entry in unprocessed:
        id = entry.accessionVersion
        unaligned_nucleotide_sequences[id] = entry.data.unalignedNucleotideSequences[
            "main"
        ]
        input_metadata[id] = entry.data.metadata
        aligned_aminoacid_sequences[id] = {}
        for gene in config.genes:
            aligned_aminoacid_sequences[id][gene] = None

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

        aligned_nucleotide_sequences: dict[AccessionVersion, NucleotideSequence] = {}
        with open(result_dir + "/nextclade.aligned.fasta", "r") as alignedNucs:
            aligned_nuc = SeqIO.parse(alignedNucs, "fasta")
            for aligned_sequence in aligned_nuc:
                sequence_id: str = aligned_sequence.id
                aligned_nucleotide_sequences[sequence_id] = str(aligned_sequence.seq)

        for gene in config.genes:
            translation_path = result_dir + f"/nextclade.cds_translation.{gene}.fasta"
            try:
                with open(translation_path) as alignedTranslations:
                    aligned_translation = SeqIO.parse(alignedTranslations, "fasta")
                    for aligned_sequence in aligned_translation:
                        sequence_id = aligned_sequence.id
                        aligned_aminoacid_sequences[sequence_id][gene] = str(
                            aligned_sequence.seq
                        )
            except FileNotFoundError:
                # TODO: Add warning to each sequence
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
            nextcladeMetadata=nextclade_metadata.get(id, None),
            unalignedNucleotideSequences=unaligned_nucleotide_sequences[id],
            alignedNucleotideSequences=aligned_nucleotide_sequences.get(id, None),
            nucleotideInsertions=[],
            alignedAminoAcidSequences=aligned_aminoacid_sequences.get(id, {}),
            aminoAcidInsertions={gene: [] for gene in config.genes},
        )
        for id in unaligned_nucleotide_sequences.keys()
    }


def accession_from_str(id_str: AccessionVersion) -> str:
    return id_str.split(".")[0]


def version_from_str(id_str: AccessionVersion) -> int:
    return int(id_str.split(".")[1])


def nullish(x: Any) -> bool:
    match x:
        case None:
            return True
        case "":
            return True
        case _:
            return False


def process_single(
    id: AccessionVersion, unprocessed: UnprocessedWithNextclade, config: Config
) -> ProcessedEntry:
    """Process a single sequence per config"""
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []
    output_metadata = {}

    for output_field, spec_dict in config.processing_spec.items():
        spec = ProcessingSpec(
            inputs=spec_dict["inputs"],
            function=spec_dict["function"],
            required=spec_dict.get("required", False),
        )
        input_data: ProcessingInput = {}
        for arg_name, input_path in spec.inputs.items():
            input_data[arg_name] = None
            # If field starts with "nextclade.", take from nextclade metadata
            if input_path.startswith("nextclade."):
                # Remove "nextclade." prefix
                input_path = input_path[10:]
                if unprocessed.nextcladeMetadata is None:
                    errors.append(
                        ProcessingAnnotation(
                            source=[
                                AnnotationSource(name="main", type="NucleotideSequence")
                            ],
                            message="Nucleotide sequence failed to align",
                        )
                    )
                    continue
                input_data[arg_name] = unprocessed.nextcladeMetadata[input_path]
                continue
            if input_path not in unprocessed.inputMetadata:
                errors.append(
                    ProcessingAnnotation(
                        source=[AnnotationSource(name=input_path, type="Metadata")],
                        message=f"Metadata field {input_path} not found",
                    )
                )
                continue
            input_data[arg_name] = unprocessed.inputMetadata[input_path]
        processing_result = ProcessingFunctions.call_function(
            spec.function, input_data, output_field
        )
        errors.extend(processing_result.errors)
        warnings.extend(processing_result.warnings)
        output_metadata[output_field] = processing_result.datum
        if nullish(processing_result.datum) and spec.required:
            logging.warn(
                f"Metadata field {output_field} is required but nullish: {processing_result.datum}, setting to None"
            )
            output_metadata[output_field] = None

    logging.debug(f"Processed {id}: {output_metadata}")

    return ProcessedEntry(
        accession=accession_from_str(id),
        version=version_from_str(id),
        data=ProcessedData(
            metadata=output_metadata,
            unalignedNucleotideSequences={
                "main": unprocessed.unalignedNucleotideSequences
            },
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

    return processed_results


def submit_processed_sequences(
    processed: Sequence[ProcessedEntry], config: Config
) -> None:
    json_strings = [json.dumps(dataclasses.asdict(sequence)) for sequence in processed]
    ndjson_string = "\n".join(json_strings)
    url = config.backend_host.rstrip("/") + "/submit-processed-data"
    headers = {
        "Content-Type": "application/x-ndjson",
        "Authorization": "Bearer " + get_jwt(config),
    }
    response = requests.post(url, data=ndjson_string, headers=headers)
    if not response.ok:
        with open("failed_submission.json", "w") as f:
            f.write(ndjson_string)
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
