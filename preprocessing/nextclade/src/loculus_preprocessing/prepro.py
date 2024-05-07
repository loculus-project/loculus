import csv
import dataclasses
import json
import logging
import subprocess  # noqa: S404
import sys
import time
from collections.abc import Sequence
from http import HTTPStatus
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import dpath
import requests
from Bio import SeqIO

from .backend import get_jwt
from .config import Config
from .datatypes import (
    AccessionVersion,
    AminoAcidInsertion,
    AminoAcidSequence,
    AnnotationSource,
    AnnotationSourceType,
    GeneName,
    NucleotideInsertion,
    NucleotideSequence,
    ProcessedData,
    ProcessedEntry,
    ProcessedMetadata,
    ProcessingAnnotation,
    ProcessingInput,
    ProcessingSpec,
    UnprocessedAfterNextclade,
    UnprocessedData,
    UnprocessedEntry,
)
from .processing_functions import ProcessingFunctions

# https://stackoverflow.com/questions/15063936
csv.field_size_limit(sys.maxsize)


def fetch_unprocessed_sequences(n: int, config: Config) -> Sequence[UnprocessedEntry]:
    url = config.backend_host.rstrip("/") + "/extract-unprocessed-data"
    logging.debug(f"Fetching {n} unprocessed sequences from {url}")
    params = {"numberOfSequenceEntries": n, "pipelineVersion": config.pipeline_version}
    headers = {"Authorization": "Bearer " + get_jwt(config)}
    response = requests.post(url, data=params, headers=headers, timeout=10)
    if not response.ok:
        if response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY:
            logging.debug(f"{response.text}.\nSleeping for a while.")
            time.sleep(60 * 10)
            return []
        msg = f"Fetching unprocessed data failed. Status code: {response.status_code}"
        raise Exception(
            msg,
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
) -> dict[AccessionVersion, UnprocessedAfterNextclade]:
    unaligned_nucleotide_sequences: dict[AccessionVersion, NucleotideSequence] = {}
    input_metadata: dict[AccessionVersion, dict[str, Any]] = {}
    aligned_aminoacid_sequences: dict[
        AccessionVersion, dict[GeneName, AminoAcidSequence | None]
    ] = {}
    for entry in unprocessed:
        id = entry.accessionVersion
        unaligned_nucleotide_sequences[id] = entry.data.unalignedNucleotideSequences["main"]
        input_metadata[id] = entry.data.metadata
        aligned_aminoacid_sequences[id] = {}
        for gene in config.genes:
            aligned_aminoacid_sequences[id][gene] = None

    with TemporaryDirectory(delete=not config.keep_tmp_dir) as result_dir:
        # TODO: Generalize for multiple segments (flu)
        input_file = result_dir + "/input.fasta"
        with open(input_file, "w", encoding="utf-8") as f:
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
        exit_code = subprocess.run(command, check=False).returncode  # noqa: S603
        if exit_code != 0:
            msg = f"nextclade failed with exit code {exit_code}"
            raise Exception(msg)

        logging.debug(f"Nextclade results available in {result_dir}")

        aligned_nucleotide_sequences: dict[AccessionVersion, NucleotideSequence] = {}
        with open(result_dir + "/nextclade.aligned.fasta", encoding="utf-8") as aligned_nucs:
            aligned_nuc = SeqIO.parse(aligned_nucs, "fasta")
            for aligned_sequence in aligned_nuc:
                sequence_id: str = aligned_sequence.id
                aligned_nucleotide_sequences[sequence_id] = str(aligned_sequence.seq)

        for gene in config.genes:
            translation_path = result_dir + f"/nextclade.cds_translation.{gene}.fasta"
            try:
                with open(translation_path, encoding="utf-8") as aligned_translations:
                    aligned_translation = SeqIO.parse(aligned_translations, "fasta")
                    for aligned_sequence in aligned_translation:
                        sequence_id = aligned_sequence.id
                        aligned_aminoacid_sequences[sequence_id][gene] = str(aligned_sequence.seq)
            except FileNotFoundError:
                # TODO: Add warning to each sequence
                logging.info(
                    f"Gene {gene} not found in Nextclade results expected at: {translation_path}"
                )

        nextclade_metadata = parse_nextclade_json(result_dir)
        nucleotide_insertions, amino_acid_insertions = parse_nextclade_tsv(result_dir, config)

    return {
        id: UnprocessedAfterNextclade(
            inputMetadata=input_metadata[id],
            nextcladeMetadata=nextclade_metadata.get(id),
            unalignedNucleotideSequences=unaligned_nucleotide_sequences[id],
            alignedNucleotideSequences=aligned_nucleotide_sequences.get(id),
            nucleotideInsertions=nucleotide_insertions.get(id, []),
            alignedAminoAcidSequences=aligned_aminoacid_sequences.get(id, {}),
            aminoAcidInsertions=amino_acid_insertions[id],
        )
        for id in unaligned_nucleotide_sequences
    }


