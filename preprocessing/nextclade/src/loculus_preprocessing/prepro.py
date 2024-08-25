import copy
import csv
import json
import logging
import os
import re
import subprocess  # noqa: S404
import sys
import time
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path
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
    InputMetadata,
    NucleotideInsertion,
    NucleotideSequence,
    ProcessedData,
    ProcessedEntry,
    ProcessedMetadata,
    ProcessingAnnotation,
    ProcessingResult,
    ProcessingSpec,
    SegmentName,
    UnprocessedAfterNextclade,
    UnprocessedData,
    UnprocessedEntry,
)
from .processing_functions import ProcessingFunctions, format_frameshift, format_stop_codon

# https://stackoverflow.com/questions/15063936
csv.field_size_limit(sys.maxsize)


GenericSequence = TypeVar("GenericSequence", AminoAcidSequence, NucleotideSequence)


# Functions related to reading and writing files


def parse_ndjson(ndjson_data: str) -> Sequence[UnprocessedEntry]:
    entries = []
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


def parse_nextclade_tsv(
    amino_acid_insertions: defaultdict[
        AccessionVersion, defaultdict[GeneName, list[AminoAcidInsertion]]
    ],
    nucleotide_insertions: defaultdict[
        AccessionVersion, defaultdict[SegmentName, list[NucleotideInsertion]]
    ],
    result_dir: str,
    config: Config,
    segment: str,
) -> tuple[
    defaultdict[AccessionVersion, defaultdict[GeneName, list[AminoAcidInsertion]]],
    defaultdict[AccessionVersion, defaultdict[SegmentName, list[NucleotideInsertion]]],
]:
    with Path(result_dir + "/nextclade.tsv").open(encoding="utf-8") as nextclade_tsv:
        reader = csv.DictReader(nextclade_tsv, delimiter="\t")
        for row in reader:
            id = row["seqName"]

            nuc_ins_str: list[NucleotideInsertion] = (
                list(row["insertions"].split(",")) if row["insertions"] else []
            )
            nucleotide_insertions[id][segment] = nuc_ins_str

            aa_ins_split = row["aaInsertions"].split(",")
            for ins in aa_ins_split:
                if not ins:
                    continue
                gene, val = ins.split(":", maxsplit=1)
                if gene in config.genes:
                    amino_acid_insertions[id][gene].append(val)
                else:
                    logging.debug(
                        "Note: Nextclade found AA insertion in gene missing from config in gene "
                        f"{gene}: {val}"
                    )
    return amino_acid_insertions, nucleotide_insertions


