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
from typing import Any, Final, Literal

import dpath
import pandas as pd
from Bio import SeqIO

from .backend import (
    download_minimizer,
    fetch_unprocessed_sequences,
    request_upload,
    submit_processed_sequences,
    upload_embl_file_to_presigned_url,
)
from .config import AlignmentRequirement, Config
from .datatypes import (
    AccessionVersion,
    Alerts,
    AminoAcidInsertion,
    AminoAcidSequence,
    AnnotationSource,
    AnnotationSourceType,
    FileIdAndName,
    GeneName,
    GenericSequence,
    InputMetadata,
    NucleotideInsertion,
    NucleotideSequence,
    ProcessedData,
    ProcessedEntry,
    ProcessedMetadata,
    ProcessedMetadataValue,
    ProcessingAnnotation,
    ProcessingResult,
    ProcessingSpec,
    SegmentName,
    SubmissionData,
    UnprocessedAfterNextclade,
    UnprocessedData,
    UnprocessedEntry,
)
from .embl import create_flatfile
from .processing_functions import ProcessingFunctions, format_frameshift, format_stop_codon
from .sequence_checks import errors_if_non_iupac

logger = logging.getLogger(__name__)

# https://stackoverflow.com/questions/15063936
csv.field_size_limit(sys.maxsize)


# Functions related to reading and writing files

ProcessingAnnotationAlignment: Final = "alignment"


def parse_nextclade_tsv(
    amino_acid_insertions: defaultdict[
        AccessionVersion, defaultdict[GeneName, list[AminoAcidInsertion]]
    ],
    nucleotide_insertions: defaultdict[
        AccessionVersion, defaultdict[SegmentName, list[NucleotideInsertion]]
    ],
    result_dir: str,
    config: Config,
    segment: SegmentName,
) -> tuple[
    defaultdict[AccessionVersion, defaultdict[GeneName, list[AminoAcidInsertion]]],
    defaultdict[AccessionVersion, defaultdict[SegmentName, list[NucleotideInsertion]]],
]:
    with Path(result_dir + "/nextclade.tsv").open(encoding="utf-8") as nextclade_tsv:
        reader = csv.DictReader(nextclade_tsv, delimiter="\t")
        for row in reader:
            id = row["seqName"]

            if row["insertions"]:
                nucleotide_insertions[id][segment] = list(row["insertions"].split(","))

            aa_ins_split = row["aaInsertions"].split(",")
            for ins in aa_ins_split:
                if not ins:
                    continue
                gene, val = ins.split(":", maxsplit=1)
                if gene in config.genes:
                    amino_acid_insertions[id][gene].append(val)
                else:
                    logger.debug(
                        "Note: Nextclade found AA insertion in gene missing from config in gene "
                        f"{gene}: {val}"
                    )
    return amino_acid_insertions, nucleotide_insertions


def parse_nextclade_json(
    result_dir,
    nextclade_metadata: defaultdict[
        AccessionVersion, defaultdict[SegmentName, dict[str, Any] | None]
    ],
    segment: SegmentName,
    unaligned_nucleotide_sequences: dict[
        AccessionVersion, dict[SegmentName, NucleotideSequence | None]
    ],
) -> defaultdict[AccessionVersion, defaultdict[SegmentName, dict[str, Any] | None]]:
    """
    Update nextclade_metadata object with the results of the nextclade analysis.
    If the segment existed in the input (unaligned_nucleotide_sequences) but did not align
    nextclade_metadata[segment]=None.
    """
    for id, segment_sequences in unaligned_nucleotide_sequences.items():
        if segment in segment_sequences and segment_sequences[segment] is not None:
            nextclade_metadata[id][segment] = None
    nextclade_json_path = Path(result_dir) / "nextclade.json"
    json_data = json.loads(nextclade_json_path.read_text(encoding="utf-8"))
    for result in json_data["results"]:
        id = result["seqName"]
        nextclade_metadata[id][segment] = result
    return nextclade_metadata


