"""
Query ENA and NCBI to check if a given accession is publicly visible
Add timestamp to project/sample/assembly table when first publicly visible
1. Find all accessions that don't yet have a publicly visible timestamp
2. Query ENA and NCBI for these accessions
3. If publicly visible, update the timestamp in the database
4. Repeat periodically
"""

import logging
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from http import HTTPStatus

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
    entry_class: type[ProjectTableEntry | SampleTableEntry | AssemblyTableEntry]
    id_fields: list[str]
    visibility_column: str
    accession_field_name_prefix: str  # Field prefix in result dict (e.g. "insdc_accession_full")
    checker_class: type  # Which visibility checker to use


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
            allow_redirects=False,
            timeout=config.ena_public_search_timeout_seconds,
        )
        if response.status_code == HTTPStatus.OK:
            return datetime.now(pytz.UTC)
        return None


GcaCacheKey = tuple[str] | tuple[str, str] | tuple[str, str, str]

gca_cache: dict[GcaCacheKey, bool] = {}


def _check_and_cache_ncbi_gca(config: Config, path_segments: GcaCacheKey) -> bool:
    """
    Helper function to check NCBI for a GCA accession part and cache the result.
    Returns True if found and caches True, False if not found and caches False.
    """
    cache_key = path_segments

    if cache_key in gca_cache:
        return gca_cache[cache_key]

    url_path = "/".join(path_segments)
    response = requests.get(
        f"https://ftp.ncbi.nlm.nih.gov/genomes/all/GCA/{url_path}/",
        allow_redirects=False,
        timeout=config.ncbi_public_search_timeout_seconds,
    )

    if response.status_code == HTTPStatus.OK:
        gca_cache[cache_key] = True
        return True
    gca_cache[cache_key] = False
    return False


def check_gca_cached(config: "Config", accession: str) -> datetime | None:
    """
    Checks if a GCA accession exists on NCBI by querying NCBI's API, with caching.
    It attempts to validate parts of the accession from longest to shortest.
    """
    _prefix, numbers = accession.split("_")
    first_three = numbers[:3]
    second_three = numbers[3:6]
    third_three = numbers[6:9]

    if not _check_and_cache_ncbi_gca(config, (first_three,)):
        return None

    if not _check_and_cache_ncbi_gca(config, (first_three, second_three)):
        return None

    if not _check_and_cache_ncbi_gca(config, (first_three, second_three, third_three)):
        return None

    return datetime.now(pytz.UTC)


