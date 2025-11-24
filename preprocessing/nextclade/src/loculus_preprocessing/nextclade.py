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

from .config import Config
from .datatypes import (
    AccessionVersion,
    Alerts,
    AminoAcidInsertion,
    AminoAcidSequence,
    AnnotationSourceType,
    GeneName,
    GenericSequence,
    NucleotideInsertion,
    NucleotideSequence,
    ProcessingAnnotation,
    ProcessingAnnotationAlignment,
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


def enrich_with_nextclade(  # noqa: C901, PLR0912, PLR0914, PLR0915
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
        num_valid_segments = 0
        num_duplicate_segments = 0
        for segment in config.nucleotideSequences:
            unaligned_segment = [
                data
                for data in entry.data.unalignedNucleotideSequences
                if re.match(segment + "$", data, re.IGNORECASE)
            ]
            if len(unaligned_segment) > 1:
                num_duplicate_segments += len(unaligned_segment)
                alerts.errors[id].append(
                    ProcessingAnnotation.from_single(
                        segment,
                        AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                        message="Found multiple sequences with the same segment name.",
                    ),
                )
            elif len(unaligned_segment) == 1:
                num_valid_segments += 1
                unaligned_nucleotide_sequences[id][segment] = (
                    entry.data.unalignedNucleotideSequences[unaligned_segment[0]]
                )
                aligned_nucleotide_sequences[id][segment] = None
        if (
            len(entry.data.unalignedNucleotideSequences)
            - num_valid_segments
            - num_duplicate_segments
            > 0
        ):
            alerts.errors[id].append(
                ProcessingAnnotation.from_single(
                    ProcessingAnnotationAlignment,
                    AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                    message=(
                        "Found unknown segments in the input data - "
                        "check your segments are annotated correctly."
                    ),
                ),
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
