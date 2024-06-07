import csv
import json
import logging
import os
import subprocess  # noqa: S404
import sys
import time
from collections.abc import Sequence
from tempfile import TemporaryDirectory
from typing import Any, Literal, TypeVar

import dpath
from Bio import SeqIO

from .backend import fetch_unprocessed_sequences, submit_processed_sequences
from .config import Config
from .datatypes import (
    AccessionVersion,
    AminoAcidInsertion,
    AminoAcidSequence,
    AnnotationSource,
    AnnotationSourceType,
    GeneName,
    SegmentName,
    InputMetadata,
    NucleotideInsertion,
    NucleotideSequence,
    ProcessedData,
    ProcessedEntry,
    ProcessedMetadata,
    ProcessingAnnotation,
    ProcessingResult,
    ProcessingSpec,
    UnprocessedAfterNextclade,
    UnprocessedData,
    UnprocessedEntry,
)
from .processing_functions import ProcessingFunctions

# https://stackoverflow.com/questions/15063936
csv.field_size_limit(sys.maxsize)


GenericSequence = TypeVar("GenericSequence", AminoAcidSequence, NucleotideSequence)


# Functions related to reading and writing files


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
            accessionVersion=f"{json_object['accession']}.{
                json_object['version']}",
            data=unprocessed_data,
        )
        entries.append(entry)
    return entries


def parse_nextclade_tsv(
    amino_acid_insertions: dict[AccessionVersion, dict[GeneName, list[AminoAcidInsertion]]],
    nucleotide_insertions: dict[AccessionVersion, dict[SegmentName, list[NucleotideInsertion]]],
    result_dir: str,
    config: Config,
    segment: str,
):
    with open(result_dir + "/nextclade.tsv", encoding="utf-8") as nextclade_tsv:
        reader = csv.DictReader(nextclade_tsv, delimiter="\t")
        for row in reader:
            id = row["seqName"]

            nuc_ins_str: list[NucleotideInsertion] = list(row["insertions"].split(","))
            nucleotide_insertions[id] = {segment: [] if nuc_ins_str == [""] else nuc_ins_str}

            aa_ins: dict[GeneName, list[AminoAcidInsertion]] = {gene: [] for gene in config.genes}
            aa_ins_split = row["aaInsertions"].split(",")
            for ins in aa_ins_split:
                if not ins:
                    continue
                gene, val = ins.split(":", maxsplit=1)
                if gene in aa_ins:
                    aa_ins[gene].append(val)
                else:
                    logging.debug(
                        "Note: Nextclade found AA insertion in gene missing from config in gene "
                        f"{gene}: {val}"
                    )
            amino_acid_insertions[id] = aa_ins
    return nucleotide_insertions, amino_acid_insertions


def parse_nextclade_json(
    result_dir,
    nextclade_metadata: dict[AccessionVersion, dict[SegmentName, dict[str, Any]]],
    segment,
):
    """
    Update nextclade_metadata object with the results of the nextclade analysis
    """
    with open(result_dir + "/nextclade.json", encoding="utf-8") as nextclade_json:
        for result in json.load(nextclade_json)["results"]:
            id = result["seqName"]
            if id not in nextclade_metadata:
                nextclade_metadata[id] = {}
            nextclade_metadata[id][segment] = result
    return nextclade_metadata


