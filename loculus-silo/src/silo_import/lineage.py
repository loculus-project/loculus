from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

import requests
import yaml

from .config import ImporterConfig
from .paths import ImporterPaths

logger = logging.getLogger(__name__)


def read_lineage_field_mapping(database_config_path: Path) -> dict[str, list[str]]:
    """Return a mapping of ``lineage system name -> metadata field names``.

    Parses the SILO database config (``database_config.yaml``) and inspects
    each metadata entry for the ``generateLineageIndex`` attribute. Multiple
    metadata fields may reference the same lineage system (for example one
    per segment in segmented organisms), so the value is a list of field
    names.

    Returns an empty mapping if the file does not exist or is malformed.
    """
    if not database_config_path.exists():
        logger.info(
            "Database config not found at %s; lineage subsetting disabled",
            database_config_path,
        )
        return {}

    try:
        with database_config_path.open("r", encoding="utf-8") as handle:
            config = yaml.safe_load(handle) or {}
    except (OSError, yaml.YAMLError) as exc:
        logger.warning("Could not read database config %s: %s", database_config_path, exc)
        return {}

    mapping: dict[str, list[str]] = {}
    metadata_entries = (config.get("schema") or {}).get("metadata") or []
    if not isinstance(metadata_entries, list):
        return {}

    for entry in metadata_entries:
        if not isinstance(entry, Mapping):
            continue
        lineage_system = entry.get("generateLineageIndex")
        field_name = entry.get("name")
        if not lineage_system or not field_name:
            continue
        mapping.setdefault(str(lineage_system), []).append(str(field_name))

    return mapping


def update_lineage_definitions(
    pipeline_version: int | None,
    config: ImporterConfig,
    paths: ImporterPaths,
    lineage_values_per_system: Mapping[str, set[str]] | None = None,
) -> None:
    """Download lineage definition files and subset them to the values used in the data.

    For each configured lineage system, the upstream YAML file is downloaded
    and then reduced to the entries actually needed: only lineages whose
    canonical name (or one of their aliases) appears in the data are kept,
    along with the transitive closure of their parents. This keeps the file
    SILO has to load small while preserving the hierarchy required for
    sublineage queries.

    ``lineage_values_per_system`` is the mapping returned by the data-scan
    step: for every lineage system whose metadata field was tracked, it
    contains the (possibly empty) set of values observed in the records.
    Lineage systems that are absent from the mapping fall back to writing
    the upstream file unchanged - this happens when no metadata field
    references them, e.g. when the database config could not be read.
    """
    if not config.lineage_definitions:
        logger.info("LINEAGE_DEFINITIONS not provided; skipping lineage configuration")
        return

    if not pipeline_version:
        # required for dummy organisms
        logger.info("No pipeline version found; writing empty lineage definitions")
        for lineage in config.lineage_definitions:
            _write_text(paths.input_dir / f"{lineage}.yaml", "{}\n")
        return

    values_by_system = lineage_values_per_system or {}

    for lineage, item in config.lineage_definitions.items():
        lineage_url: str | None = item.get(int(pipeline_version))
        if not lineage_url:
            msg = (
                f"No lineage definition URL configured for pipeline version {pipeline_version} "
                f"and lineage system '{lineage}'"
            )
            raise RuntimeError(msg)

        logger.info(
            "Downloading lineage definitions for system '%s' (pipeline version %s)",
            lineage,
            pipeline_version,
        )
        try:
            content = _download_lineage_text(lineage_url)
        except requests.RequestException as exc:
            msg = f"Failed to download lineage definitions: {exc}"
            raise RuntimeError(msg) from exc

        destination = paths.input_dir / f"{lineage}.yaml"

        if lineage in values_by_system:
            used_values = values_by_system[lineage]
            try:
                content, kept, total = subset_lineage_yaml(content, used_values)
            except yaml.YAMLError as exc:
                logger.warning(
                    "Could not parse lineage YAML for '%s'; writing it unchanged: %s",
                    lineage,
                    exc,
                )
            else:
                logger.info(
                    "Subsetted lineage system '%s' from %s to %s entries (%s observed values)",
                    lineage,
                    total,
                    kept,
                    len(used_values),
                )
        else:
            logger.info(
                "No metadata field uses lineage system '%s'; writing full file",
                lineage,
            )

        _write_text(destination, content)


def subset_lineage_yaml(content: str, used_values: Iterable[str]) -> tuple[str, int, int]:
    """Return YAML containing only the lineages actually needed for ``used_values``.

    The lineage YAML maps a canonical lineage name to a mapping with
    ``aliases`` (alternative names) and ``parents`` (canonical parent names).
    Data records may contain either canonical names or aliases. The result
    keeps every entry whose canonical name is required, plus the transitive
    closure of its parents, so that SILO can still resolve sublineage
    relationships correctly.

    Returns ``(yaml_text, kept_count, total_count)``. If the parsed YAML is
    not a mapping or is empty, the original content is returned unchanged.
    """
    parsed: Any = yaml.safe_load(content)
    if not isinstance(parsed, Mapping) or not parsed:
        return content, 0, 0

    full: dict[str, Mapping[str, Any]] = {
        str(name): (entry if isinstance(entry, Mapping) else {})
        for name, entry in parsed.items()
    }
    total = len(full)

    alias_to_canonical: dict[str, str] = {}
    for canonical, entry in full.items():
        alias_to_canonical.setdefault(canonical, canonical)
        for alias in _string_list(entry.get("aliases")):
            # Don't let an alias override an existing canonical name.
            alias_to_canonical.setdefault(alias, canonical)

    needed: set[str] = set()
    queue: list[str] = []
    for value in used_values:
        if value is None:
            continue
        canonical = alias_to_canonical.get(str(value))
        if canonical is None:
            logger.debug("Lineage value %r not found in definition file; skipping", value)
            continue
        if canonical not in needed:
            needed.add(canonical)
            queue.append(canonical)

    while queue:
        current = queue.pop()
        entry = full.get(current, {})
        for parent in _string_list(entry.get("parents")):
            parent_canonical = alias_to_canonical.get(parent, parent)
            if parent_canonical in full and parent_canonical not in needed:
                needed.add(parent_canonical)
                queue.append(parent_canonical)

    subset = {name: entry for name, entry in parsed.items() if str(name) in needed}
    if not subset:
        return "{}\n", 0, total

    # ``sort_keys=False`` preserves the order of the upstream file.
    return yaml.safe_dump(subset, sort_keys=False), len(subset), total


def _string_list(value: Any) -> list[str]:
    if not value:
        return []
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item is not None]


def _download_lineage_text(url: str) -> str:
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return response.text


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
