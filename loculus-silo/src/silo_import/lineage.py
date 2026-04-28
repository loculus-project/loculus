from __future__ import annotations

import logging
from pathlib import Path

import requests
from requests import codes

from .config import HierarchicalFilterKind, ImporterConfig
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

    if not pipeline_version:
        # required for dummy organisms
        logger.info("No pipeline version found; writing empty lineage definitions")
        for lineage in config.lineage_definitions:
            _write_text(paths.input_dir / f"{lineage}.yaml", "{}\n")
        return

    for lineage, item in config.lineage_definitions.items():
        lineage_url: str | None = item.get(int(pipeline_version))
        if not lineage_url:
            msg = (
                f"No lineage definition URL configured for pipeline version {pipeline_version} "
                f"and lineage system '{lineage}'"
            )
            raise RuntimeError(msg)

        logger.info("Downloading lineage definitions for pipeline version %s", pipeline_version)
        try:
            _download_lineage_file(lineage_url, paths.input_dir / f"{lineage}.yaml")
        except requests.RequestException as exc:
            msg = f"Failed to download lineage definitions: {exc}"
            raise RuntimeError(msg) from exc


def update_hierarchical_filters(
    values_by_kind: dict[HierarchicalFilterKind, set[str]],
    config: ImporterConfig,
    paths: ImporterPaths,
    *,
    subset: set[HierarchicalFilterKind] | None = None,
) -> None:
    """Dispatch each configured filter to its dedicated handler.

    New filter kinds slot in by adding a HierarchicalFilterKind member and a
    corresponding case here.
    """
    if not config.hierarchical_filters:
        return
    for kind, hf in config.hierarchical_filters.items():
        if subset is not None and kind not in subset:
            continue
        values = values_by_kind.get(kind, set())
        match kind:
            # If we add new filter kinds, we should implement a corresponding
            # handler function and call it here
            case HierarchicalFilterKind.HOST_TAXON:
                update_taxonomic_lineage(kind.value, values, hf.url, paths)


def update_taxonomic_lineage(
    file_base: str,
    taxa: set[str],
    service_url: str,
    paths: ImporterPaths,
) -> None:
    destination = paths.input_dir / f"{file_base}.yaml"
    if not taxa:
        logger.info("No taxa for filter '%s'; writing empty lineage", file_base)
        _write_text(destination, "{}\n")
        return

    url = f"{service_url.rstrip('/')}/silo-lineage"
    logger.info("Fetching %s hierarchy for %d taxa", file_base, len(taxa))
    sorted_taxa = sorted(taxa)
    try:
        response = _post_taxonomic_lineage(url, sorted_taxa)
        if response.status_code == codes.request_entity_too_large:
            logger.warning(
                "Unpruned %s lineage exceeds size threshold; retrying with prune=true", file_base
            )
            response = _post_taxonomic_lineage(url, sorted_taxa, prune=True)
        response.raise_for_status()
        _write_text(destination, response.text)
    except requests.RequestException as exc:
        msg = f"Failed to fetch host taxonomy from {url}: {exc}"
        raise RuntimeError(msg) from exc


def _download_lineage_file(url: str, destination: Path) -> None:
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    _write_text(destination, response.text)


def _post_taxonomic_lineage(url: str, taxa: list[str], prune: bool = False) -> requests.Response:
    params = {"prune": "true"} if prune else None
    return requests.post(url, json={"tax_ids": taxa}, params=params, timeout=60)


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
