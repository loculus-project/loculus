"""Decompression and analysis of NDJSON data files."""

from __future__ import annotations

import io
import json
import logging
from dataclasses import dataclass
from pathlib import Path

import zstandard

logger = logging.getLogger(__name__)


@dataclass
class NdjsonAnalysis:
    """Result of analyzing an NDJSON file."""

    record_count: int
    pipeline_versions: set[int]


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
    pipeline_versions: set[int] = set()
    decompressor = zstandard.ZstdDecompressor()

    try:
        with path.open("rb") as compressed, decompressor.stream_reader(compressed) as reader:
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
    except zstandard.ZstdError as exc:
        msg = f"Failed to decompress {path}: {exc}"
        raise RuntimeError(msg) from exc

    return NdjsonAnalysis(record_count=record_count, pipeline_versions=pipeline_versions)