def enrich_with_nextclade(
    unprocessed: Sequence[UnprocessedEntry], dataset_dir: str, config: Config
) -> dict[AccessionVersion, UnprocessedAfterNextclade]:
    """
    For each unprocessed segment of each unprocessed sequence use nextclade run to perform alignment
    and QC. The result is a mapping from each AccessionVersion to an
    `UnprocessedAfterNextclade(
            inputMetadata: InputMetadata
            nextcladeMetadata: dict[SegmentName, Any] | None
            unalignedNucleotideSequences: dict[SegmentName, NucleotideSequence | None]
            alignedNucleotideSequences: dict[SegmentName, NucleotideSequence | None]
            nucleotideInsertions: dict[SegmentName, list[NucleotideInsertion]]
            alignedAminoAcidSequences: dict[GeneName, AminoAcidSequence | None]
            aminoAcidInsertions: dict[GeneName, list[AminoAcidInsertion]]
    )` object.
    """
    unaligned_nucleotide_sequences: dict[
        AccessionVersion, dict[SegmentName, NucleotideSequence | None]
    ] = {}
    input_metadata: dict[AccessionVersion, dict[str, Any]] = {}
    aligned_aminoacid_sequences: dict[
        AccessionVersion, dict[GeneName, AminoAcidSequence | None]
    ] = {}
    aligned_nucleotide_sequences: dict[
        AccessionVersion, dict[SegmentName, NucleotideSequence | None]
    ] = {}
    for entry in unprocessed:
        id = entry.accessionVersion
        input_metadata[id] = entry.data.metadata
        aligned_aminoacid_sequences[id] = {}
        unaligned_nucleotide_sequences[id] = {}
        aligned_nucleotide_sequences[id] = {}
        for gene in config.genes:
            aligned_aminoacid_sequences[id][gene] = None
        for segment in config.nucleotideSequences:
            aligned_nucleotide_sequences[id][segment] = None
            if segment in entry.data.unalignedNucleotideSequences:
                unaligned_nucleotide_sequences[id][segment] = (
                    entry.data.unalignedNucleotideSequences[segment]
                )
            else:
                unaligned_nucleotide_sequences[id][segment] = None

    nextclade_metadata: dict[AccessionVersion, dict[SegmentName, dict[str, Any]]] = {}
    nucleotide_insertions: dict[AccessionVersion, dict[SegmentName, list[NucleotideInsertion]]] = {}
    amino_acid_insertions: dict[AccessionVersion, dict[GeneName, list[AminoAcidInsertion]]] = {}
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as result_dir:  # noqa: PLR1702
        for segment in config.nucleotideSequences:
            result_dir_seg = result_dir if segment == "main" else result_dir + "/" + segment
            dataset_dir_seg = dataset_dir if segment == "main" else dataset_dir + "/" + segment
            input_file = result_dir_seg + "/input.fasta"
            os.makedirs(os.path.dirname(input_file), exist_ok=True)
            with open(input_file, "w", encoding="utf-8") as f:
                for id, seg_dict in unaligned_nucleotide_sequences.items():
                    if segment in seg_dict and seg_dict[segment] is not None:
                        f.write(f">{id}\n")
                        f.write(f"{seg_dict[segment]}\n")

            command = [
                "nextclade3",
                "run",
                f"--output-all={result_dir_seg}",
                f"--input-dataset={dataset_dir_seg}",
                f"--output-translations={
                    result_dir_seg}/nextclade.cds_translation.{{cds}}.fasta",
                "--jobs=1",
                "--",
                f"{input_file}",
            ]
            logging.debug(f"Running nextclade: {command}")

            # TODO: Capture stderr and log at DEBUG level
            exit_code = subprocess.run(command, check=False).returncode  # noqa: S603
            if exit_code != 0:
                msg = f"nextclade failed with exit code {exit_code}"
                raise Exception(msg)

            logging.debug("Nextclade results available in %s", result_dir)

            # Add aligned sequences to aligned_nucleotide_sequences
            load_aligned_nuc_sequences(result_dir_seg, segment, aligned_nucleotide_sequences)

            for gene in config.genes:
                translation_path = result_dir_seg + f"/nextclade.cds_translation.{gene}.fasta"
                try:
                    with open(translation_path, encoding="utf-8") as aligned_translations:
                        aligned_translation = SeqIO.parse(aligned_translations, "fasta")
                        for aligned_sequence in aligned_translation:
                            sequence_id = aligned_sequence.id
                            masked_sequence = mask_terminal_gaps(
                                str(aligned_sequence.seq), mask_char="X"
                            )
                            aligned_aminoacid_sequences[sequence_id][gene] = masked_sequence
                except FileNotFoundError:
                    # TODO: Add warning to each sequence
                    logging.info(
                        f"Gene {gene} not found in Nextclade results expected at: {
                            translation_path}"
                    )

            parse_nextclade_json(result_dir_seg, nextclade_metadata, segment)
            parse_nextclade_tsv(
                amino_acid_insertions, nucleotide_insertions, result_dir_seg, config, segment
            )

    return {
        id: UnprocessedAfterNextclade(
            inputMetadata=input_metadata[id],
            nextcladeMetadata=nextclade_metadata.get(id),
            unalignedNucleotideSequences=unaligned_nucleotide_sequences[id],
            alignedNucleotideSequences=aligned_nucleotide_sequences[id],
            nucleotideInsertions=nucleotide_insertions.get(id, {}),
            alignedAminoAcidSequences=aligned_aminoacid_sequences.get(id, {}),
            aminoAcidInsertions=amino_acid_insertions[id],
        )
        for id in unaligned_nucleotide_sequences
    }


