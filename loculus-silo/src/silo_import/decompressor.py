"""Decompression and analysis of NDJSON data files."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

import orjsonl

logger = logging.getLogger(__name__)


@dataclass
class NdjsonAnalysis:
    """Result of analyzing an NDJSON file."""

    record_count: int
    pipeline_version: int | None
    lineage_values: dict[str, set[str]] = field(default_factory=dict)


def analyze_ndjson(
    path: Path,
    lineage_field_mapping: Mapping[str, list[str]] | None = None,
) -> NdjsonAnalysis:
    """
    Decompress and analyze a zstd-compressed NDJSON file.

    Args:
        path: Path to the compressed NDJSON file
        lineage_field_mapping: Optional mapping of ``lineage system name ->
            list of metadata field names`` whose values should be collected.
            For each lineage system, the unique non-empty values found across
            all of its metadata fields are returned in
            ``NdjsonAnalysis.lineage_values``.

    Returns:
        NdjsonAnalysis with record count, pipeline version and (optionally)
        the unique lineage values observed per lineage system.

    Raises:
        RuntimeError: If decompression or JSON parsing fails
    """
    logger.info("Starting analyze_and_transform_ndjson")
    record_count = 0
    pipeline_version: int | None = None

    mapping = dict(lineage_field_mapping or {})
    # Invert the mapping: field name -> list of systems that consume it.
    field_to_systems: dict[str, list[str]] = {}
    for system, fields in mapping.items():
        for field_name in fields:
            field_to_systems.setdefault(field_name, []).append(system)

    lineage_values: dict[str, set[str]] = {system: set() for system in mapping}

    try:
        for record in orjsonl.stream(path):
            record_count += 1
            metadata = record.get("metadata", {}) or {}  # type: ignore[union-attr]
            if pipeline_version is None:
                pipeline_version = metadata.get("pipelineVersion")
            if not field_to_systems:
                continue
            for field_name, systems in field_to_systems.items():
                value = metadata.get(field_name)
                if value is None or value == "":
                    continue
                value_str = str(value)
                for system in systems:
                    lineage_values[system].add(value_str)

    except Exception as exc:
        msg = f"Failed to decompress {path}: {exc}"
        logger.error(msg)
        raise RuntimeError(msg) from exc

    return NdjsonAnalysis(
        record_count=record_count,
        pipeline_version=pipeline_version,
        lineage_values=lineage_values,
    )
