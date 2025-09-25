from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from typing import Dict, Optional, Set

from .config import ImporterConfig
from .paths import ImporterPaths
from .utils import write_text

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
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"Failed to download lineage definitions: {exc}") from exc


def _download_lineage_file(url: str, destination: Path) -> None:
    cmd = ["curl", "-sS", "--fail", "-o", str(destination), url]
    subprocess.run(cmd, check=True)
