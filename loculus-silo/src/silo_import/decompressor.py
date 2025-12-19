"""Decompression and analysis of NDJSON data files."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import orjsonl
import zstandard

logger = logging.getLogger(__name__)


@dataclass
class NdjsonAnalysis:
    """Result of analyzing an NDJSON file."""

    record_count: int
    pipeline_version: int | None


def analyze_ndjson(path: Path) -> NdjsonAnalysis:
    """
    Decompress and analyze a zstd-compressed NDJSON file.

    Args:
        path: Path to the compressed NDJSON file

    Returns:
        NdjsonAnalysis with record count and pipeline versions found

    Raises:
        RuntimeError: If decompression or JSON parsing fails
    """
    logger.info("Starting analyze_and_transform_ndjson")
    record_count = 0
    pipeline_version: int | None = None
    decompressor = zstandard.ZstdDecompressor()

    try:
        with path.open("rb") as compressed, decompressor.stream_reader(compressed) as reader:
            for record in orjsonl.stream(reader):
                record_count += 1
                if pipeline_version is None:
                    pipeline_version = record.get("metadata", {}).get("pipelineVersion")

    except zstandard.ZstdError as exc:
        msg = f"Failed to decompress {path}: {exc}"
        logger.error(msg)
        raise RuntimeError(msg) from exc

    return NdjsonAnalysis(record_count=record_count, pipeline_version=pipeline_version)
