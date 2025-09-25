from __future__ import annotations

import logging
from typing import Dict, Optional, Set

import httpx

from .config import ImporterConfig
from .paths import ImporterPaths
from .utils import write_text

logger = logging.getLogger(__name__)


def _create_http_client(**kwargs: object) -> httpx.Client:
    return httpx.Client(**kwargs)


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
    with _create_http_client(timeout=httpx.Timeout(60.0)) as client:
        response = client.get(lineage_url)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(f"Failed to download lineage definitions: {exc}") from exc
        write_text(paths.lineage_definition_file, response.text)
