"""Decompression, analysis, and transformation of NDJSON data files."""

from __future__ import annotations

import io
import json
import logging
from dataclasses import dataclass
from pathlib import Path

import zstandard

from silo_import.constants import TRANSFORMED_DATA_FILENAME

logger = logging.getLogger(__name__)


@dataclass
class NdjsonAnalysis:
    """Result of analyzing an NDJSON file."""

    record_count: int
    pipeline_versions: set[int]
    transformed_path: Path


def transform_record(record: dict) -> dict:
    """
    Transform a single JSON record.

    Args:
        record: Input record with metadata, sequences, and insertions

    Returns:
        Transformed record with flattened metadata and combined sequences
    """
    result = {}

    metadata = record.get("metadata", {})
    result.update(metadata)

    nucleotide_insertions = record.get("nucleotideInsertions", {})
    amino_acid_insertions = record.get("aminoAcidInsertions", {})

    # Process aligned nucleotide sequences
    aligned_nuc_seqs = record.get("alignedNucleotideSequences", {})
    for segment_key, sequence_value in aligned_nuc_seqs.items():
        if sequence_value is None:
            result[segment_key] = None
        else:
            insertions = nucleotide_insertions.get(segment_key, [])
            result[segment_key] = {"sequence": sequence_value, "insertions": insertions}

    # Process aligned amino acid sequences
    aligned_aa_seqs = record.get("alignedAminoAcidSequences", {})
    for gene_key, sequence_value in aligned_aa_seqs.items():
        if sequence_value is None:
            result[gene_key] = None
        else:
            insertions = amino_acid_insertions.get(gene_key, [])
            result[gene_key] = {"sequence": sequence_value, "insertions": insertions}

    # Process unaligned nucleotide sequences
    unaligned_nuc_seqs = record.get("unalignedNucleotideSequences", {})
    for segment_key, sequence_value in unaligned_nuc_seqs.items():
        unaligned_key = f"unaligned_{segment_key}"
        result[unaligned_key] = sequence_value

    return result


def analyze_and_transform_ndjson(path: Path) -> NdjsonAnalysis:
    """
    Decompress, analyze, and transform a zstd-compressed NDJSON file.

    This function performs a single-pass operation that:
    1. Decompresses the input file
    2. Counts records and extracts pipeline versions
    3. Transforms each record and writes to a new compressed file

    Args:
        path: Path to the compressed NDJSON file

    Returns:
        NdjsonAnalysis with record count, pipeline versions, and transformed file path

    Raises:
        RuntimeError: If decompression, JSON parsing, or transformation fails
    """
    record_count = 0
    pipeline_versions: set[int] = set()

    transformed_path = path.with_name(TRANSFORMED_DATA_FILENAME)
    decompressor = zstandard.ZstdDecompressor()
    compressor = zstandard.ZstdCompressor()

    try:
        with (
            path.open("rb") as compressed_input,
            decompressor.stream_reader(compressed_input) as reader,
            transformed_path.open("wb") as compressed_output,
            compressor.stream_writer(compressed_output) as writer,
        ):
            text_stream = io.TextIOWrapper(reader, encoding="utf-8")

            for line in text_stream:
                line_stripped = line.strip()
                if not line_stripped:
                    continue

                record_count += 1

                try:
                    obj = json.loads(line_stripped)
                except json.JSONDecodeError as exc:
                    msg = f"Invalid JSON record: {exc}"
                    raise RuntimeError(msg) from exc

                metadata = obj.get("metadata") if isinstance(obj, dict) else None
                if isinstance(metadata, dict):
                    pipeline_version = metadata.get("pipelineVersion")
                    if pipeline_version:
                        pipeline_versions.add(int(pipeline_version))

                try:
                    transformed = transform_record(obj)
                except Exception as exc:
                    msg = f"Failed to transform record at line {record_count}: {exc}"
                    raise RuntimeError(msg) from exc

                transformed_json = json.dumps(transformed, separators=(",", ":"))
                writer.write(f"{transformed_json}\n".encode())
    except zstandard.ZstdError as exc:
        msg = f"Failed to compress/decompress {path}: {exc}"
        raise RuntimeError(msg) from exc

    return NdjsonAnalysis(
        record_count=record_count,
        pipeline_versions=pipeline_versions,
        transformed_path=transformed_path,
    )
