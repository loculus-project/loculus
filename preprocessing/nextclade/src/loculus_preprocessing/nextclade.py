import csv
import json
import logging
import os
import re
import subprocess  # noqa: S404
import sys
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Final, Literal

import pandas as pd
from Bio import SeqIO

from .config import AlignmentRequirement, Config, NextcladeSequenceAndDataset, SequenceName
from .datatypes import (
    AccessionVersion,
    Alert,
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
    SegmentClassificationMethod,
    SegmentName,
    SequenceAssignment,
    SequenceAssignmentBatch,
    UnprocessedAfterNextclade,
    UnprocessedEntry,
)

# https://stackoverflow.com/questions/15063936
csv.field_size_limit(sys.maxsize)

logger = logging.getLogger(__name__)

DataSetIdentifier: Final = "dataset"
SequenceIdentifier: Final = "seqName"


def sequence_annotation(
    message: str,
) -> ProcessingAnnotation:
    return ProcessingAnnotation.from_single(
        ProcessingAnnotationAlignment,
        AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
        message=message,
    )


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


def create_gene_name(gene: str, gene_suffix: str | None) -> str:
    return gene + "-" + gene_suffix if gene_suffix else gene


def parse_nextclade_tsv(
    amino_acid_insertions: defaultdict[
        AccessionVersion, defaultdict[GeneName, list[AminoAcidInsertion]]
    ],
    nucleotide_insertions: defaultdict[
        AccessionVersion, defaultdict[SequenceName, list[NucleotideInsertion]]
    ],
    result_dir: str,
    sequence_and_dataset: NextcladeSequenceAndDataset,
) -> tuple[
    defaultdict[AccessionVersion, defaultdict[GeneName, list[AminoAcidInsertion]]],
    defaultdict[AccessionVersion, defaultdict[SequenceName, list[NucleotideInsertion]]],
]:
    name = sequence_and_dataset.name
    with Path(result_dir + "/nextclade.tsv").open(encoding="utf-8") as nextclade_tsv:
        reader = csv.DictReader(nextclade_tsv, delimiter="\t")
        for row in reader:
            id = row[SequenceIdentifier]

            if row["insertions"]:
                nucleotide_insertions[id][name] = list(row["insertions"].split(","))

            aa_ins_split = row["aaInsertions"].split(",")
            for ins in aa_ins_split:
                if not ins:
                    continue
                gene, val = ins.split(":", maxsplit=1)
                if gene in sequence_and_dataset.genes:
                    gene_name = create_gene_name(gene, sequence_and_dataset.gene_suffix)
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
        AccessionVersion, defaultdict[SequenceName, dict[str, Any] | None]
    ],
    name: SequenceName,
    unaligned_nucleotide_sequences: dict[
        AccessionVersion, dict[SequenceName, NucleotideSequence | None]
    ],
) -> defaultdict[AccessionVersion, defaultdict[SequenceName, dict[str, Any] | None]]:
    """
    Update nextclade_metadata object with the results of the nextclade analysis.
    If the sequence existed in the input (unaligned_nucleotide_sequences) but did not align
    nextclade_metadata[name]=None.
    """
    for id, sequences in unaligned_nucleotide_sequences.items():
        if name in sequences and sequences[name] is not None:
            nextclade_metadata[id][name] = None
    nextclade_json_path = Path(result_dir) / "nextclade.json"
    json_data = json.loads(nextclade_json_path.read_text(encoding="utf-8"))
    for result in json_data["results"]:
        id = result[SequenceIdentifier]
        nextclade_metadata[id][name] = result
    return nextclade_metadata


def run_sort(
    result_file: str,
    input_file: str,
    dataset_dir: str,
) -> pd.DataFrame:
    """
    Run nextclade
    - use config.minimizer_url or default minimizer from nextclade server
    """
    subprocess_args = [
        arg
        for arg in [
            "nextclade3",
            "sort",
            f"-m={dataset_dir}/minimizer/minimizer.json",
            "--output-results-tsv",
            result_file,
            "--max-score-gap",
            "0.3",
            "--min-score",
            "0.05",
            "--min-hits",
            "2",
            "--all-matches",
            "--",
            input_file,
        ]
        if arg
    ]

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
            SequenceIdentifier: "string",
            DataSetIdentifier: "string",
        },
    )


