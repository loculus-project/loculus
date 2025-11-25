import csv
import json
import logging
import os
import re
import subprocess  # noqa: S404
import sys
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Literal

import pandas as pd
from Bio import SeqIO

from .config import AlignmentRequirement, Config, NextcladeSequenceAndDataset
from .datatypes import (
    AccessionVersion,
    Alerts,
    AminoAcidInsertion,
    AminoAcidSequence,
    AnnotationSourceType,
    FastaId,
    GeneName,
    GenericSequence,
    NucleotideInsertion,
    NucleotideSequence,
    ProcessingAnnotation,
    ProcessingAnnotationAlignment,
    SegmentAssignment,
    SegmentAssignmentBatch,
    SegmentClassificationMethod,
    SegmentName,
    UnprocessedAfterNextclade,
    UnprocessedEntry,
)

# https://stackoverflow.com/questions/15063936
csv.field_size_limit(sys.maxsize)

logger = logging.getLogger(__name__)


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


def parse_nextclade_tsv(
    amino_acid_insertions: defaultdict[
        AccessionVersion, defaultdict[GeneName, list[AminoAcidInsertion]]
    ],
    nucleotide_insertions: defaultdict[
        AccessionVersion, defaultdict[SegmentName, list[NucleotideInsertion]]
    ],
    result_dir: str,
    config: Config,
    sequence_and_dataset: NextcladeSequenceAndDataset,
) -> tuple[
    defaultdict[AccessionVersion, defaultdict[GeneName, list[AminoAcidInsertion]]],
    defaultdict[AccessionVersion, defaultdict[SegmentName, list[NucleotideInsertion]]],
]:
    segment = sequence_and_dataset.name
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
                    gene_name = (
                        sequence_and_dataset.gene_prefix + gene
                        if sequence_and_dataset.gene_prefix
                        else gene
                    )
                    amino_acid_insertions[id][gene_name].append(val)
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
    result_file: str,
    input_file: str,
    config: Config,
    nextclade_dataset_server: str,
    dataset_dir: str,
) -> pd.DataFrame:
    """
    Run nextclade
    - use config.minimizer_index or default minimizer from nextclade server
    """
    if config.minimizer_index:
        minimizer_file = dataset_dir + "/minimizer/minimizer.json"

    test = nextclade_dataset_server == "TEST"

    subprocess_args_with_emtpy_strings = [
        "nextclade3",
        "sort",
        input_file,
        "-m" if config.minimizer_index else "",
        f"{minimizer_file}" if config.minimizer_index else "",
        "--output-results-tsv",
        f"{result_file}",
        "--max-score-gap",
        "0.3",
        "--min-score",
        "0.05",
        "--min-hits",
        "2",
        "--all-matches",
        "--server" if not test else "",
        f"{nextclade_dataset_server}" if not test else "",
    ]
    subprocess_args = [arg for arg in subprocess_args_with_emtpy_strings if arg]

    logger.debug(f"Running nextclade sort: {subprocess_args}")

    exit_code = subprocess.run(subprocess_args, check=False).returncode  # noqa: S603
    if exit_code != 0:
        msg = f"nextclade sort failed with exit code {exit_code}"
        raise Exception(msg)
    return pd.read_csv(
        result_file,
        sep="\t",
        dtype={
            "index": "Int64",
            "score": "float64",
            "seqName": "string",
            "dataset": "string",
        },
    )


def check_nextclade_sort_matches(  # noqa: PLR0913, PLR0917
    result_file_dir: str,
    input_file: str,
    alerts: Alerts,
    config: Config,
    sequence_and_dataset: NextcladeSequenceAndDataset,
    dataset_dir: str,
) -> Alerts:
    """
    Run nextclade sort
    - assert highest score is in sequence_and_dataset.accepted_sort_matches
    (default is nextclade_dataset_name)
    """
    nextclade_dataset_name = sequence_and_dataset.nextclade_dataset_name
    if not sequence_and_dataset.accepted_sort_matches and not nextclade_dataset_name:
        logger.warning("No nextclade dataset name or accepted dataset match list found in config")
        return alerts
    nextclade_dataset_server = (
        sequence_and_dataset.nextclade_dataset_server or config.nextclade_dataset_server
    )

    accepted_dataset_names = (
        sequence_and_dataset.accepted_sort_matches
        or [nextclade_dataset_name]  # type: ignore
        or [sequence_and_dataset.name]  # type: ignore
    )

    result_file = result_file_dir + "/sort_output.tsv"
    df = run_sort(
        result_file,
        input_file,
        config,
        nextclade_dataset_server,
        dataset_dir,
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
            )
        )

    for _, row in best_hits.iterrows():
        # If best match is not the same as the dataset we are submitting to, add an error
        if row["dataset"] not in accepted_dataset_names:
            alerts.errors[row["seqName"]].append(
                ProcessingAnnotation.from_single(
                    ProcessingAnnotationAlignment,
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                    message=(
                        f"Sequence best matches {row['dataset']}, "
                        "a different organism than the one you are submitting to: "
                        f"{config.organism}. It is therefore not possible to release. "
                        "Contact the administrator if you think this message is an error."
                    ),
                )
            )

    return alerts