def parse_nextclade_json(
    result_dir,
    nextclade_metadata: defaultdict[AccessionVersion, defaultdict[SegmentName, dict[str, Any]]],
    segment,
) -> defaultdict[AccessionVersion, defaultdict[SegmentName, dict[str, Any]]]:
    """
    Update nextclade_metadata object with the results of the nextclade analysis
    """
    nextclade_json_path = Path(result_dir) / "nextclade.json"
    json_data = json.loads(nextclade_json_path.read_text(encoding="utf-8"))
    for result in json_data["results"]:
        id = result["seqName"]
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
    error_dict: dict[AccessionVersion, list[ProcessingAnnotation]] = {}
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
        input_metadata[id]["submitter"] = entry.data.submitter
        aligned_aminoacid_sequences[id] = {}
        unaligned_nucleotide_sequences[id] = {}
        aligned_nucleotide_sequences[id] = {}
        for gene in config.genes:
            aligned_aminoacid_sequences[id][gene] = None
        num_valid_segments = 0
        num_duplicate_segments = 0
        for segment in config.nucleotideSequences:
            aligned_nucleotide_sequences[id][segment] = None
            unaligned_segment = [
                data
                for data in entry.data.unalignedNucleotideSequences
                if re.match(segment + "$", data, re.IGNORECASE)
            ]
            if len(unaligned_segment) > 1:
                num_duplicate_segments += len(unaligned_segment)
                error_dict[id] = error_dict.get(id, [])
                error_dict[id].append(
                    ProcessingAnnotation(
                        source=[
                            AnnotationSource(
                                name=segment,
                                type=AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                            )
                        ],
                        message="Found multiple sequences with the same segment name.",
                    )
                )
            elif len(unaligned_segment) == 1:
                num_valid_segments += 1
                unaligned_nucleotide_sequences[id][segment] = (
                    entry.data.unalignedNucleotideSequences[unaligned_segment[0]]
                )
            else:
                unaligned_nucleotide_sequences[id][segment] = None
        if (
            len(entry.data.unalignedNucleotideSequences)
            - num_valid_segments
            - num_duplicate_segments
            > 0
        ):
            error_dict[id] = error_dict.get(id, [])
            error_dict[id].append(
                ProcessingAnnotation(
                    source=[
                        AnnotationSource(
                            name="main",
                            type=AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                        )
                    ],
                    message=(
                        "Found unknown segments in the input data - "
                        "check your segments are annotated correctly."
                    ),
                )
            )

    nextclade_metadata: defaultdict[AccessionVersion, defaultdict[SegmentName, dict[str, Any]]] = (
        defaultdict(lambda: defaultdict(dict))
    )
    nucleotide_insertions: defaultdict[
        AccessionVersion, defaultdict[SegmentName, list[NucleotideInsertion]]
    ] = defaultdict(lambda: defaultdict(list))
    amino_acid_insertions: defaultdict[
        AccessionVersion, defaultdict[GeneName, list[AminoAcidInsertion]]
    ] = defaultdict(lambda: defaultdict(list))
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as result_dir:  # noqa: PLR1702
        for segment in config.nucleotideSequences:
            result_dir_seg = result_dir if segment == "main" else result_dir + "/" + segment
            dataset_dir_seg = dataset_dir if segment == "main" else dataset_dir + "/" + segment
            input_file = result_dir_seg + "/input.fasta"
            os.makedirs(os.path.dirname(input_file), exist_ok=True)
            is_empty: bool = True
            with open(input_file, "w", encoding="utf-8") as f:
                for id, seg_dict in unaligned_nucleotide_sequences.items():
                    if segment in seg_dict and seg_dict[segment] is not None:
                        f.write(f">{id}\n")
                        f.write(f"{seg_dict[segment]}\n")
                        is_empty = False
            if is_empty:
                continue

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
            # Modifies aligned_nucleotide_sequences in place
            aligned_nucleotide_sequences = load_aligned_nuc_sequences(
                result_dir_seg, segment, aligned_nucleotide_sequences
            )

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

            nextclade_metadata = parse_nextclade_json(result_dir_seg, nextclade_metadata, segment)
            amino_acid_insertions, nucleotide_insertions = parse_nextclade_tsv(
                amino_acid_insertions, nucleotide_insertions, result_dir_seg, config, segment
            )

    return {
        id: UnprocessedAfterNextclade(
            inputMetadata=input_metadata[id],
            nextcladeMetadata=nextclade_metadata[id],
            unalignedNucleotideSequences=unaligned_nucleotide_sequences[id],
            alignedNucleotideSequences=aligned_nucleotide_sequences[id],
            nucleotideInsertions=nucleotide_insertions[id],
            alignedAminoAcidSequences=aligned_aminoacid_sequences[id],
            aminoAcidInsertions=amino_acid_insertions[id],
            errors=error_dict.get(id, []),
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
) -> dict[AccessionVersion, dict[SegmentName, NucleotideSequence | None]]:
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
    return aligned_nucleotide_sequences


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


def add_input_metadata(
    spec: ProcessingSpec,
    unprocessed: UnprocessedAfterNextclade,
    errors: list[ProcessingAnnotation],
    input_path: str,
) -> InputMetadata:
    """Returns value of input_path in unprocessed metadata"""
    # If field starts with "nextclade.", take from nextclade metadata
    nextclade_prefix = "nextclade."
    if input_path.startswith(nextclade_prefix):
        segment = spec.args.get("segment", "main")
        if not unprocessed.nextcladeMetadata:
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
            return None
        sub_path = input_path[len(nextclade_prefix) :]
        if segment in unprocessed.nextcladeMetadata:
            result = str(
                dpath.get(
                    unprocessed.nextcladeMetadata[segment],
                    sub_path,
                    separator=".",
                    default=None,
                )
            )
            if input_path == "nextclade.frameShifts":
                try:
                    result = format_frameshift(result)
                except Exception:
                    logging.error(
                        "Was unable to format frameshift - this is likely an internal error"
                    )
                    result = None
            if input_path == "nextclade.qc.stopCodons.stopCodons":
                try:
                    result = format_stop_codon(result)
                except Exception:
                    logging.error(
                        "Was unable to format stop codon - this is likely an internal error"
                    )
                    result = None
            return result
        return None
    if input_path not in unprocessed.inputMetadata:
        return None
    return unprocessed.inputMetadata[input_path]


def get_metadata(
    id: AccessionVersion,
    spec: ProcessingSpec,
    output_field: str,
    unprocessed: UnprocessedAfterNextclade | UnprocessedData,
    errors: list[ProcessingAnnotation],
    warnings: list[ProcessingAnnotation],
) -> ProcessingResult:
    input_data: InputMetadata = {}

    if isinstance(unprocessed, UnprocessedData):
        metadata = unprocessed.metadata
        for arg_name, input_path in spec.inputs.items():
            input_data[arg_name] = metadata.get(input_path)
        args = spec.args
        args["submitter"] = unprocessed.submitter
    else:
        for arg_name, input_path in spec.inputs.items():
            input_data[arg_name] = add_input_metadata(spec, unprocessed, errors, input_path)
        args = spec.args
        args["submitter"] = unprocessed.inputMetadata["submitter"]

    if spec.function == "concatenate":
        spec_copy = copy.deepcopy(spec)
        spec_copy.args["accession_version"] = id
        args = spec_copy.args

    try:
        processing_result = ProcessingFunctions.call_function(
            spec.function,
            args,
            input_data,
            output_field,
        )
    except Exception as e:
        msg = f"Processing for spec: {spec} with input data: {input_data} failed with {e}"
        raise RuntimeError(msg) from e

    errors.extend(processing_result.errors)
    warnings.extend(processing_result.warnings)

    return processing_result


def processed_entry_no_alignment(
    id: AccessionVersion,
    unprocessed: UnprocessedData,
    config: Config,
    output_metadata: ProcessedMetadata,
    errors=list[ProcessingAnnotation],
    warnings=list[ProcessingAnnotation],
) -> ProcessedEntry:
    """Process a single sequence without alignment"""

    aligned_nucleotide_sequences: dict[
        AccessionVersion, dict[SegmentName, NucleotideSequence | None]
    ] = {}
    aligned_aminoacid_sequences: dict[
        AccessionVersion, dict[GeneName, AminoAcidSequence | None]
    ] = {}
    nucleotide_insertions: defaultdict[
        AccessionVersion, defaultdict[SegmentName, list[NucleotideInsertion]]
    ] = defaultdict(lambda: defaultdict(list))
    amino_acid_insertions: defaultdict[
        AccessionVersion, defaultdict[GeneName, list[AminoAcidInsertion]]
    ] = defaultdict(lambda: defaultdict(list))

    for segment in config.nucleotideSequences:
        aligned_nucleotide_sequences[segment] = None
        nucleotide_insertions[segment] = []

    for gene in config.genes:
        amino_acid_insertions[gene] = []
        aligned_aminoacid_sequences[gene] = None

    return ProcessedEntry(
        accession=accession_from_str(id),
        version=version_from_str(id),
        data=ProcessedData(
            metadata=output_metadata,
            unalignedNucleotideSequences=unprocessed.unalignedNucleotideSequences,
            alignedNucleotideSequences=aligned_nucleotide_sequences,
            nucleotideInsertions=nucleotide_insertions,
            alignedAminoAcidSequences=aligned_aminoacid_sequences,
            aminoAcidInsertions=amino_acid_insertions,
        ),
        errors=list(set(errors)),
        warnings=list(set(warnings)),
    )


def process_single(
    id: AccessionVersion, unprocessed: UnprocessedAfterNextclade | UnprocessedData, config: Config
) -> ProcessedEntry:
    """Process a single sequence per config"""
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []
    output_metadata: ProcessedMetadata = {}

    if isinstance(unprocessed, UnprocessedAfterNextclade):
        # Break if there are sequence related errors
        if unprocessed.errors:
            errors += unprocessed.errors
        elif not any(unprocessed.unalignedNucleotideSequences.values()):
            errors.append(
                ProcessingAnnotation(
                    source=[
                        AnnotationSource(
                            name="main",
                            type=AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                        )
                    ],
                    message="No sequence data found - check segments are annotated correctly",
                )
            )
        
        if errors:
            # Break early
            return ProcessedEntry(
                accession=accession_from_str(id),
                version=version_from_str(id),
                data=ProcessedData(
                    metadata=output_metadata,
                    unalignedNucleotideSequences={},
                    alignedNucleotideSequences={},
                    nucleotideInsertions={},
                    alignedAminoAcidSequences={},
                    aminoAcidInsertions={},
                ),
                errors=list(set(errors)),
                warnings=list(set(warnings)),
            )
        submitter = unprocessed.inputMetadata["submitter"]
        unaligned_nucleotide_sequences = unprocessed.unalignedNucleotideSequences
    else:
        submitter = unprocessed.submitter
        unaligned_nucleotide_sequences = unprocessed.unalignedNucleotideSequences

    for segment in config.nucleotideSequences:
        sequence = unaligned_nucleotide_sequences[segment]
        key = "length" if segment == "main" else "length_" + segment
        if key in config.processing_spec:
            output_metadata[key] = len(sequence) if sequence else 0

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
        spec.args = {} if spec.args is None else spec.args
        processing_result = get_metadata(
            id,
            spec,
            output_field,
            unprocessed,
            errors,
            warnings,
        )
        output_metadata[output_field] = processing_result.datum
        if (
            null_per_backend(processing_result.datum)
            and spec.required
            and submitter != "insdc_ingest_user"
        ):
            errors.append(
                ProcessingAnnotation(
                    source=[
                        AnnotationSource(
                            name="main",
                            type=AnnotationSourceType.METADATA,
                        )
                    ],
                    message=(
                        f"Metadata field {output_field} is required."
                    ),
                )
            )
    logging.debug(f"Processed {id}: {output_metadata}")

    if isinstance(unprocessed, UnprocessedData):
        return processed_entry_no_alignment(
            id, unprocessed, config, output_metadata, errors, warnings
        )

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
        errors=list(set(errors)),
        warnings=list(set(warnings)),
    )


def process_all(
    unprocessed: Sequence[UnprocessedEntry], dataset_dir: str, config: Config
) -> Sequence[ProcessedEntry]:
    processed_results = []
    if config.nextclade_dataset_name:
        nextclade_results = enrich_with_nextclade(unprocessed, dataset_dir, config)
        for id, result in nextclade_results.items():
            processed_single = process_single(id, result, config)
            processed_results.append(processed_single)
    else:
        for entry in unprocessed:
            processed_single = process_single(entry.accessionVersion, entry.data, config)
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
        if config.nextclade_dataset_name:
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