def run_sort(
    result_file_dir: str,
    input_file: str,
    alerts: Alerts,
    config: Config,
    segment: SegmentName,
    dataset_dir: str,
) -> Alerts:
    """
    Run nextclade
    - use config.minimizer_url or default minimizer from nextclade server
    - assert highest score is in config.accepted_dataset_matches
    (default is nextclade_dataset_name)
    """
    nextclade_dataset_name = get_nextclade_dataset_name(config, segment)
    if not config.accepted_dataset_matches and not nextclade_dataset_name:
        logger.warning("No nextclade dataset name or accepted dataset match list found in config")
        return alerts
    nextclade_dataset_server = get_nextclade_dataset_server(config, segment)

    if config.minimizer_url:
        minimizer_file = dataset_dir + "/minimizer/minimizer.json"

    accepted_dataset_names = config.accepted_dataset_matches or [nextclade_dataset_name]  # type: ignore

    result_file = result_file_dir + "/sort_output.tsv"
    command = [
        "nextclade3",
        "sort",
        input_file,
        "-m" if config.minimizer_url else "",
        f"{minimizer_file}" if config.minimizer_url else "",
        "--output-results-tsv",
        f"{result_file}",
        "--max-score-gap",
        "0.3",
        "--min-score",
        "0.05",
        "--min-hits",
        "2",
        "--all-matches",
        "--server",
        f"{nextclade_dataset_server}",
    ]

    logger.debug(f"Running nextclade sort: {command}")

    exit_code = subprocess.run(command, check=False).returncode  # noqa: S603
    if exit_code != 0:
        msg = f"nextclade sort failed with exit code {exit_code}"
        raise Exception(msg)

    df = pd.read_csv(
        result_file,
        sep="\t",
        dtype={
            "index": "Int64",
            "score": "float64",
            "seqName": "string",
            "dataset": "string",
        },
    )

    hits = df.dropna(subset=["score"]).sort_values("score", ascending=False)
    best_hits = hits.groupby("seqName", as_index=False).first()

    all_ids = df["seqName"].unique()
    hit_ids = best_hits["seqName"]
    missing_ids = set(all_ids) - set(hit_ids)

    for seq in missing_ids:
        alerts.warnings[seq].append(
            ProcessingAnnotation.from_single(
                ProcessingAnnotationAlignment,
                AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                message=(
                    "Sequence does not appear to match reference, per `nextclade sort`. "
                    "Double check you are submitting to the correct organism."
                ),
            ),
        )

    for _, row in best_hits.iterrows():
        # If best match is not the same as the dataset we are submitting to, add an error
        if row["dataset"] not in accepted_dataset_names:
            alerts.errors[row["seqName"]].append(
                ProcessingAnnotation.from_single(
                    ProcessingAnnotationAlignment,
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                    message=(
                        f"This sequence best matches {row['dataset']}, "
                        "a different organism than the one you are submitting to: "
                        f"{config.organism}. It is therefore not possible to release. "
                        "Contact the administrator if you think this message is an error."
                    ),
                )
            )

    return alerts


def assign_segment(
    input_unaligned_sequences: dict[str, NucleotideSequence | None],
    unaligned_nucleotide_sequences: dict[SegmentName, NucleotideSequence | None],
    errors: list[ProcessingAnnotation],
    config: Config,
):
    valid_segments = set()
    duplicate_segments = set()
    if not config.nucleotideSequences:
        return (
            unaligned_nucleotide_sequences,
            errors,
        )
    if not config.multi_segment:
        if len(input_unaligned_sequences) > 1:
            errors.append(
                ProcessingAnnotation.from_single(
                    ProcessingAnnotationAlignment,
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                    message=(
                        f"Multiple sequences: {list(input_unaligned_sequences.keys())} found in the"
                        f" input data, but organism: {config.organism} is single-segmented. "
                        "Please check that your metadata and sequences are annotated correctly."
                        "Each metadata entry should have a single corresponding fasta sequence "
                        "entry with the same submissionId."
                    ),
                )
            )
        else:
            _, value = next(iter(input_unaligned_sequences.items()))
            unaligned_nucleotide_sequences["main"] = value
        return (
            unaligned_nucleotide_sequences,
            errors,
        )
    for segment in config.nucleotideSequences:
        unaligned_segment = [
            data
            for data in input_unaligned_sequences
            if re.match(segment + "$", data.split("_")[-1], re.IGNORECASE)
            or re.match(
                segment + "$", data, re.IGNORECASE
            )  # backward compatibility allow only segment name in submission dict
        ]
        if len(unaligned_segment) > 1:
            duplicate_segments.update(unaligned_segment)
            errors.append(
                ProcessingAnnotation.from_single(
                    ProcessingAnnotationAlignment,
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                    message=(
                        f"Found multiple sequences with the same segment name: {segment}. "
                        "Each metadata entry can have multiple corresponding fasta sequence "
                        "entries with format <submissionId>_<segmentName>."
                    ),
                )
            )
        elif len(unaligned_segment) == 1:
            valid_segments.add(unaligned_segment[0])
            unaligned_nucleotide_sequences[segment] = input_unaligned_sequences[
                unaligned_segment[0]
            ]
    remaining_segments = set(input_unaligned_sequences.keys()) - valid_segments - duplicate_segments
    if len(remaining_segments) > 0:
        errors.append(
            ProcessingAnnotation.from_single(
                ProcessingAnnotationAlignment,
                AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                message=(
                    f"Found sequences in the input data with segments that are not in the config: "
                    f"{', '.join(remaining_segments)}. "
                    "Each metadata entry can have multiple corresponding fasta sequence "
                    "entries with format <submissionId>_<segmentName> valid segments are: "
                    f"{', '.join(config.nucleotideSequences)}."
                ),
            )
        )
    return (unaligned_nucleotide_sequences, errors)