def assign_segment_with_nextclade_align(
    unprocessed: Sequence[UnprocessedEntry], config: Config, dataset_dir: str
) -> SegmentAssignmentBatch:
    """
    Run nextclade align
    """
    unaligned_nucleotide_sequences: dict[
        AccessionVersion, dict[SegmentName, NucleotideSequence | None]
    ] = defaultdict(dict)
    sequenceNameToFastaId: dict[AccessionVersion, dict[SegmentName, str]] = defaultdict(dict)
    alerts: Alerts = Alerts()

    has_missing_segments: dict[AccessionVersion, bool] = defaultdict(bool)
    has_duplicate_segments: dict[AccessionVersion, bool] = defaultdict(bool)

    id_map: defaultdict[str, tuple[AccessionVersion, FastaId]] = defaultdict(
        lambda: (AccessionVersion(), FastaId())
    )
    align_results_map: dict[AccessionVersion, dict[SegmentName, list[str]]] = defaultdict(dict)
    input_unaligned_sequences: dict[
        AccessionVersion, dict[SegmentName, NucleotideSequence | None]
    ] = defaultdict(dict)

    all_dfs = []
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as result_dir:
        input_file = result_dir + "/input.fasta"
        os.makedirs(os.path.dirname(input_file), exist_ok=True)
        for entry in unprocessed:
            accession_version = entry.accessionVersion
            input_unaligned_sequences[accession_version] = entry.data.unalignedNucleotideSequences
            with open(input_file, "a", encoding="utf-8") as f:
                for fastaId, seq in input_unaligned_sequences[accession_version].items():
                    id = f"{accession_version}__{fastaId}"
                    id_map[id] = (accession_version, fastaId)
                    f.write(f">{id}\n")
                    f.write(f"{seq}\n")

        for sequence_and_dataset in config.nucleotideSequences:
            segment = sequence_and_dataset.name
            dataset_dir_seg = (
                dataset_dir if not config.multi_segment else dataset_dir + "/" + segment
            )
            result_file_seg = result_dir + "/sort_output_" + segment + ".tsv"

            command = [
                "nextclade3",
                "run",
                f"--output-tsv={result_file_seg}",
                f"--input-dataset={dataset_dir_seg}",
                "--jobs=1",
                "--",
                input_file,
            ]
            exit_code = subprocess.run(command, check=False).returncode  # noqa: S603
            if exit_code != 0:
                msg = f"nextclade failed with exit code {exit_code}"
                raise Exception(msg)

            logger.debug("Nextclade results available in %s", result_dir)
            df = pd.read_csv(result_file_seg, sep="\t")
            df["segment"] = segment
            all_dfs.append(df)

    df_combined = pd.concat(all_dfs, ignore_index=True)
    no_hits = df_combined[df_combined["alignmentScore"].isna()]
    hits = (
        df_combined.dropna(subset=["alignmentScore"])
        .sort_values(by=["seqName", "alignmentScore"], ascending=[True, False])
        .drop_duplicates(subset="seqName", keep="first")
    )
    for seq_name in no_hits["seqName"].unique():
        if seq_name not in hits["seqName"].unique():
            (accession_version, fastaId) = id_map[seq_name]
            msg = (
                f"Sequence with fasta header {fastaId} does not align to any segment for"
                f" organism: {config.organism} per `nextclade align`. "
                f"Double check you are submitting to the correct organism."
            )
            has_missing_segments[accession_version] = True
            if config.alignment_requirement == AlignmentRequirement.ALL:
                alerts.errors.setdefault(accession_version, []).append(
                    ProcessingAnnotation.from_single(
                        ProcessingAnnotationAlignment,
                        AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                        message=msg,
                    )
                )
            else:
                alerts.warnings.setdefault(accession_version, []).append(
                    ProcessingAnnotation.from_single(
                        ProcessingAnnotationAlignment,
                        AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                        message=msg,
                    )
                )

    best_hits = hits.groupby("seqName", as_index=False).first()
    logger.debug(f"Found hits: {best_hits['seqName'].tolist()}")

    for _, row in best_hits.iterrows():
        (accession_version, fastaId) = id_map[row["seqName"]]
        for seg in config.nucleotideSequences:
            if row["segment"] == seg.name:
                align_results_map[accession_version].setdefault(seg.name, []).append(fastaId)
                break
        continue

    for accession_version, segment_map in align_results_map.items():
        for segment_name, headers in segment_map.items():
            if len(headers) > 1:
                msg = (
                    f"Multiple sequences (with fasta headers: {', '.join(headers)}) align to "
                    f"{segment_name} - only one entry is allowed."
                )
                has_duplicate_segments[accession_version] = True
                alerts.errors.setdefault(accession_version, []).append(
                    ProcessingAnnotation.from_single(
                        ProcessingAnnotationAlignment,
                        AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                        message=msg,
                    )
                )
                continue
            sequenceNameToFastaId[accession_version][segment_name] = headers[0]
            unaligned_nucleotide_sequences[accession_version][segment_name] = (
                input_unaligned_sequences[accession_version][headers[0]]
            )

    for entry in unprocessed:
        accession_version = entry.accessionVersion
        if (
            len(unaligned_nucleotide_sequences[accession_version]) == 0
            and not has_duplicate_segments.get(accession_version)
            and (
                not has_missing_segments.get(accession_version)
                or config.alignment_requirement == AlignmentRequirement.ANY
            )
        ):
            alerts.errors.setdefault(accession_version, []).append(
                ProcessingAnnotation.from_single(
                    ProcessingAnnotationAlignment,
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                    message="No sequence data could be classified - "
                    "check you are submitting to the correct organism.",
                )
            )

    return SegmentAssignmentBatch(
        unalignedNucleotideSequences=unaligned_nucleotide_sequences,
        sequenceNameToFastaId=sequenceNameToFastaId,
        alerts=alerts,
    )