class NCBIVisibilityChecker(VisibilityChecker):
    """Checker for NCBI visibility"""

    def check_visibility(self, config: Config, accession: str) -> datetime | None:
        if accession.startswith("GCA"):
            return check_gca_cached(config, accession)

        if accession.startswith("PRJ"):
            path = "bioproject"
        elif accession.startswith("SAM"):
            path = "biosample"
        else:
            path = "nuccore"
        response = requests.get(
            f"https://www.ncbi.nlm.nih.gov/{path}/{accession}/",
            allow_redirects=False,
            timeout=config.ncbi_public_search_timeout_seconds,
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
        accession_field_name_prefix="bioproject_accession",
        checker_class=ENAVisibilityChecker,
    ),
    (EntityType.PROJECT, "ncbi_first_publicly_visible"): ColumnCheckConfig(
        table_name=TableName.PROJECT_TABLE,
        entry_class=ProjectTableEntry,
        id_fields=["project_id"],
        visibility_column="ncbi_first_publicly_visible",
        accession_field_name_prefix="bioproject_accession",
        checker_class=NCBIVisibilityChecker,
    ),
    (EntityType.SAMPLE, "ena_first_publicly_visible"): ColumnCheckConfig(
        table_name=TableName.SAMPLE_TABLE,
        entry_class=SampleTableEntry,
        id_fields=["accession", "version"],
        visibility_column="ena_first_publicly_visible",
        accession_field_name_prefix="biosample_accession",
        checker_class=ENAVisibilityChecker,
    ),
    (EntityType.SAMPLE, "ncbi_first_publicly_visible"): ColumnCheckConfig(
        table_name=TableName.SAMPLE_TABLE,
        entry_class=SampleTableEntry,
        id_fields=["accession", "version"],
        visibility_column="ncbi_first_publicly_visible",
        accession_field_name_prefix="biosample_accession",
        checker_class=NCBIVisibilityChecker,
    ),
    # Assemblies - ENA nucleotide accessions
    (EntityType.ASSEMBLY, "ena_nucleotide_first_publicly_visible"): ColumnCheckConfig(
        table_name=TableName.ASSEMBLY_TABLE,
        entry_class=AssemblyTableEntry,
        id_fields=["accession", "version"],
        visibility_column="ena_nucleotide_first_publicly_visible",
        accession_field_name_prefix="insdc_accession_full",  # Prefix for multi-segment accessions
        checker_class=ENAVisibilityChecker,
    ),
    (EntityType.ASSEMBLY, "ncbi_nucleotide_first_publicly_visible"): ColumnCheckConfig(
        table_name=TableName.ASSEMBLY_TABLE,
        entry_class=AssemblyTableEntry,
        id_fields=["accession", "version"],
        visibility_column="ncbi_nucleotide_first_publicly_visible",
        accession_field_name_prefix="insdc_accession_full",  # Prefix for multi-segment accessions
        checker_class=NCBIVisibilityChecker,
    ),
    # Assemblies - ENA GCA accessions
    (EntityType.ASSEMBLY, "ena_gca_first_publicly_visible"): ColumnCheckConfig(
        table_name=TableName.ASSEMBLY_TABLE,
        entry_class=AssemblyTableEntry,
        id_fields=["accession", "version"],
        visibility_column="ena_gca_first_publicly_visible",
        accession_field_name_prefix="gca_accession",
        checker_class=ENAVisibilityChecker,
    ),
    (EntityType.ASSEMBLY, "ncbi_gca_first_publicly_visible"): ColumnCheckConfig(
        table_name=TableName.ASSEMBLY_TABLE,
        entry_class=AssemblyTableEntry,
        id_fields=["accession", "version"],
        visibility_column="ncbi_gca_first_publicly_visible",
        accession_field_name_prefix="gca_accession",
        checker_class=NCBIVisibilityChecker,
    ),
}


def get_entities_needing_column_check(
    pool: SimpleConnectionPool, column_config: ColumnCheckConfig
) -> list[SampleTableEntry | ProjectTableEntry | AssemblyTableEntry]:
    """Get entities (db rows for Project/Sample/Assembly) that don't have a timestamp
    for a specific visibility column"""

    data_in_submission_table: list[dict] = find_conditions_in_db(
        pool,
        table_name=column_config.table_name,
        conditions={
            column_config.visibility_column: None,
            "status": Status.SUBMITTED,
        },
    )

    return [column_config.entry_class(**row) for row in data_in_submission_table]


def get_accessions_to_check(
    entity: SampleTableEntry | ProjectTableEntry | AssemblyTableEntry,
    column_config: ColumnCheckConfig,
) -> set[str]:
    """
    Get all accessions to check for a specific entity and column config

    Returns:
        Set of accessions to check
    """
    accessions = set()

    if not isinstance(entity.result, dict):
        msg = (
            f"Expected dict for {column_config.entry_class.__name__} result, "
            f"got {type(entity.result)}"
        )
        raise TypeError(msg)

    for key, value in entity.result.items():
        if key.startswith(column_config.accession_field_name_prefix) and value:
            accessions.add(value)

    return accessions


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
                f"(looking for keys starting with '{column_config.accession_field_name_prefix}')"
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

    for entity_type, column_name in COLUMN_CONFIGS:
        try:
            check_and_update_visibility_for_column(config, pool, entity_type, column_name)
        except Exception as e:
            logger.error(f"Error checking {entity_type.value}.{column_name}: {e}", exc_info=True)


def check_and_update_visibility(config: Config, stop_event: threading.Event):
    """Main loop function"""
    pool = db_init(config.db_password, config.db_username, config.db_url)

    while True:
        start_time = time.time()
        if stop_event.is_set():
            logger.info("check_and_update_visibility stopped due to exception in another task")
            return

        check_and_update_visibility_all_columns(config, pool)
        logger.debug("check_and_update_visibility finished, sleeping for a while")

        gca_cache.clear()

        elapsed_time = time.time() - start_time
        if elapsed_time < 60 * config.min_between_publicness_checks:
            wait_time = 60 * config.min_between_publicness_checks - elapsed_time
            logger.debug(f"Waiting {wait_time:.2f} seconds before next iteration")
            time.sleep(wait_time)