def run_diamond(
    result_file: str,
    input_file: str,
    dataset_dir: str,
) -> pd.DataFrame:
    """
    Run diamond blastx
    - use diamond.dmnd defined in config.diamond_dmnd_url

    We assume that each protein in the diamond database has been labeled as <name>|CDS<number>,
    where dataset is a name in accepted_dataset_matches.
    Thus we strip the |CDS<number> suffix to get the dataset identifier to compare to the
    accepted dataset matches in the config.
    If this is not the case, each protein should be added to the accepted_dataset_matches list.
    """
    subprocess_args = [
        arg
        for arg in [
            "diamond",
            "blastx",
            "--query",
            input_file,
            "--max-target-seqs",
            "1",
            "--db",
            dataset_dir + "/diamond/diamond.dmnd",
            "--out",
            result_file,
            "--outfmt",
            "6",
            "qseqid",
            "sseqid",
            "pident",
            "length",
            "mismatch",
            "gapopen",
            "qstart",
            "qend",
            "sstart",
            "send",
            "evalue",
            "bitscore",
        ]
        if arg
    ]

    logger.debug(f"Running diamond blastx: {subprocess_args}")

    exit_code = subprocess.run(subprocess_args, check=False).returncode  # noqa: S603
    if exit_code != 0:
        msg = f"diamond blastx failed with exit code {exit_code}"
        raise Exception(msg)
    df = pd.read_csv(
        result_file,
        header=None,
        names=[
            SequenceIdentifier,
            DataSetIdentifier,
            "pident",
            "length",
            "mismatch",
            "gapopen",
            "qstart",
            "qend",
            "sstart",
            "send",
            "evalue",
            "bitscore",
        ],
        sep="\t",
    )
    df[DataSetIdentifier] = df[DataSetIdentifier].str.replace(
        r"\|CDS\d+$",
        "",
        regex=True,
    )
    return df


def accepted__dataset_matches_or_default(
    dataset: NextcladeSequenceAndDataset,
) -> list[str]:
    accepted_dataset_names = set()

    if dataset.accepted_dataset_matches:
        accepted_dataset_names.update(dataset.accepted_dataset_matches)
    if dataset.nextclade_dataset_name:
        accepted_dataset_names.add(dataset.nextclade_dataset_name)
    accepted_dataset_names.add(dataset.name)
    return list(accepted_dataset_names)


# TODO: to be deprecated and multi-path feature used instead
def check_nextclade_sort_matches(  # noqa: PLR0913, PLR0917
    result_file_dir: str,
    input_file: str,
    alerts: Alerts,
    organism: str,
    accepted_dataset_matches: list[str],
    dataset_dir: str,
) -> Alerts:
    """
    Run nextclade sort
    - assert highest score is in sequence_and_dataset.accepted_dataset_matches
    (default is nextclade_dataset_name)
    """
    df = run_sort(
        result_file_dir + "/sort_output.tsv",
        input_file,
        dataset_dir,
    )

    hits = df.dropna(subset=["score"]).sort_values("score", ascending=False)
    best_hits = hits.groupby(SequenceIdentifier, as_index=False).first()
    missing_ids = set(df[SequenceIdentifier].unique()) - set(best_hits[SequenceIdentifier].unique())

    for seq in missing_ids:
        alerts[seq].warnings.append(
            sequence_annotation(
                "Sequence does not appear to match reference, per `nextclade sort`. "
                "Double check you are submitting to the correct organism."
            )
        )

    for _, row in best_hits.iterrows():
        # If best match is not the same as the dataset we are submitting to, add an error
        if row[DataSetIdentifier] not in accepted_dataset_matches:
            alerts[row[SequenceIdentifier]].errors.append(
                sequence_annotation(
                    f"Sequence best matches {row[DataSetIdentifier]}, "
                    "a different organism than the one you are submitting to: "
                    f"{organism}. It is therefore not possible to release. "
                    "Contact the administrator if you think this message is an error."
                ),
            )

    return alerts


