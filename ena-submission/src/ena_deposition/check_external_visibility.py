"""
Query ENA and NCBI to check if a given accession is publicly visible
Add timestamp to project/sample/assembly table when first publicly visible
"""

# 1. Find all accessions that don't yet have a publicly visible timestamp
# 2. Query ENA and NCBI for these accessions
# 3. If publicly visible, update the timestamp in the database
# 4. Sleep

from __future__ import annotations

import logging
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from http import HTTPStatus
from typing import Any

import pytz
import requests
from psycopg2.pool import SimpleConnectionPool

from ena_deposition.config import Config
from ena_deposition.submission_db_helper import (
    AssemblyTableEntry,
    ProjectTableEntry,
    SampleTableEntry,
    Status,
    TableName,
    db_init,
    find_conditions_in_db,
    update_db_where_conditions,
)

logger = logging.getLogger(__name__)


class EntityType(Enum):
    PROJECT = "project"
    SAMPLE = "sample"
    ASSEMBLY = "assembly"


@dataclass
class ColumnCheckConfig:
    """Configuration for checking a specific table column"""

    table_name: TableName
    entry_class: type
    id_fields: list[str]
    visibility_column: str
    accession_field: str  # Field prefix in the result dict (e.g., "insdc_accession_full")
    checker_class: type  # Which visibility checker to use
    check_all_segments: bool = False  # Whether to check all keys starting with accession_field


class VisibilityChecker(ABC):
    """Abstract base class for visibility checkers"""

    @abstractmethod
    def check_visibility(self, config: Config, accession: str) -> datetime | None:
        """Check if an accession is publicly visible"""


class ENAVisibilityChecker(VisibilityChecker):
    """Checker for ENA visibility"""

    def check_visibility(self, config: Config, accession: str) -> datetime | None:
        file_type = "xml" if accession.startswith(("PRJ", "SAM", "GCA")) else "embl"
        response = requests.get(
            f"https://www.ebi.ac.uk/ena/browser/api/{file_type}/{accession}",
            timeout=config.ena_http_timeout_seconds,
        )
        if response.status_code == HTTPStatus.OK:
            return datetime.now(pytz.UTC)
        return None


class NCBIVisibilityChecker(VisibilityChecker):
    """Checker for NCBI visibility"""

    def check_visibility(self, config: Config, accession: str) -> datetime | None:
        # Implement NCBI-specific visibility check
        # This is a placeholder - adjust URL and logic as needed
        response = requests.get(
            f"https://www.ncbi.nlm.nih.gov/search/api/entrez/{accession}",
            timeout=getattr(config, "ncbi_http_timeout_seconds", 30),
        )
        if response.status_code == HTTPStatus.OK:
            return datetime.now(pytz.UTC)
        return None


# Configuration mapping: (EntityType, column_name) -> ColumnCheckConfig
COLUMN_CONFIGS = {
    (EntityType.PROJECT, "ena_first_publicly_visible"): ColumnCheckConfig(
        table_name=TableName.PROJECT_TABLE,
        entry_class=ProjectTableEntry,
        id_fields=["project_id"],
        visibility_column="ena_first_publicly_visible",
        accession_field="bioproject_accession",
        checker_class=ENAVisibilityChecker,
    ),
    (EntityType.SAMPLE, "ena_first_publicly_visible"): ColumnCheckConfig(
        table_name=TableName.SAMPLE_TABLE,
        entry_class=SampleTableEntry,
        id_fields=["accession", "version"],
        visibility_column="ena_first_publicly_visible",
        accession_field="biosample_accession",
        checker_class=ENAVisibilityChecker,
    ),
    # Assemblies - ENA nucleotide accessions
    (EntityType.ASSEMBLY, "ena_nucleotide_first_publicly_visible"): ColumnCheckConfig(
        table_name=TableName.ASSEMBLY_TABLE,
        entry_class=AssemblyTableEntry,
        id_fields=["accession", "version"],
        visibility_column="ena_nucleotide_first_publicly_visible",
        accession_field="insdc_accession_full",  # Prefix for multi-segment accessions
        checker_class=ENAVisibilityChecker,
        check_all_segments=True,  # Check all segments for multi-segmented assemblies
    ),
    # Assemblies - ENA GCA accessions
    (EntityType.ASSEMBLY, "ena_gca_first_publicly_visible"): ColumnCheckConfig(
        table_name=TableName.ASSEMBLY_TABLE,
        entry_class=AssemblyTableEntry,
        id_fields=["accession", "version"],
        visibility_column="ena_gca_first_publicly_visible",
        accession_field="gca_accession",
        checker_class=ENAVisibilityChecker,
    ),
}


def get_entities_needing_column_check(
    pool: SimpleConnectionPool, column_config: ColumnCheckConfig
) -> list[Any]:
    """Get entities that don't have a timestamp for a specific visibility column"""

    data_in_submission_table: list[dict] = find_conditions_in_db(
        pool,
        table_name=column_config.table_name,
        conditions={
            column_config.visibility_column: None,
            "status": Status.SUBMITTED,
        },
    )

    return [column_config.entry_class(**row) for row in data_in_submission_table]


