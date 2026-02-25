from __future__ import annotations

import logging
from pathlib import Path

import requests

from .config import ImporterConfig
from .paths import ImporterPaths

logger = logging.getLogger(__name__)


def update_lineage_definitions(
    pipeline_version: int | None,
    config: ImporterConfig,
    paths: ImporterPaths,
) -> None:
    if not config.lineage_definitions:
        logger.info("LINEAGE_DEFINITIONS not provided; skipping lineage configuration")
        return

    for system_name, version_urls in config.lineage_definitions.items():
        dest = paths.lineage_definition_file(system_name)

        if not pipeline_version:
            # required for dummy organisms
            logger.info(
                "No pipeline version found; writing empty lineage definitions for %s",
                system_name,
            )
            _write_text(dest, "{}\n")
            continue

        lineage_url: str | None = version_urls.get(int(pipeline_version))
        if not lineage_url:
            msg = (
                f"No lineage definition URL configured for pipeline version "
                f"{pipeline_version} in system {system_name}"
            )
            raise RuntimeError(msg)

        logger.info(
            "Downloading lineage definitions for %s pipeline version %s",
            system_name,
            pipeline_version,
        )
        try:
            _download_lineage_file(lineage_url, dest)
        except requests.RequestException as exc:
            msg = f"Failed to download lineage definitions for {system_name}: {exc}"
            raise RuntimeError(msg) from exc


def _download_lineage_file(url: str, destination: Path) -> None:
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    _write_text(destination, response.text)


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
