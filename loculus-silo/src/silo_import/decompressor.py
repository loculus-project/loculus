"""Decompression and analysis of NDJSON data files."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import orjsonl

logger = logging.getLogger(__name__)


@dataclass
class NdjsonAnalysis:
    """Result of analyzing an NDJSON file."""

    record_count: int
    pipeline_version: int | None
    host_taxon_ids: set[str]


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
    host_taxon_ids: set[str] = set()

    try:
        for record in orjsonl.stream(path):
            record_count += 1
            metadata = record.get("metadata", {})  # type: ignore
            if pipeline_version is None:
                pipeline_version = metadata.get("pipelineVersion")
            taxon = metadata.get("hostTaxonId")
            if taxon:
                host_taxon_ids.add(str(taxon))

    except Exception as exc:
        msg = f"Failed to decompress {path}: {exc}"
        logger.error(msg)
        raise RuntimeError(msg) from exc

    return NdjsonAnalysis(
        record_count=record_count, pipeline_version=pipeline_version, host_taxon_ids=host_taxon_ids
    )