def assign_segment_with_nextclade_sort(
    unprocessed: Sequence[UnprocessedEntry], config: Config, dataset_dir: str
) -> SegmentAssignmentBatch:
    """
    Run nextclade sort
    - assert highest score is in sequence_and_dataset.accepted_sort_matches
    (default is nextclade_dataset_name)
    """
    unaligned_nucleotide_sequences: dict[
        AccessionVersion, dict[SegmentName, NucleotideSequence | None]
    ] = defaultdict(dict)
    sequenceNameToFastaId: dict[AccessionVersion, dict[SegmentName, str]] = defaultdict(dict)
    alerts: Alerts = Alerts()

    has_missing_segments: dict[AccessionVersion, bool] = defaultdict(bool)
    has_duplicate_segments: dict[AccessionVersion, bool] = defaultdict(bool)

    id_map: defaultdict[str, tuple[AccessionVersion, FastaId]] = defaultdict(
        lambda: (AccessionVersion(), FastaId())
    )
    sort_results_map: dict[AccessionVersion, dict[SegmentName, list[str]]] = defaultdict(dict)
    input_unaligned_sequences: dict[
        AccessionVersion, dict[SegmentName, NucleotideSequence | None]
    ] = defaultdict(dict)
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as result_dir:
        input_file = result_dir + "/input.fasta"
        os.makedirs(os.path.dirname(input_file), exist_ok=True)
        for entry in unprocessed:
            accession_version = entry.accessionVersion
            input_unaligned_sequences[accession_version] = entry.data.unalignedNucleotideSequences
            with open(input_file, "a", encoding="utf-8") as f:
                for fastaId, seq in input_unaligned_sequences[accession_version].items():
                    id = f"{accession_version}__{fastaId}"
                    id_map[id] = (accession_version, fastaId)
                    f.write(f">{id}\n")
                    f.write(f"{seq}\n")

        result_file = result_dir + "/sort_output.tsv"
        df = run_sort(
            result_file,
            input_file,
            config,
            config.nextclade_dataset_server,
            dataset_dir,
        )

    no_hits = df[df["score"].isna()]
    hits = df.dropna(subset=["score"]).sort_values("score", ascending=False)
    for seq_name in no_hits["seqName"].unique():
        if seq_name not in hits["seqName"].unique():
            (accession_version, fastaId) = id_map[seq_name]
            msg = (
                f"Sequence with fasta header {fastaId} does not appear to match any reference for"
                f" organism: {config.organism} per `nextclade sort`. "
                f"Double check you are submitting to the correct organism."
            )
            has_missing_segments[accession_version] = True
            if config.alignment_requirement == AlignmentRequirement.ALL:
                alerts.errors.setdefault(accession_version, []).append(
                    ProcessingAnnotation.from_single(
                        ProcessingAnnotationAlignment,
                        AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                        message=msg,
                    )
                )
            else:
                alerts.warnings.setdefault(accession_version, []).append(
                    ProcessingAnnotation.from_single(
                        ProcessingAnnotationAlignment,
                        AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                        message=msg,
                    )
                )

    best_hits = hits.groupby("seqName", as_index=False).first()
    logger.debug(f"Found hits: {best_hits['seqName'].tolist()}")

    for _, row in best_hits.iterrows():
        (accession_version, fastaId) = id_map[row["seqName"]]
        not_found = True
        for segment in config.nucleotideSequences:
            # TODO: need to check that accepted_sort_matches does not overlap across segments
            if row["dataset"] in segment.accepted_sort_matches:
                not_found = False
                sort_results_map[accession_version].setdefault(segment.name, []).append(fastaId)
                break
        if not not_found:
            continue
        has_missing_segments[accession_version] = True
        msg = (
            f"Sequence {fastaId} best matches {row['dataset']}, "
            "which is currently not an accepted option for organism: "
            f"{config.organism}. It is therefore not possible to release. "
            "Contact the administrator if you think this message is an error."
        )
        if config.alignment_requirement == AlignmentRequirement.ALL:
            alerts.errors[accession_version].append(
                ProcessingAnnotation.from_single(
                    ProcessingAnnotationAlignment,
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                    message=msg,
                )
            )
        else:
            alerts.warnings[accession_version].append(
                ProcessingAnnotation.from_single(
                    ProcessingAnnotationAlignment,
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                    message=msg,
                )
            )

    for accession_version, segment_map in sort_results_map.items():
        for segment_name, headers in segment_map.items():
            if len(headers) > 1:
                msg = (
                    f"Multiple sequences (with fasta headers: {', '.join(headers)}) align to "
                    f"{segment_name} - only one entry is allowed."
                )
                has_duplicate_segments[accession_version] = True
                alerts.errors.setdefault(accession_version, []).append(
                    ProcessingAnnotation.from_single(
                        ProcessingAnnotationAlignment,
                        AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                        message=msg,
                    )
                )
                continue
            sequenceNameToFastaId[accession_version][segment_name] = headers[0]
            unaligned_nucleotide_sequences[accession_version][segment_name] = (
                input_unaligned_sequences[accession_version][headers[0]]
            )

    for entry in unprocessed:
        accession_version = entry.accessionVersion
        if (
            len(unaligned_nucleotide_sequences[accession_version]) == 0
            and not has_duplicate_segments.get(accession_version)
            and (
                not has_missing_segments.get(accession_version)
                or config.alignment_requirement == AlignmentRequirement.ANY
            )
        ):
            alerts.errors.setdefault(accession_version, []).append(
                ProcessingAnnotation.from_single(
                    ProcessingAnnotationAlignment,
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                    message="No sequence data could be classified - "
                    "check you are submitting to the correct organism.",
                )
            )

    return SegmentAssignmentBatch(
        unalignedNucleotideSequences=unaligned_nucleotide_sequences,
        sequenceNameToFastaId=sequenceNameToFastaId,
        alerts=alerts,
    )