def enrich_with_nextclade(  # noqa: C901, PLR0914, PLR0915
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
    alerts: Alerts = Alerts()
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
        input_metadata[id]["group_id"] = entry.data.group_id
        input_metadata[id]["submittedAt"] = entry.data.submittedAt
        aligned_aminoacid_sequences[id] = {}
        unaligned_nucleotide_sequences[id] = {}
        aligned_nucleotide_sequences[id] = {}
        alerts.warnings[id] = []
        alerts.errors[id] = []
        (
            unaligned_nucleotide_sequences[id],
            alerts.errors[id],
        ) = assign_segment(
            input_unaligned_sequences=entry.data.unalignedNucleotideSequences,
            unaligned_nucleotide_sequences=unaligned_nucleotide_sequences[id],
            errors=alerts.errors[id],
            config=config,
        )

    nextclade_metadata: defaultdict[
        AccessionVersion, defaultdict[SegmentName, dict[str, Any] | None]
    ] = defaultdict(lambda: defaultdict(dict))
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

            if config.require_nextclade_sort_match:
                alerts = run_sort(result_dir_seg, input_file, alerts, config, segment, dataset_dir)

            command = [
                "nextclade3",
                "run",
                f"--output-all={result_dir_seg}",
                f"--input-dataset={dataset_dir_seg}",
                f"--output-translations={result_dir_seg}/nextclade.cds_translation.{{cds}}.fasta",
                "--jobs=1",
                "--",
                input_file,
            ]
            logger.debug(f"Running nextclade: {command}")

            # TODO: Capture stderr and log at DEBUG level
            exit_code = subprocess.run(command, check=False).returncode  # noqa: S603
            if exit_code != 0:
                msg = f"nextclade failed with exit code {exit_code}"
                raise Exception(msg)

            logger.debug("Nextclade results available in %s", result_dir)

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
                    logger.info(
                        f"Gene {gene} not found in Nextclade results expected at: {
                            translation_path
                        }"
                    )

            nextclade_metadata = parse_nextclade_json(
                result_dir_seg, nextclade_metadata, segment, unaligned_nucleotide_sequences
            )  # this includes the "annotation" field
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
            errors=alerts.errors[id],
            warnings=alerts.warnings[id],
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
    segment: SegmentName,
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
    warnings: list[ProcessingAnnotation],
    input_path: str,
    config: Config,
) -> str | None:
    """Returns value of input_path in unprocessed metadata"""
    # If field starts with "nextclade.", take from nextclade metadata
    nextclade_prefix = "nextclade."
    if input_path.startswith(nextclade_prefix):
        segment = str(spec.args["segment"]) if spec.args and "segment" in spec.args else "main"
        if not unprocessed.nextcladeMetadata and unprocessed.unalignedNucleotideSequences:
            # This field should never be empty
            message = (
                "An unknown internal error occurred while aligning sequences, "
                "please contact the administrator."
            )
            errors.append(
                ProcessingAnnotation.from_single(
                    segment, AnnotationSourceType.NUCLEOTIDE_SEQUENCE, message=message
                )
            )
            return None
        sub_path = input_path[len(nextclade_prefix) :]
        if unprocessed.nextcladeMetadata and segment in unprocessed.nextcladeMetadata:
            if not unprocessed.nextcladeMetadata[segment]:
                message = (
                    "Nucleotide sequence failed to align"
                    if segment == "main"
                    else f"Nucleotide sequence for {segment} failed to align"
                )
                annotation = ProcessingAnnotation.from_single(
                    segment, AnnotationSourceType.NUCLEOTIDE_SEQUENCE, message=message
                )
                if (
                    config.multi_segment
                    and config.alignment_requirement == AlignmentRequirement.ANY
                ):
                    warnings.append(annotation)
                    return None
                errors.append(annotation)
                return None
            result: str | None = str(
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
                    logger.error(
                        "Was unable to format frameshift - this is likely an internal error"
                    )
                    result = None
            if input_path == "nextclade.qc.stopCodons.stopCodons":
                try:
                    result = format_stop_codon(result)
                except Exception:
                    logger.error(
                        "Was unable to format stop codon - this is likely an internal error"
                    )
                    result = None
            return result
        return None
    if input_path not in unprocessed.inputMetadata:
        return None
    return unprocessed.inputMetadata[input_path]


def get_metadata(  # noqa: PLR0913, PLR0917
    id: AccessionVersion,
    spec: ProcessingSpec,
    output_field: str,
    unprocessed: UnprocessedAfterNextclade | UnprocessedData,
    errors: list[ProcessingAnnotation],
    warnings: list[ProcessingAnnotation],
    config: Config,
) -> ProcessingResult:
    input_data: InputMetadata = {}
    input_fields: list[str] = []

    if isinstance(unprocessed, UnprocessedData):
        metadata = unprocessed.metadata
        for arg_name, input_path in spec.inputs.items():
            input_data[arg_name] = metadata.get(input_path)
            input_fields.append(input_path)
        args = spec.args
        args["submitter"] = unprocessed.submitter
        args["submittedAt"] = unprocessed.submittedAt
    else:
        for arg_name, input_path in spec.inputs.items():
            input_data[arg_name] = add_input_metadata(
                spec, unprocessed, errors, warnings, input_path, config
            )
            input_fields.append(input_path)
        args = spec.args
        args["submitter"] = unprocessed.inputMetadata["submitter"]
        args["submittedAt"] = unprocessed.inputMetadata["submittedAt"]

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
            input_fields,
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
    output_metadata: ProcessedMetadata,
    errors: list[ProcessingAnnotation],
    warnings: list[ProcessingAnnotation],
) -> SubmissionData:
    """Process a single sequence without alignment"""

    aligned_nucleotide_sequences: dict[SegmentName, NucleotideSequence | None] = {}
    aligned_aminoacid_sequences: dict[GeneName, AminoAcidSequence | None] = {}
    nucleotide_insertions: dict[SegmentName, list[NucleotideInsertion]] = {}
    amino_acid_insertions: dict[GeneName, list[AminoAcidInsertion]] = {}

    return SubmissionData(
        processed_entry=ProcessedEntry(
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
            errors=errors,
            warnings=warnings,
        ),
        submitter=unprocessed.submitter,
    )