def mask_terminal_gaps(
    sequence: GenericSequence, mask_char: Literal["N"] | Literal["X"] = "N"
) -> GenericSequence:
    # https://chatgpt.com/share/b213c687-38c4-4c62-98a8-4fecb210d479
    if not sequence:
        return ""

    if mask_char not in {"N", "X"}:
        error_message = "mask_char must be 'N' or 'X'"
        raise ValueError(error_message)

    # Entire sequence of gaps
    if not sequence.strip("-"):
        return mask_char * len(sequence)

    # Find the index of the first non-'-' character
    first_non_gap = 0
    while first_non_gap < len(sequence) and sequence[first_non_gap] == "-":
        first_non_gap += 1

    # Find the index of the last non-'-' character
    last_non_gap = len(sequence)
    while last_non_gap > 0 and sequence[last_non_gap - 1] == "-":
        last_non_gap -= 1

    # Replace terminal gaps with 'N'
    return (
        mask_char * first_non_gap
        + sequence[first_non_gap:last_non_gap]
        + mask_char * (len(sequence) - last_non_gap)
    )


def load_aligned_nuc_sequences(
    result_dir_seg: str,
    segment: str,
    aligned_nucleotide_sequences: dict[
        AccessionVersion, dict[SegmentName, NucleotideSequence | None]
    ],
) -> dict[AccessionVersion, NucleotideSequence]:
    """
    Load the nextclade alignment results into the aligned_nucleotide_sequences dict, mapping each
    accession to a segmentName: NucleotideSequence dictionary.
    """
    with open(result_dir_seg + "/nextclade.aligned.fasta", encoding="utf-8") as aligned_nucs:
        aligned_nuc = SeqIO.parse(aligned_nucs, "fasta")
        for aligned_sequence in aligned_nuc:
            sequence_id: str = aligned_sequence.id
            sequence: NucleotideSequence = str(aligned_sequence.seq)
            aligned_nucleotide_sequences[sequence_id][segment] = mask_terminal_gaps(sequence)


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


def get_metadata(
    spec: ProcessingSpec,
    output_field: str,
    unprocessed: UnprocessedAfterNextclade,
    errors: list[ProcessingAnnotation],
    warnings: list[ProcessingAnnotation],
) -> ProcessingResult:
    input_data: InputMetadata = {}
    for arg_name, input_path in spec.inputs.items():
        input_data[arg_name] = None
        # If field starts with "nextclade.", take from nextclade metadata
        nextclade_prefix = "nextclade."
        if input_path.startswith(nextclade_prefix):
            # Remove "nextclade." prefix
            segment = spec.args.get("segment", "main")
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
            if segment in unprocessed.nextcladeMetadata:
                input_data[arg_name] = str(
                    dpath.get(
                        unprocessed.nextcladeMetadata[segment],
                        sub_path,
                        separator=".",
                        default=None,
                    )
                )
            else:
                input_data[arg_name] = None
            continue
        if input_path not in unprocessed.inputMetadata:
            warnings.append(
                ProcessingAnnotation(
                    source=[AnnotationSource(name=input_path, type=AnnotationSourceType.METADATA)],
                    message=f"Metadata field '{input_path}' not found in input",
                )
            )
            continue
        input_data[arg_name] = unprocessed.inputMetadata[input_path]
    try:
        processing_result = ProcessingFunctions.call_function(
            spec.function, spec.args, input_data, output_field
        )
    except Exception as e:
        msg = f"Processing for spec: {spec} with input data: {input_data} failed with {e}"
        raise RuntimeError(msg) from e

    errors.extend(processing_result.errors)
    warnings.extend(processing_result.warnings)

    return processing_result


