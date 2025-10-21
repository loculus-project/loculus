from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, Optional, Set

import requests

from .config import ImporterConfig
from .file_io import write_text
from .paths import ImporterPaths

logger = logging.getLogger(__name__)


def update_lineage_definitions(
    pipeline_versions: Set[str],
    config: ImporterConfig,
    paths: ImporterPaths,
) -> None:
    if not config.lineage_definitions:
        logger.info("LINEAGE_DEFINITIONS not provided; skipping lineage configuration")
        return

    if not pipeline_versions:
        logger.info("No pipeline version found; writing empty lineage definitions")
        write_text(paths.lineage_definition_file, "{}\n")
        return

    if len(pipeline_versions) > 1:
        raise RuntimeError("Multiple pipeline versions found in released data")

    lineage_map: Dict[str, str] = config.lineage_definitions
    pipeline_version = next(iter(pipeline_versions))
    lineage_url: Optional[str] = lineage_map.get(pipeline_version)
    if not lineage_url:
        raise RuntimeError(
            f"No lineage definition URL configured for pipeline version {pipeline_version}"
        )

    logger.info("Downloading lineage definitions for pipeline version %s", pipeline_version)
    try:
        _download_lineage_file(lineage_url, paths.lineage_definition_file)
    except requests.RequestException as exc:
        raise RuntimeError(f"Failed to download lineage definitions: {exc}") from exc


def _download_lineage_file(url: str, destination: Path) -> None:
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(response.text, encoding="utf-8")
