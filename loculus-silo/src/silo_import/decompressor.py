"""Decompression and analysis of NDJSON data files."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import orjsonl

from .config import HierarchicalServiceUrl, MetadataField

logger = logging.getLogger(__name__)


@dataclass
class NdjsonAnalysis:
    """Result of analyzing an NDJSON file."""

    record_count: int
    pipeline_version: int | None
    hierarchical_filter_values: dict[MetadataField, set[str]] = field(default_factory=dict)


def analyze_ndjson(
    path: Path,
    hierarchical_filters: dict[MetadataField, HierarchicalServiceUrl] | None = None,
) -> NdjsonAnalysis:
    """
    Decompress and analyze a zstd-compressed NDJSON file.

    Args:
        path: Path to the compressed NDJSON file
        hierarchical_filters: List of configured filter configs; the
            metadata field referenced by each is collected per record.

    Returns:
        NdjsonAnalysis with record count, pipeline version, and per-kind
        observed values for the configured hierarchical filters.

    Raises:
        RuntimeError: If decompression or JSON parsing fails
    """
    logger.info("Starting analyze_and_transform_ndjson")
    record_count = 0
    pipeline_version: int | None = None
    filter_values: dict[MetadataField, set[str]] = (
        {name: set() for name in hierarchical_filters} if hierarchical_filters else {}
    )

    try:
        for record in orjsonl.stream(path):
            record_count += 1
            metadata = record.get("metadata", {})  # type: ignore
            if pipeline_version is None:
                pipeline_version = metadata.get("pipelineVersion")
            if hierarchical_filters:
                for name in hierarchical_filters:
                    raw_value = metadata.get(name)
                    if raw_value is not None:
                        filter_values[name].add(str(raw_value))

    except Exception as exc:
        msg = f"Failed to decompress {path}: {exc}"
        logger.error(msg)
        raise RuntimeError(msg) from exc

    return NdjsonAnalysis(
        record_count=record_count,
        pipeline_version=pipeline_version,
        hierarchical_filter_values=filter_values,
    )
