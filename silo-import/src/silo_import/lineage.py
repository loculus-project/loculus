from __future__ import annotations

import logging
from pathlib import Path

import requests

from .config import ImporterConfig
from .file_io import write_text
from .paths import ImporterPaths

logger = logging.getLogger(__name__)


def update_lineage_definitions(
    pipeline_versions: set[int],
    config: ImporterConfig,
    paths: ImporterPaths,
) -> None:
    if not config.lineage_definitions:
        logger.info("LINEAGE_DEFINITIONS not provided; skipping lineage configuration")
        return

    if not pipeline_versions:
        # No data yet - use the lowest configured pipeline version's lineage definitions
        default_version = min(config.lineage_definitions.keys())
        logger.info(
            "No pipeline version found; using default version %s for lineage definitions",
            default_version,
        )
        pipeline_versions = {default_version}

    if len(pipeline_versions) > 1:
        msg = "Multiple pipeline versions found in released data"
        raise RuntimeError(msg)

    pipeline_version = next(iter(pipeline_versions))
    lineage_url: str | None = config.lineage_definitions.get(int(pipeline_version))
    if not lineage_url:
        msg = f"No lineage definition URL configured for pipeline version {pipeline_version}"
        raise RuntimeError(msg)

    logger.info("Downloading lineage definitions for pipeline version %s", pipeline_version)
    try:
        _download_lineage_file(lineage_url, paths.lineage_definition_file)
    except requests.RequestException as exc:
        msg = f"Failed to download lineage definitions: {exc}"
        raise RuntimeError(msg) from exc


def _download_lineage_file(url: str, destination: Path) -> None:
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(response.text, encoding="utf-8")