def parse_nextclade_tsv(
    result_dir: str, config: Config
) -> tuple[
    dict[AccessionVersion, list[NucleotideInsertion]],
    dict[AccessionVersion, dict[GeneName, list[AminoAcidInsertion]]],
]:
    nucleotide_insertions: dict[AccessionVersion, list[NucleotideInsertion]] = {}
    amino_acid_insertions: dict[AccessionVersion, dict[GeneName, list[AminoAcidInsertion]]] = {}
    with open(result_dir + "/nextclade.tsv", encoding="utf-8") as nextclade_tsv:
        reader = csv.DictReader(nextclade_tsv, delimiter="\t")
        for row in reader:
            id = row["seqName"]

            nuc_ins_str = list(row["insertions"].split(","))
            nucleotide_insertions[id] = [] if nuc_ins_str == [""] else nuc_ins_str

            aa_ins: dict[str, list[str]] = {gene: [] for gene in config.genes}
            aa_ins_split = row["aaInsertions"].split(",")
            for ins in aa_ins_split:
                if not ins:
                    continue
                gene, val = ins.split(":", maxsplit=1)
                if gene in aa_ins:
                    aa_ins[gene].append(val)
                    logging.debug(
                        "Note: Nextclade found AA insertion in gene missing from config in gene "
                        f"{gene}: {val}"
                    )
            amino_acid_insertions[id] = aa_ins
    return nucleotide_insertions, amino_acid_insertions


def parse_nextclade_json(result_dir) -> dict[AccessionVersion, dict[str, Any]]:
    nextclade_metadata = {}
    with open(result_dir + "/nextclade.json", encoding="utf-8") as nextclade_json:
        for result in json.load(nextclade_json)["results"]:
            id = result["seqName"]
            nextclade_metadata[id] = result
    return nextclade_metadata


def accession_from_str(id_str: AccessionVersion) -> str:
    return id_str.split(".")[0]


def version_from_str(id_str: AccessionVersion) -> int:
    return int(id_str.split(".")[1])


def null_per_backend(x: Any) -> bool:
    match x:
        case None:
            return True
        case "":
            return True
        case _:
            return False


def process_single(
    id: AccessionVersion, unprocessed: UnprocessedAfterNextclade, config: Config
) -> ProcessedEntry:
    """Process a single sequence per config"""
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []
    output_metadata: ProcessedMetadata = {
        "length": len(unprocessed.unalignedNucleotideSequences),
    }

    for output_field, spec_dict in config.processing_spec.items():
        spec = ProcessingSpec(
            inputs=spec_dict["inputs"],
            function=spec_dict["function"],
            required=spec_dict.get("required", False),
            args=spec_dict.get("args", {}),
        )
        input_data: ProcessingInput = {}
        for arg_name, input_path in spec.inputs.items():
            input_data[arg_name] = None
            # If field starts with "nextclade.", take from nextclade metadata
            nextclade_prefix = "nextclade."
            if input_path.startswith(nextclade_prefix):
                # Remove "nextclade." prefix
                if unprocessed.nextcladeMetadata is None:
                    errors.append(
                        ProcessingAnnotation(
                            source=[
                                AnnotationSource(
                                    name="main",
                                    type=AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                                )
                            ],
                            message="Nucleotide sequence failed to align",
                        )
                    )
                    continue
                sub_path = input_path[len(nextclade_prefix) :]
                input_data[arg_name] = str(
                    dpath.get(
                        unprocessed.nextcladeMetadata,
                        sub_path,
                        separator=".",
                        default=None,
                    )
                )
                continue
            if input_path not in unprocessed.inputMetadata:
                warnings.append(
                    ProcessingAnnotation(
                        source=[
                            AnnotationSource(name=input_path, type=AnnotationSourceType.METADATA)
                        ],
                        message=f"Metadata field '{input_path}' not found in input",
                    )
                )
                continue
            input_data[arg_name] = unprocessed.inputMetadata[input_path]
        processing_result = ProcessingFunctions.call_function(
            spec.function, spec.args, input_data, output_field
        )
        errors.extend(processing_result.errors)
        warnings.extend(processing_result.warnings)
        output_metadata[output_field] = processing_result.datum
        if null_per_backend(processing_result.datum) and spec.required:
            logging.warn(
                f"Metadata field {output_field} is required but nullish: "
                f"{processing_result.datum}, setting to 'Not provided'"
            )
            output_metadata[output_field] = "Not provided"

    logging.debug(f"Processed {id}: {output_metadata}")

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


def process_all(
    unprocessed: Sequence[UnprocessedEntry], dataset_dir: str, config: Config
) -> Sequence[ProcessedEntry]:
    nextclade_results = enrich_with_nextclade(unprocessed, dataset_dir, config)
    processed_results = []
    for id, result in nextclade_results.items():
        processed_single = process_single(id, result, config)
        processed_results.append(processed_single)

    return processed_results


def submit_processed_sequences(processed: Sequence[ProcessedEntry], config: Config) -> None:
    json_strings = [json.dumps(dataclasses.asdict(sequence)) for sequence in processed]
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
            f"Data sent in request: {ndjson_string[0:1000]}...\n"
        )
        raise Exception(msg)
    logging.info("Processed data submitted successfully")


def download_nextclade_dataset(dataset_dir: str, config: Config) -> None:
    dataset_download_command = [
        "nextclade3",
        "dataset",
        "get",
        f"--name={config.nextclade_dataset_name}",
        f"--server={config.nextclade_dataset_server}",
        f"--output-dir={dataset_dir}",
    ]

    if config.nextclade_dataset_tag is not None:
        dataset_download_command.append(f"--tag={config.nextclade_dataset_tag}")

    logging.info(f"Downloading Nextclade dataset: {dataset_download_command}")
    if subprocess.run(dataset_download_command, check=False).returncode != 0:  # noqa: S603
        msg = "Dataset download failed"
        raise Exception(msg)
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
            try:
                submit_processed_sequences(processed, config)
            except Exception as e:
                logging.exception(f"Submitting processed data failed. Traceback: {e}")
                continue
            total_processed += len(processed)
            logging.info(f"Processed {len(processed)} sequences")