def assign_single_segment(
    input_unaligned_sequences: dict[str, NucleotideSequence | None],
    config: Config,
) -> SegmentAssignment:
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []
    unaligned_nucleotide_sequences: dict[SegmentName, NucleotideSequence | None] = {}
    sequenceNameToFastaId: dict[SegmentName, str] = {}
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
        fastaHeader, value = next(iter(input_unaligned_sequences.items()))
        sequenceNameToFastaId["main"] = fastaHeader
        unaligned_nucleotide_sequences["main"] = value
    return SegmentAssignment(
        unalignedNucleotideSequences=unaligned_nucleotide_sequences,
        sequenceNameToFastaId=sequenceNameToFastaId,
        errors=errors,
        warnings=warnings,
    )


def assign_all_single_segments(
    unprocessed: Sequence[UnprocessedEntry], config: Config
) -> SegmentAssignmentBatch:
    unaligned_nucleotide_sequences: dict[
        AccessionVersion, dict[SegmentName, NucleotideSequence | None]
    ] = defaultdict(dict)
    segment_to_header: dict[AccessionVersion, dict[SegmentName, str]] = defaultdict(dict)
    alerts: Alerts = Alerts()
    for entry in unprocessed:
        accession_version = entry.accessionVersion
        segment_assignment = assign_single_segment(
            entry.data.unalignedNucleotideSequences,
            config=config,
        )
        segment_to_header[accession_version] = segment_assignment.sequenceNameToFastaId
        unaligned_nucleotide_sequences[accession_version] = (
            segment_assignment.unalignedNucleotideSequences
        )
        alerts.errors[accession_version] = segment_assignment.errors
        alerts.warnings[accession_version] = segment_assignment.warnings
    return SegmentAssignmentBatch(
        unalignedNucleotideSequences=unaligned_nucleotide_sequences,
        sequenceNameToFastaId=segment_to_header,
        alerts=alerts,
    )