def process_single(  # noqa: C901, PLR0912
    id: AccessionVersion, unprocessed: UnprocessedAfterNextclade | UnprocessedData, config: Config
) -> SubmissionData:
    """Process a single sequence per config"""
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []
    output_metadata: ProcessedMetadata = {}

    errors.extend(errors_if_non_iupac(unprocessed.unalignedNucleotideSequences))

    if isinstance(unprocessed, UnprocessedAfterNextclade):
        if unprocessed.warnings:
            warnings += unprocessed.warnings
        if unprocessed.errors:
            errors += unprocessed.errors
        elif not any(unprocessed.unalignedNucleotideSequences.values()):
            errors.append(
                ProcessingAnnotation.from_single(
                    ProcessingAnnotationAlignment,
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                    message="No sequence data found - check segments are annotated correctly",
                )
            )

        submitter = unprocessed.inputMetadata["submitter"]
        group_id = int(str(unprocessed.inputMetadata["group_id"]))
        unprocessed.unalignedNucleotideSequences, errors = assign_segment(
            input_unaligned_sequences=unprocessed.unalignedNucleotideSequences,
            unaligned_nucleotide_sequences={},
            errors=errors,
            config=config,
        )

    for segment in config.nucleotideSequences:
        sequence = unprocessed.unalignedNucleotideSequences.get(segment, None)
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
            config,
        )
        output_metadata[output_field] = processing_result.datum
        if (
            null_per_backend(processing_result.datum)
            and spec.required
            and submitter != "insdc_ingest_user"
        ):
            errors.append(
                ProcessingAnnotation.from_fields(
                    spec.inputs.values(),
                    [output_field],
                    AnnotationSourceType.METADATA,
                    message=f"Metadata field {output_field} is required.",
                )
            )
    logger.debug(f"Processed {id}: {output_metadata}")

    if isinstance(unprocessed, UnprocessedData):
        return processed_entry_no_alignment(id, unprocessed, output_metadata, errors, warnings)

    aligned_segments = set()
    for segment in config.nucleotideSequences:
        if unprocessed.alignedNucleotideSequences.get(segment, None):
            aligned_segments.add(segment)

    if not aligned_segments and config.multi_segment:
        errors.append(
            ProcessingAnnotation.from_single(
                ProcessingAnnotationAlignment,
                AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                message="No segment aligned.",
            )
        )

    annotations: dict[str, Any] | None = None

    if config.create_embl_file and unprocessed.nextcladeMetadata is not None:
        annotations = {}
        for segment in config.nucleotideSequences:
            if segment in unprocessed.nextcladeMetadata:
                annotations[segment] = None
                if unprocessed.nextcladeMetadata[segment]:
                    annotations[segment] = unprocessed.nextcladeMetadata[segment].get(
                        "annotation", None
                    )

    processed_entry = ProcessedEntry(
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

    return SubmissionData(
        processed_entry=processed_entry,
        annotations=annotations,
        group_id=group_id,
        submitter=str(submitter),
    )


def processed_entry_with_errors(id) -> SubmissionData:
    return SubmissionData(
        processed_entry=ProcessedEntry(
            accession=accession_from_str(id),
            version=version_from_str(id),
            data=ProcessedData(
                metadata=dict[str, ProcessedMetadataValue](),
                unalignedNucleotideSequences=defaultdict(dict[str, Any]),
                alignedNucleotideSequences=defaultdict(dict[str, Any]),
                nucleotideInsertions=defaultdict(dict[str, Any]),
                alignedAminoAcidSequences=defaultdict(dict[str, Any]),
                aminoAcidInsertions=defaultdict(dict[str, Any]),
            ),
            errors=[
                ProcessingAnnotation.from_single(
                    "unknown",
                    AnnotationSourceType.METADATA,
                    message=(
                        f"Failed to process submission with id: {id} - please review your "
                        "submission or reach out to an administrator if this error persists."
                    ),
                ),
            ],
            warnings=[],
        ),
        submitter=None,
    )


def process_all(
    unprocessed: Sequence[UnprocessedEntry], dataset_dir: str, config: Config
) -> Sequence[SubmissionData]:
    processed_results = []
    logger.debug(f"Processing {len(unprocessed)} unprocessed sequences")
    if config.nextclade_dataset_name:
        nextclade_results = enrich_with_nextclade(unprocessed, dataset_dir, config)
        for id, result in nextclade_results.items():
            try:
                processed_single = process_single(id, result, config)
            except Exception as e:
                logger.error(f"Processing failed for {id} with error: {e}")
                processed_single = processed_entry_with_errors(id)
            processed_results.append(processed_single)
    else:
        for entry in unprocessed:
            try:
                processed_single = process_single(entry.accessionVersion, entry.data, config)
            except Exception as e:
                logger.error(f"Processing failed for {entry.accessionVersion} with error: {e}")
                processed_single = processed_entry_with_errors(entry.accessionVersion)
            processed_results.append(processed_single)

    return processed_results


def get_nextclade_dataset_name(config: Config, segment: SegmentName) -> str | None:
    if config.nextclade_dataset_name_map and segment in config.nextclade_dataset_name_map:
        return config.nextclade_dataset_name_map[segment]
    if not config.nextclade_dataset_name:
        return None
    return (
        config.nextclade_dataset_name
        if segment == "main"
        else config.nextclade_dataset_name + "/" + segment
    )


def get_nextclade_dataset_server(config: Config, segment: SegmentName) -> str:
    if config.nextclade_dataset_server_map and segment in config.nextclade_dataset_server_map:
        return config.nextclade_dataset_server_map[segment]
    return config.nextclade_dataset_server


def get_nextclade_dataset_tag(config: Config, segment: SegmentName) -> str | None:
    if config.nextclade_dataset_tag_map and segment in config.nextclade_dataset_tag_map:
        return config.nextclade_dataset_tag_map[segment]
    return config.nextclade_dataset_tag


def download_nextclade_dataset(dataset_dir: str, config: Config) -> None:
    for segment in config.nucleotideSequences:
        nextclade_dataset_name = get_nextclade_dataset_name(config, segment)
        nextclade_dataset_server = get_nextclade_dataset_server(config, segment)
        nextclade_dataset_tag = get_nextclade_dataset_tag(config, segment)

        dataset_dir_seg = dataset_dir if segment == "main" else dataset_dir + "/" + segment
        dataset_download_command = [
            "nextclade3",
            "dataset",
            "get",
            f"--name={nextclade_dataset_name}",
            f"--server={nextclade_dataset_server}",
            f"--output-dir={dataset_dir_seg}",
        ]

        if nextclade_dataset_tag is not None:
            dataset_download_command.append(f"--tag={nextclade_dataset_tag}")

        logger.info("Downloading Nextclade dataset: %s", dataset_download_command)
        if subprocess.run(dataset_download_command, check=False).returncode != 0:  # noqa: S603
            msg = "Dataset download failed"
            raise RuntimeError(msg)
        logger.info("Nextclade dataset downloaded successfully")


def upload_flatfiles(processed: Sequence[SubmissionData], config: Config) -> None:
    for submission_data in processed:
        accession = submission_data.processed_entry.accession
        version = submission_data.processed_entry.version
        try:
            if submission_data.group_id is None:
                msg = "Group ID is required for EMBL file upload"
                raise ValueError(msg)
            file_content = create_flatfile(config, submission_data)
            file_name = f"{accession}.{version}.embl"
            upload_info = request_upload(submission_data.group_id, 1, config)[0]
            file_id = upload_info.fileId
            url = upload_info.url
            upload_embl_file_to_presigned_url(file_content, url)
            submission_data.processed_entry.data.files = {
                "annotations": [FileIdAndName(fileId=file_id, name=file_name)]
            }
        except Exception as e:
            logger.error("Error creating or uploading EMBL file: %s", e)
            submission_data.processed_entry.errors.append(
                ProcessingAnnotation(
                    unprocessedFields=[
                        AnnotationSource(name="embl_upload", type=AnnotationSourceType.METADATA)
                    ],
                    processedFields=[
                        AnnotationSource(name="embl_upload", type=AnnotationSourceType.METADATA)
                    ],
                    message="Failed to create or upload EMBL file "
                    "please contact your administrator.",
                )
            )


def run(config: Config) -> None:
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as dataset_dir:
        if config.nextclade_dataset_name:
            download_nextclade_dataset(dataset_dir, config)
        if config.minimizer_url and config.require_nextclade_sort_match:
            download_minimizer(config.minimizer_url, dataset_dir + "/minimizer/minimizer.json")
        total_processed = 0
        etag = None
        last_force_refresh = time.time()
        while True:
            logger.debug("Fetching unprocessed sequences")
            # Reset etag every hour just in case
            if last_force_refresh + 3600 < time.time():
                etag = None
                last_force_refresh = time.time()
            etag, unprocessed = fetch_unprocessed_sequences(etag, config)
            if not unprocessed:
                # sleep 1 sec and try again
                logger.debug("No unprocessed sequences found. Sleeping for 1 second.")
                time.sleep(1)
                continue
            # Don't use etag if we just got data
            # preprocessing only asks for 100 sequences to process at a time, so there might be more
            etag = None
            try:
                processed = process_all(unprocessed, dataset_dir, config)
            except Exception as e:
                logger.exception(
                    f"Processing failed. Traceback : {e}. Unprocessed data: {unprocessed}"
                )
                continue

            if config.create_embl_file:
                upload_flatfiles(processed, config)

            try:
                processed_entries = [
                    submission_data.processed_entry for submission_data in processed
                ]
                submit_processed_sequences(processed_entries, dataset_dir, config)
            except RuntimeError as e:
                logger.exception("Submitting processed data failed. Traceback : %s", e)
                continue
            total_processed += len(processed)
            logger.info("Processed %s sequences", len(processed))