def write_nextclade_input_fasta(
    unprocessed: Sequence[UnprocessedEntry], input_file: str
) -> defaultdict[tuple[AccessionVersion, FastaId], str]:
    """
    Write unprocessed sequences to a fasta file for nextclade input
    """
    id_map: defaultdict[tuple[AccessionVersion, FastaId], str] = defaultdict()
    os.makedirs(os.path.dirname(input_file), exist_ok=True)
    with open(input_file, "w", encoding="utf-8") as f:
        for entry in unprocessed:
            accession_version = entry.accessionVersion
            for fasta_id, seq in entry.data.unalignedNucleotideSequences.items():
                id = f"{accession_version}__{fasta_id}"
                id_map[accession_version, fasta_id] = id
                f.write(f">{id}\n")
                f.write(f"{seq}\n")
    return id_map


@dataclass
class AssignedSequence:
    fasta_id: FastaId
    name: str


def is_valid_dataset_match(method, best_dataset_id, dataset):
    if method == SegmentClassificationMethod.ALIGN:
        return best_dataset_id == dataset.name
    return best_dataset_id in accepted__dataset_matches_or_default(dataset)


def assign_segment(  # noqa: C901
    entry: UnprocessedEntry,
    id_map: dict[tuple[AccessionVersion, FastaId], str],
    best_hits: pd.DataFrame,
    config: Config,
) -> SequenceAssignment:
    """
    Assign sequences to segments based on best hits from nextclade align, nextclade sort or diamond
    If a segment has multiple references assign to the reference with highest alignment score
    1. If no best hit for a sequence, add error/warning about unaligned sequence
    2. If best hit does not match any accepted reference, add error/warning about unaligned sequence
    3. If multiple sequences match the same segment (also if they match different references of
    that segment), add error about duplicate segments
    4. If no sequences assigned and no errors about unaligned/duplicate, add error about
       no sequence data found (e.g. when alignment requirement is ANY and all sequences miss)
    """
    sort_results_map: dict[SegmentName, list[AssignedSequence]] = defaultdict(list)
    sequence_assignment = SequenceAssignment()

    has_unaligned_sequence = False
    has_duplicate_segments = False

    for fasta_id in entry.data.unalignedNucleotideSequences:
        seq_id = id_map[entry.accessionVersion, fasta_id]
        if seq_id not in best_hits[SequenceIdentifier].unique():
            has_unaligned_sequence = True
            method = config.segment_classification_method.display_name
            annotation = sequence_annotation(
                f"Sequence with fasta id {fasta_id} does not match any reference for "
                f"organism: {config.organism} per `{method}`. "
                "Double check you are submitting to the correct organism."
            )
            if config.alignment_requirement == AlignmentRequirement.ALL:
                sequence_assignment.alert.errors.append(annotation)
            else:
                sequence_assignment.alert.warnings.append(annotation)
            continue

        best_hit = best_hits[best_hits[SequenceIdentifier] == seq_id]

        not_found = True
        best_dataset_id = best_hit[DataSetIdentifier].iloc[0]
        for dataset in config.nextclade_sequence_and_datasets:
            if is_valid_dataset_match(
                config.segment_classification_method, best_dataset_id, dataset
            ):
                not_found = False
                sort_results_map.setdefault(dataset.segment, []).append(
                    AssignedSequence(fasta_id=fasta_id, name=dataset.name)
                )
                break

        if not_found:
            has_unaligned_sequence = True
            annotation = sequence_annotation(
                f"Sequence {fasta_id} best matches {best_dataset_id}, "
                "which is currently not an accepted option for organism: "
                f"{config.organism}. It is therefore not possible to release. "
                "Contact the administrator if you think this message is an error."
            )
            if config.alignment_requirement == AlignmentRequirement.ALL:
                sequence_assignment.alert.errors.append(annotation)
            else:
                sequence_assignment.alert.warnings.append(annotation)

    for segment, ids in sort_results_map.items():
        if len(ids) > 1:
            has_duplicate_segments = True
            sequence_assignment.alert.errors.append(
                sequence_annotation(
                    f"Multiple sequences (with fasta ids: {', '.join([id.fasta_id for id in ids])})"
                    f" align to {segment} - only one entry is allowed."
                )
            )
            continue

        sequence_assignment.sequenceNameToFastaId[ids[0].name] = ids[0].fasta_id
        sequence_assignment.unalignedNucleotideSequences[ids[0].name] = (
            entry.data.unalignedNucleotideSequences[ids[0].fasta_id]
        )

    if (
        len(sequence_assignment.unalignedNucleotideSequences) == 0
        and not has_duplicate_segments
        and (not has_unaligned_sequence or config.alignment_requirement == AlignmentRequirement.ANY)
    ):
        sequence_assignment.alert.errors.append(
            sequence_annotation(
                "No sequence data could be classified - "
                "check you are submitting to the correct organism.",
            )
        )

    return sequence_assignment