def assign_segment_using_header(
    input_unaligned_sequences: dict[str, NucleotideSequence | None],
    config: Config,
) -> SegmentAssignment:
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []
    unaligned_nucleotide_sequences: dict[SegmentName, NucleotideSequence | None] = {}
    sequenceNameToFastaId: dict[SegmentName, str] = {}
    duplicate_segments = set()
    if not config.nucleotideSequences:
        return SegmentAssignment(
            unalignedNucleotideSequences={},
            sequenceNameToFastaId={},
            errors=errors,
            warnings=warnings,
        )
    if not config.multi_segment:
        return assign_single_segment(input_unaligned_sequences, config)
    for sequence_and_dataset in config.nucleotideSequences:
        segment = sequence_and_dataset.name
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
            sequenceNameToFastaId[segment] = unaligned_segment[0]
            unaligned_nucleotide_sequences[segment] = input_unaligned_sequences[
                unaligned_segment[0]
            ]
    remaining_segments = (
        set(input_unaligned_sequences.keys())
        - set(sequenceNameToFastaId.values())
        - duplicate_segments
    )
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
                    f"{', '.join([seq.name for seq in config.nucleotideSequences])}."
                ),
            )
        )
    if len(unaligned_nucleotide_sequences) == 0 and not duplicate_segments:
        errors.append(
            ProcessingAnnotation.from_single(
                ProcessingAnnotationAlignment,
                AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                message="No sequence data found - ",
            )
        )
    return SegmentAssignment(
        unalignedNucleotideSequences=unaligned_nucleotide_sequences,
        sequenceNameToFastaId=sequenceNameToFastaId,
        errors=errors,
        warnings=warnings,
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


def load_aligned_aa_sequences(
    result_dir_seg: str,
    config: Config,
    aligned_aminoacid_sequences: dict[AccessionVersion, dict[GeneName, AminoAcidSequence | None]],
) -> dict[AccessionVersion, dict[GeneName, AminoAcidSequence | None]]:
    """
    Load the nextclade amino acid alignment results into the aligned_aminoacid_sequences dict, mapping each
    accession to a geneName: AminoAcidSequence dictionary.
    """
    for gene in config.genes:
        translation_path = result_dir_seg + f"/nextclade.cds_translation.{gene}.fasta"
        try:
            with open(translation_path, encoding="utf-8") as aligned_translations:
                aligned_translation = SeqIO.parse(aligned_translations, "fasta")
                for aligned_sequence in aligned_translation:
                    sequence_id = aligned_sequence.id
                    masked_sequence = mask_terminal_gaps(str(aligned_sequence.seq), mask_char="X")
                    aligned_aminoacid_sequences[sequence_id][gene] = masked_sequence
        except FileNotFoundError:
            # This can happen if the sequence does not cover this gene
            logger.debug(
                f"Gene {gene} not found in Nextclade results expected at: {translation_path}"
            )
    return aligned_aminoacid_sequences


def enrich_with_nextclade(  # noqa: PLR0914
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
            sequenceNameToFastaId: dict[SegmentName, str]
    )` object.
    """
    input_metadata: dict[AccessionVersion, dict[str, Any]] = {
        entry.accessionVersion: {
            **entry.data.metadata,
            "submitter": entry.data.submitter,
            "submittedAt": entry.data.submittedAt,
            "group_id": entry.data.group_id,
        }
        for entry in unprocessed
    }

    if not config.multi_segment:
        batch = assign_all_single_segments(
            unprocessed,
            config=config,
        )
    else:
        batch = (
            assign_segment_with_nextclade_sort(
                unprocessed,
                config=config,
                dataset_dir=dataset_dir,
            )
            if config.segment_classification_method == SegmentClassificationMethod.MINIMIZER
            else assign_segment_with_nextclade_align(
                unprocessed,
                config=config,
                dataset_dir=dataset_dir,
            )
        )
    unaligned_nucleotide_sequences = batch.unalignedNucleotideSequences
    segment_assignment_map = batch.sequenceNameToFastaId
    alerts: Alerts = batch.alerts

    aligned_nucleotide_sequences: dict[
        AccessionVersion, dict[SegmentName, NucleotideSequence | None]
    ] = defaultdict(dict)
    aligned_aminoacid_sequences: dict[
        AccessionVersion, dict[GeneName, AminoAcidSequence | None]
    ] = defaultdict(dict)
    nextclade_metadata: defaultdict[
        AccessionVersion, defaultdict[SegmentName, dict[str, Any] | None]
    ] = defaultdict(lambda: defaultdict(dict))
    nucleotide_insertions: defaultdict[
        AccessionVersion, defaultdict[SegmentName, list[NucleotideInsertion]]
    ] = defaultdict(lambda: defaultdict(list))
    amino_acid_insertions: defaultdict[
        AccessionVersion, defaultdict[GeneName, list[AminoAcidInsertion]]
    ] = defaultdict(lambda: defaultdict(list))
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as result_dir:
        for sequence_and_dataset in config.nucleotideSequences:
            segment = sequence_and_dataset.name
            result_dir_seg = result_dir if not config.multi_segment else result_dir + "/" + segment
            dataset_dir_seg = (
                dataset_dir if not config.multi_segment else dataset_dir + "/" + segment
            )
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
                alerts = check_nextclade_sort_matches(
                    result_dir_seg,
                    input_file,
                    alerts,
                    config,
                    sequence_and_dataset,
                    dataset_dir,
                )

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
            aligned_aminoacid_sequences = load_aligned_aa_sequences(
                result_dir_seg, config, aligned_aminoacid_sequences
            )
            nextclade_metadata = parse_nextclade_json(
                result_dir_seg, nextclade_metadata, segment, unaligned_nucleotide_sequences
            )  # this includes the "annotation" field
            amino_acid_insertions, nucleotide_insertions = parse_nextclade_tsv(
                amino_acid_insertions,
                nucleotide_insertions,
                result_dir_seg,
                config,
                sequence_and_dataset,
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
            sequenceNameToFastaId=segment_assignment_map[id],
            errors=alerts.errors[id],
            warnings=alerts.warnings[id],
        )
        for id in input_metadata
    }


def download_nextclade_dataset(dataset_dir: str, config: Config) -> None:
    for sequence_and_dataset in config.nucleotideSequences:
        name = sequence_and_dataset.name
        nextclade_dataset_name = sequence_and_dataset.nextclade_dataset_name
        nextclade_dataset_server = (
            sequence_and_dataset.nextclade_dataset_server or config.nextclade_dataset_server
        )

        dataset_dir_seg = dataset_dir if not config.multi_segment else dataset_dir + "/" + name
        dataset_download_command = [
            "nextclade3",
            "dataset",
            "get",
            f"--name={nextclade_dataset_name}",
            f"--server={nextclade_dataset_server}",
            f"--output-dir={dataset_dir_seg}",
        ]

        if sequence_and_dataset.nextclade_dataset_tag is not None:
            dataset_download_command.append(f"--tag={sequence_and_dataset.nextclade_dataset_tag}")

        logger.info("Downloading Nextclade dataset: %s", dataset_download_command)
        if subprocess.run(dataset_download_command, check=False).returncode != 0:  # noqa: S603
            msg = "Dataset download failed"
            raise RuntimeError(msg)
        logger.info("Nextclade dataset downloaded successfully")