def get_accessions_to_check(entity: Any, column_config: ColumnCheckConfig) -> list[str]:
    """
    Get all accessions to check for a specific entity and column config

    Returns:
        List of accession strings to check
    """
    accessions = []

    if column_config.check_all_segments:
        # Look for all keys that start with the accession_field prefix
        # e.g., "insdc_accession_full", "insdc_accession_full_seg2", "insdc_accession_full_seg3"
        for key, value in entity.result.items():
            if key.startswith(column_config.accession_field) and value:
                if isinstance(value, list):
                    accessions.extend(value)
                else:
                    accessions.append(value)
    else:
        # Single accession field
        accession_value = entity.result.get(column_config.accession_field)
        if accession_value:
            if isinstance(accession_value, list):
                accessions.extend(accession_value)
            else:
                accessions.append(accession_value)

    # Remove any None/empty values and duplicates while preserving order
    seen = set()
    clean_accessions = []
    for acc in accessions:
        if acc and acc not in seen:
            clean_accessions.append(acc)
            seen.add(acc)

    return clean_accessions


def check_and_update_visibility_for_column(
    config: Config,
    pool: SimpleConnectionPool,
    entity_type: EntityType,
    column_name: str,
):
    """Check and update visibility for a specific (entity_type, column) combination"""

    column_config = COLUMN_CONFIGS.get((entity_type, column_name))
    if not column_config:
        logger.warning(f"No configuration found for {entity_type.value}.{column_name}")
        return

    # Get the appropriate visibility checker
    visibility_checker: VisibilityChecker = column_config.checker_class()
    if not visibility_checker:
        logger.error(f"No checker found for {column_config.checker_class}")
        return

    logger.debug(f"Checking {entity_type.value}.{column_name} for visibility")
    entities_needing_check = get_entities_needing_column_check(pool, column_config)
    logger.info(
        f"Found {len(entities_needing_check)} {entity_type.value}s needing {column_name} check"
    )

    for entity in entities_needing_check:
        # get a dict for id_field column -> value
        entity_id = {field: getattr(entity, field) for field in column_config.id_fields}
        accessions = get_accessions_to_check(entity, column_config)

        if not accessions:
            logger.debug(
                f"No accessions found for {entity_type.value} {entity_id} "
                f"(looking for keys starting with '{column_config.accession_field}')"
            )
            continue

        logger.debug(
            f"Checking {column_config.checker_class} visibility for {entity_type.value} "
            f"{entity_id} accessions {accessions} -> {column_name}"
        )

        # Check all accessions - mark as visible when ALL are visible
        all_visible = True
        first_visible_timestamp = None

        for accession in accessions:
            visible_timestamp = visibility_checker.check_visibility(config, accession)

            if visible_timestamp:
                if first_visible_timestamp is None:
                    first_visible_timestamp = visible_timestamp
                logger.debug(f"Accession {accession} is publicly visible")
            else:
                all_visible = False
                logger.debug(f"Accession {accession} is still not publicly visible")

        if all_visible and first_visible_timestamp:
            logger.debug(
                f"{entity_type.value.title()} {entity_id} all accessions {accessions} are "
                "publicly visible, updating database."
            )
            updated_count = update_db_where_conditions(
                pool,
                table_name=column_config.table_name,
                conditions=entity_id,
                update_values={column_config.visibility_column: first_visible_timestamp},
            )
            if updated_count > 0:
                logger.info(
                    f"Updated {entity_type.value} {entity_id} {column_name}: "
                    f"{first_visible_timestamp} (all {len(accessions)} accessions visible)"
                )
            else:
                logger.warning(
                    f"Failed to update {column_name} for {entity_type.value} {entity_id}"
                )
        else:
            visible_count = sum(
                1 for acc in accessions if visibility_checker.check_visibility(config, acc)
            )
            logger.debug(
                f"{entity_type.value.title()} {entity_id}: {visible_count}/{len(accessions)} "
                "accessions are publicly visible (waiting for all)"
            )


def check_and_update_visibility_all_columns(config: Config, pool: SimpleConnectionPool):
    """Check and update visibility for all configured (entity_type, column) combinations"""

    for (entity_type, column_name), _config in COLUMN_CONFIGS.items():
        try:
            check_and_update_visibility_for_column(config, pool, entity_type, column_name)
        except Exception as e:
            logger.error(f"Error checking {entity_type.value}.{column_name}: {e}", exc_info=True)


def check_and_update_visibility(config: Config, stop_event: threading.Event):
    """Main loop function"""
    pool = db_init(config.db_password, config.db_username, config.db_url)

    while True:
        if stop_event.is_set():
            print("check_and_update_visibility stopped due to exception in another task")
            return

        check_and_update_visibility_all_columns(config, pool)
        logger.debug("check_and_update_visibility finished, sleeping for a while")
        time.sleep(config.time_between_iterations)