def process_single(
    id: AccessionVersion, unprocessed: UnprocessedAfterNextclade, config: Config
) -> ProcessedEntry:
    """Process a single sequence per config"""
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []
    len_dict: dict[str, str | int] = {}
    for segment in config.nucleotideSequences:
        sequence = unprocessed.unalignedNucleotideSequences[segment]
        key = "length" if segment == "main" else "length_" + segment
        if sequence:
            len_dict[key] = len(sequence)
        else:
            len_dict[key] = 0
    output_metadata: ProcessedMetadata = len_dict

    for output_field, spec_dict in config.processing_spec.items():
        length_fields = [
            "length" if segment == "main" else "length_" + segment
            for segment in config.nucleotideSequences
        ]
        if output_field in length_fields:
            continue
        spec = ProcessingSpec(
            inputs=spec_dict["inputs"],
            function=spec_dict["function"],
            required=spec_dict.get("required", False),
            args=spec_dict.get("args", {}),
        )
        processing_result = get_metadata(
            spec,
            output_field,
            unprocessed,
            errors,
            warnings,
        )
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
            unalignedNucleotideSequences=unprocessed.unalignedNucleotideSequences,
            alignedNucleotideSequences=unprocessed.alignedNucleotideSequences,
            nucleotideInsertions=unprocessed.nucleotideInsertions,
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


def download_nextclade_dataset(dataset_dir: str, config: Config) -> None:
    for segment in config.nucleotideSequences:
        nextclade_dataset_name = (
            config.nextclade_dataset_name
            if segment == "main"
            else config.nextclade_dataset_name + "/" + segment
        )
        dataset_dir_seg = dataset_dir if segment == "main" else dataset_dir + "/" + segment
        dataset_download_command = [
            "nextclade3",
            "dataset",
            "get",
            f"--name={nextclade_dataset_name}",
            f"--server={config.nextclade_dataset_server}",
            f"--output-dir={dataset_dir_seg}",
        ]

        if config.nextclade_dataset_tag is not None:
            dataset_download_command.append(f"--tag={config.nextclade_dataset_tag}")

        logging.info("Downloading Nextclade dataset: %s", dataset_download_command)
        if subprocess.run(dataset_download_command, check=False).returncode != 0:  # noqa: S603
            msg = "Dataset download failed"
            raise RuntimeError(msg)
        logging.info("Nextclade dataset downloaded successfully")


def run(config: Config) -> None:
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as dataset_dir:
        download_nextclade_dataset(dataset_dir, config)
        total_processed = 0
        while True:
            logging.debug("Fetching unprocessed sequences")
            unprocessed = parse_ndjson(fetch_unprocessed_sequences(config.batch_size, config))
            if len(unprocessed) == 0:
                # sleep 1 sec and try again
                logging.debug("No unprocessed sequences found. Sleeping for 1 second.")
                time.sleep(1)
                continue
            # Process the sequences, get result as dictionary
            processed = process_all(unprocessed, dataset_dir, config)
            # Submit the result
            try:
                submit_processed_sequences(processed, dataset_dir, config)
            except RuntimeError as e:
                logging.exception("Submitting processed data failed. Traceback : %s", e)
                continue
            total_processed += len(processed)
            logging.info("Processed %s sequences", len(processed))
