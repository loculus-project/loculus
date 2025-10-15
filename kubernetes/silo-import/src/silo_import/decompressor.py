"""Decompression and analysis of NDJSON data files."""

from __future__ import annotations

import io
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Set

import zstandard

logger = logging.getLogger(__name__)


@dataclass
class NdjsonAnalysis:
    """Result of analyzing an NDJSON file."""

    record_count: int
    pipeline_versions: Set[str]


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
    record_count = 0
    pipeline_versions: Set[str] = set()
    decompressor = zstandard.ZstdDecompressor()

    try:
        with path.open("rb") as compressed, decompressor.stream_reader(compressed) as reader:
            text_stream = io.TextIOWrapper(reader, encoding="utf-8")
            for line in text_stream:
                line = line.strip()
                if not line:
                    continue
                record_count += 1
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"Invalid JSON record: {exc}") from exc

                metadata = obj.get("metadata") if isinstance(obj, dict) else None
                if isinstance(metadata, dict):
                    pipeline_version = metadata.get("pipelineVersion")
                    if pipeline_version:
                        pipeline_versions.add(str(pipeline_version))
    except zstandard.ZstdError as exc:
        raise RuntimeError(f"Failed to decompress {path}: {exc}") from exc

    return NdjsonAnalysis(record_count=record_count, pipeline_versions=pipeline_versions)