def assign_segment_with_nextclade_align(
    unprocessed: Sequence[UnprocessedEntry], config: Config, dataset_dir: str
) -> SequenceAssignmentBatch:
    """
    Run nextclade align
    - assert sequence aligns to one of the references in config.nextclade_sequence_and_datasets
    """
    batch = SequenceAssignmentBatch()

    all_dfs = []
    with TemporaryDirectory(delete=not config.keep_tmp_dir) as result_dir:
        input_file = result_dir + "/input.fasta"
        id_map = write_nextclade_input_fasta(unprocessed, input_file)

        for sequence_and_dataset in config.nextclade_sequence_and_datasets:
            name = sequence_and_dataset.name
            result_file_seg = f"{result_dir}/sort_output_{name}.tsv"

            command = [
                "nextclade3",
                "run",
                f"--output-tsv={result_file_seg}",
                f"--input-dataset={dataset_dir}/{name}",
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
            df[DataSetIdentifier] = name
            all_dfs.append(df)

    df_combined = pd.concat(all_dfs, ignore_index=True)
    hits = df_combined.dropna(subset=["alignmentScore"]).sort_values(
        by=[SequenceIdentifier, "alignmentScore"], ascending=[True, False]
    )
    best_hits = hits.groupby(SequenceIdentifier, as_index=False).first()

    for entry in unprocessed:
        sequence_assignment = assign_segment(
            entry,
            id_map,
            best_hits,
            config,
        )
        accession_version = entry.accessionVersion
        batch.sequenceNameToFastaId[accession_version] = sequence_assignment.sequenceNameToFastaId
        batch.unalignedNucleotideSequences[accession_version] = (
            sequence_assignment.unalignedNucleotideSequences
        )
        batch.alerts[accession_version] = sequence_assignment.alert

    return batch


def assign_segment_with_nextclade_sort(
    unprocessed: Sequence[UnprocessedEntry], config: Config, dataset_dir: str
) -> SequenceAssignmentBatch:
    """
    Run nextclade sort
    - assert highest score is in sequence_and_dataset.accepted_dataset_matches
    (default is nextclade_dataset_name)
    """
    batch = SequenceAssignmentBatch()

    with TemporaryDirectory(delete=not config.keep_tmp_dir) as result_dir:
        input_file = result_dir + "/input.fasta"
        id_map = write_nextclade_input_fasta(unprocessed, input_file)

        df = run_sort(
            result_file=result_dir + "/sort_output.tsv",
            input_file=input_file,
            dataset_dir=dataset_dir,
        )

    # Get best hits per sequence
    hits = df.dropna(subset=["score"]).sort_values(
        [SequenceIdentifier, "score"], ascending=[True, False]
    )
    best_hits = hits.groupby(SequenceIdentifier, as_index=False).first()

    for entry in unprocessed:
        sequence_assignment = assign_segment(
            entry,
            id_map,
            best_hits,
            config,
        )
        accession_version = entry.accessionVersion
        batch.sequenceNameToFastaId[accession_version] = sequence_assignment.sequenceNameToFastaId
        batch.unalignedNucleotideSequences[accession_version] = (
            sequence_assignment.unalignedNucleotideSequences
        )
        batch.alerts[accession_version] = sequence_assignment.alert
    return batch


def assign_segment_with_diamond(
    unprocessed: Sequence[UnprocessedEntry], config: Config, dataset_dir: str
) -> SequenceAssignmentBatch:
    """
    Run diamond
    - assert highest pident (percent identity) score is in
    sequence_and_dataset.accepted_dataset_matches (default is nextclade_dataset_name)
    """
    batch = SequenceAssignmentBatch()

    with TemporaryDirectory(delete=not config.keep_tmp_dir) as result_dir:
        input_file = result_dir + "/input.fasta"
        id_map = write_nextclade_input_fasta(unprocessed, input_file)

        df = run_diamond(
            result_file=result_dir + "/diamond_output.tsv",
            input_file=input_file,
            dataset_dir=dataset_dir,
        )

    # Get best hits per sequence
    hits = df.dropna(subset=["pident"]).sort_values(
        [SequenceIdentifier, "pident"], ascending=[True, False]
    )
    best_hits = hits.groupby(SequenceIdentifier, as_index=False).first()

    for entry in unprocessed:
        sequence_assignment = assign_segment(
            entry,
            id_map,
            best_hits,
            config,
        )
        accession_version = entry.accessionVersion
        batch.sequenceNameToFastaId[accession_version] = sequence_assignment.sequenceNameToFastaId
        batch.unalignedNucleotideSequences[accession_version] = (
            sequence_assignment.unalignedNucleotideSequences
        )
        batch.alerts[accession_version] = sequence_assignment.alert
    return batch


def assign_single_segment(
    input_unaligned_sequences: dict[str, NucleotideSequence | None],
    config: Config,
) -> SequenceAssignment:
    if len(input_unaligned_sequences) > 1:
        return SequenceAssignment(
            alert=Alert(
                errors=[
                    sequence_annotation(
                        f"Multiple sequences: {list(input_unaligned_sequences.keys())} found in the"
                        f" input data, but organism: {config.organism} is single-segmented. "
                        "Please check that your metadata and sequences are annotated correctly."
                        "Each metadata entry should have a single corresponding fasta sequence "
                        "entry with the same submissionId."
                    )
                ],
            ),
        )
    return SequenceAssignment(
        unalignedNucleotideSequences={"main": next(iter(input_unaligned_sequences.values()))},
        sequenceNameToFastaId={"main": next(iter(input_unaligned_sequences.keys()))},
    )


def assign_all_single_segments(
    unprocessed: Sequence[UnprocessedEntry], config: Config
) -> SequenceAssignmentBatch:
    batch = SequenceAssignmentBatch()
    for entry in unprocessed:
        accession_version = entry.accessionVersion
        sequence_assignment = assign_single_segment(
            entry.data.unalignedNucleotideSequences,
            config=config,
        )
        batch.sequenceNameToFastaId[accession_version] = sequence_assignment.sequenceNameToFastaId
        batch.unalignedNucleotideSequences[accession_version] = (
            sequence_assignment.unalignedNucleotideSequences
        )
        batch.alerts[accession_version] = sequence_assignment.alert
    return batch


def assign_segment_using_header(
    input_unaligned_sequences: dict[str, NucleotideSequence | None],
    config: Config,
) -> SequenceAssignment:
    # This is called when sequences are not aligned we assume there is only one valid reference
    sequence_assignment = SequenceAssignment()
    duplicate_segments = set()
    if not config.nextclade_sequence_and_datasets or not input_unaligned_sequences:
        return sequence_assignment
    if not config.multi_segment:
        return assign_single_segment(input_unaligned_sequences, config)
    for sequence_and_dataset in config.nextclade_sequence_and_datasets:
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
            sequence_assignment.alert.errors.append(
                sequence_annotation(
                    f"Found multiple sequences with the same segment name: {segment}. "
                    "Each metadata entry can have multiple corresponding fasta sequence "
                    "entries with format <submissionId>_<segmentName>."
                )
            )
        elif len(unaligned_segment) == 1:
            sequence_assignment.sequenceNameToFastaId[segment] = unaligned_segment[0]
            sequence_assignment.unalignedNucleotideSequences[segment] = input_unaligned_sequences[
                unaligned_segment[0]
            ]
    remaining_segments = (
        set(input_unaligned_sequences.keys())
        - set(sequence_assignment.sequenceNameToFastaId.values())
        - duplicate_segments
    )
    if len(remaining_segments) > 0:
        sequence_assignment.alert.errors.append(
            sequence_annotation(
                f"Found sequences in the input data with segments that are not in the config: "
                f"{', '.join(remaining_segments)}. "
                "Each metadata entry can have multiple corresponding fasta sequence "
                "entries with format <submissionId>_<segmentName> valid segments are: "
                f"{', '.join([seq.name for seq in config.nextclade_sequence_and_datasets])}."
            )
        )
    if len(sequence_assignment.unalignedNucleotideSequences) == 0 and not duplicate_segments:
        sequence_assignment.alert.errors.append(
            sequence_annotation(
                "No sequence data found - check segments are annotated correctly.",
            )
        )
    return sequence_assignment


def load_aligned_nuc_sequences(
    result_dir_seg: str,
    name: SequenceName,
    aligned_nucleotide_sequences: dict[
        AccessionVersion, dict[SequenceName, NucleotideSequence | None]
    ],
) -> dict[AccessionVersion, dict[SequenceName, NucleotideSequence | None]]:
    """
    Load the nextclade alignment results into the aligned_nucleotide_sequences dict, mapping each
    accession to a sequenceName: NucleotideSequence dictionary.
    """
    with open(result_dir_seg + "/nextclade.aligned.fasta", encoding="utf-8") as aligned_nucs:
        aligned_nuc = SeqIO.parse(aligned_nucs, "fasta")
        for aligned_sequence in aligned_nuc:
            sequence_id: str = aligned_sequence.id
            sequence: NucleotideSequence = str(aligned_sequence.seq)
            aligned_nucleotide_sequences[sequence_id][name] = mask_terminal_gaps(sequence)
    return aligned_nucleotide_sequences


def load_aligned_aa_sequences(
    result_dir_seg: str,
    sequence_and_dataset: NextcladeSequenceAndDataset,
    aligned_aminoacid_sequences: dict[AccessionVersion, dict[GeneName, AminoAcidSequence | None]],
) -> dict[AccessionVersion, dict[GeneName, AminoAcidSequence | None]]:
    """
    Load the nextclade amino acid alignment results into the aligned_aminoacid_sequences dict, mapping each
    accession to a geneName: AminoAcidSequence dictionary.
    """
    for gene in sequence_and_dataset.genes:
        translation_path = result_dir_seg + f"/nextclade.cds_translation.{gene}.fasta"
        try:
            with open(translation_path, encoding="utf-8") as aligned_translations:
                aligned_translation = SeqIO.parse(aligned_translations, "fasta")
                for aligned_sequence in aligned_translation:
                    sequence_id = aligned_sequence.id
                    masked_sequence = mask_terminal_gaps(str(aligned_sequence.seq), mask_char="X")
                    gene_name = create_gene_name(gene, sequence_and_dataset.gene_suffix)
                    aligned_aminoacid_sequences[sequence_id][gene_name] = masked_sequence
        except FileNotFoundError:
            # This can happen if the sequence does not cover this gene
            logger.debug(
                f"Gene {gene} not found in Nextclade results expected at: {translation_path}"
            )
    return aligned_aminoacid_sequences


def enrich_with_nextclade(  # noqa: C901, PLR0914
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

    if not config.multi_datasets:
        batch = assign_all_single_segments(unprocessed, config=config)
    else:
        match config.segment_classification_method:
            case SegmentClassificationMethod.DIAMOND:
                batch = assign_segment_with_diamond(
                    unprocessed, config=config, dataset_dir=dataset_dir
                )
            case SegmentClassificationMethod.MINIMIZER:
                batch = assign_segment_with_nextclade_sort(
                    unprocessed, config=config, dataset_dir=dataset_dir
                )
            case SegmentClassificationMethod.ALIGN:
                batch = assign_segment_with_nextclade_align(
                    unprocessed, config=config, dataset_dir=dataset_dir
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
        for sequence_and_dataset in config.nextclade_sequence_and_datasets:
            name = sequence_and_dataset.name
            result_dir_seg = result_dir + "/" + name
            input_file = result_dir_seg + "/input.fasta"
            os.makedirs(os.path.dirname(input_file), exist_ok=True)
            is_empty: bool = True
            with open(input_file, "w", encoding="utf-8") as f:
                for id, seg_dict in unaligned_nucleotide_sequences.items():
                    if name in seg_dict and seg_dict[name] is not None:
                        f.write(f">{id}\n")
                        f.write(f"{seg_dict[name]}\n")
                        is_empty = False
            if is_empty:
                continue

            if config.require_nextclade_sort_match:
                alerts = check_nextclade_sort_matches(
                    result_file_dir=result_dir_seg,
                    input_file=input_file,
                    alerts=alerts,
                    organism=config.organism,
                    accepted_dataset_matches=accepted__dataset_matches_or_default(
                        sequence_and_dataset
                    ),
                    dataset_dir=dataset_dir,
                )

            command = [
                "nextclade3",
                "run",
                f"--output-all={result_dir_seg}",
                f"--input-dataset={dataset_dir}/{name}",
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
                result_dir_seg, name, aligned_nucleotide_sequences
            )
            aligned_aminoacid_sequences = load_aligned_aa_sequences(
                result_dir_seg, sequence_and_dataset, aligned_aminoacid_sequences
            )
            nextclade_metadata = parse_nextclade_json(
                result_dir_seg, nextclade_metadata, name, unaligned_nucleotide_sequences
            )  # this includes the "annotation" field
            amino_acid_insertions, nucleotide_insertions = parse_nextclade_tsv(
                amino_acid_insertions,
                nucleotide_insertions,
                result_dir_seg,
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
            errors=alerts[id].errors,
            warnings=alerts[id].warnings,
        )
        for id in input_metadata
    }


def download_nextclade_dataset(dataset_dir: str, config: Config) -> None:
    for sequence_and_dataset in config.nextclade_sequence_and_datasets:
        dataset_download_command = [
            arg
            for arg in [
                "nextclade3",
                "dataset",
                "get",
                f"--name={sequence_and_dataset.nextclade_dataset_name}",
                f"--server={
                    sequence_and_dataset.nextclade_dataset_server or config.nextclade_dataset_server
                }",
                f"--output-dir={dataset_dir}/{sequence_and_dataset.name}",
                f"--tag={sequence_and_dataset.nextclade_dataset_tag}"
                if sequence_and_dataset.nextclade_dataset_tag
                else "",
            ]
            if arg
        ]
        logger.info("Downloading Nextclade dataset: %s", dataset_download_command)
        if subprocess.run(dataset_download_command, check=False).returncode != 0:  # noqa: S603
            msg = "Dataset download failed"
            raise RuntimeError(msg)
        logger.info("Nextclade dataset downloaded successfully")
