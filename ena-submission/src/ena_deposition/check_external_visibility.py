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
from dataclasses import asdict, dataclass
from datetime import datetime
from enum import Enum
from http import HTTPStatus

import pytz
import requests
from sqlalchemy import Engine
from tenacity import Retrying, retry_if_exception_type, stop_after_attempt, wait_fixed

from ena_deposition.config import Config
from ena_deposition.ena_submission_helper import log_before_retry
from ena_deposition.submission_db_helper import (
    AssemblyTableEntry,
    ProjectTableEntry,
    SampleTableEntry,
    Status,
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

    entry_class: type[ProjectTableEntry | SampleTableEntry | AssemblyTableEntry]
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


class TransientNCBIError(Exception):
    """Raised for a retryable (rate-limited/server) error from NCBI's E-utilities."""


class NCBIVisibilityChecker(VisibilityChecker):
    """Checker for NCBI visibility"""

    # Accession prefix -> E-utilities database name. Anything else is a nucleotide accession.
    _DB_BY_PREFIX = (("PRJ", "bioproject"), ("SAM", "biosample"))

    # A live nuccore record has no status field, statuses like
    # "suppressed", "withdrawn", "removed", "replaced"... count as not visible.
    _LIVE_NUCCORE_STATUSES = frozenset({""})

    def check_visibility(self, config: Config, accession: str) -> datetime | None:
        """
        Check the visibility of an accession in the NCBI database.
        esearch resolves the accession to internal UID(s); an empty result means the
        accession is not (yet) in NCBI. For nuccore we query esummary to
        make sure the record has not been suppressed/withdrawn after being assigned a UID.
        """
        db = next(
            (db for prefix, db in self._DB_BY_PREFIX if accession.startswith(prefix)),
            "nuccore",
        )
        if db != "nuccore":
            esearch = self._eutils_get_json(
                config,
                "esearch.fcgi",
                {"db": db, "term": accession, "retmode": "json"},
                accession,
                "esearch",
            )
            if esearch is None:
                return None
            uids = esearch.get("esearchresult", {}).get("idlist", [])
            if not uids:
                return None
            return datetime.now(pytz.UTC)

        summary = self._eutils_get_json(
            config,
            "esummary.fcgi",
            {"db": db, "id": accession, "retmode": "json"},
            accession,
            "esummary",
        )
        if summary is None:
            return None
        result = summary.get("result", {})
        live = any(
            uid in result
            and not result[uid].get("error")
            and result[uid].get("status", "") in self._LIVE_NUCCORE_STATUSES
            for uid in result.get("uids", [])
        )
        return datetime.now(pytz.UTC) if live else None

    def _eutils_get_json(
        self,
        config: Config,
        endpoint: str,
        params: dict[str, str],
        accession: str,
        label: str,
    ) -> dict | None:
        """GET an E-utilities endpoint and return the parsed JSON body, or None on a
        non-OK / non-JSON response. E-utilities rate-limits unauthenticated requests to
        3/second per IP, so retry on timeouts and transient (429/5xx) errors."""

        def _do_get() -> requests.Response:
            response = requests.get(
                f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/{endpoint}",
                params=params,
                timeout=config.ncbi_public_search_timeout_seconds,
            )
            is_transient = response.status_code == HTTPStatus.TOO_MANY_REQUESTS or (
                response.status_code >= HTTPStatus.INTERNAL_SERVER_ERROR
            )
            if is_transient:
                logger.info(
                    f"NCBI {label} request failed for {accession}: "
                    f"HTTP {response.status_code} - {response.text}"
                )
                msg = f"Transient NCBI {label} error {response.status_code} for {accession}"
                raise TransientNCBIError(msg)
            return response

        retryer = Retrying(
            stop=stop_after_attempt(config.ena_http_get_retry_attempts),
            wait=wait_fixed(2),
            retry=retry_if_exception_type((requests.exceptions.Timeout, TransientNCBIError)),
            reraise=True,
            before_sleep=log_before_retry,
        )
        response = retryer(_do_get)
        if response.status_code != HTTPStatus.OK:
            logger.info(
                f"NCBI {label} request failed for {accession}: "
                f"HTTP {response.status_code} - {response.text}"
            )
            return None
        try:
            return response.json()
        except ValueError:
            logger.info(
                f"NCBI {label} returned a non-JSON response for {accession}: {response.text[:500]}"
            )
            return None


# Configuration mapping: (EntityType, column_name) -> ColumnCheckConfig
COLUMN_CONFIGS = {
    (EntityType.PROJECT, "ena_first_publicly_visible"): ColumnCheckConfig(
        entry_class=ProjectTableEntry,
        visibility_column="ena_first_publicly_visible",
        accession_field_name_prefix="bioproject_accession",
        checker_class=ENAVisibilityChecker,
    ),
    (EntityType.PROJECT, "ncbi_first_publicly_visible"): ColumnCheckConfig(
        entry_class=ProjectTableEntry,
        visibility_column="ncbi_first_publicly_visible",
        accession_field_name_prefix="bioproject_accession",
        checker_class=NCBIVisibilityChecker,
    ),
    (EntityType.SAMPLE, "ena_first_publicly_visible"): ColumnCheckConfig(
        entry_class=SampleTableEntry,
        visibility_column="ena_first_publicly_visible",
        accession_field_name_prefix="biosample_accession",
        checker_class=ENAVisibilityChecker,
    ),
    (EntityType.SAMPLE, "ncbi_first_publicly_visible"): ColumnCheckConfig(
        entry_class=SampleTableEntry,
        visibility_column="ncbi_first_publicly_visible",
        accession_field_name_prefix="biosample_accession",
        checker_class=NCBIVisibilityChecker,
    ),
    # Assemblies - ENA nucleotide accessions
    (EntityType.ASSEMBLY, "ena_nucleotide_first_publicly_visible"): ColumnCheckConfig(
        entry_class=AssemblyTableEntry,
        visibility_column="ena_nucleotide_first_publicly_visible",
        accession_field_name_prefix="insdc_accession_full",  # Prefix for multi-segment accessions
        checker_class=ENAVisibilityChecker,
    ),
    (EntityType.ASSEMBLY, "ncbi_nucleotide_first_publicly_visible"): ColumnCheckConfig(
        entry_class=AssemblyTableEntry,
        visibility_column="ncbi_nucleotide_first_publicly_visible",
        accession_field_name_prefix="insdc_accession_full",  # Prefix for multi-segment accessions
        checker_class=NCBIVisibilityChecker,
    ),
    # Assemblies - ENA GCA accessions
    (EntityType.ASSEMBLY, "ena_gca_first_publicly_visible"): ColumnCheckConfig(
        entry_class=AssemblyTableEntry,
        visibility_column="ena_gca_first_publicly_visible",
        accession_field_name_prefix="gca_accession",
        checker_class=ENAVisibilityChecker,
    ),
}


def get_entities_needing_column_check(
    db_engine: Engine, column_config: ColumnCheckConfig
) -> list[SampleTableEntry | ProjectTableEntry | AssemblyTableEntry]:
    """Get entities that don't have a timestamp for a specific visibility column"""
    return find_conditions_in_db(
        db_engine,
        column_config.entry_class,
        conditions={
            column_config.visibility_column: None,
            "status": Status.SUBMITTED,
        },
    )


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
    db_engine: Engine,
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

    logger.debug(f"Checking {entity_type.value}.{column_name} for visibility")
    entities_needing_check = get_entities_needing_column_check(db_engine, column_config)
    logger.info(
        f"Found {len(entities_needing_check)} {entity_type.value}s needing {column_name} check"
    )

    for entity in entities_needing_check:
        entity_id = asdict(entity.pkey)
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
        visible_count = 0

        for accession in accessions:
            visible_timestamp = visibility_checker.check_visibility(config, accession)

            if visible_timestamp:
                visible_count += 1
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
                db_engine,
                model_class=column_config.entry_class,
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
            logger.debug(
                f"{entity_type.value.title()} {entity_id}: {visible_count}/{len(accessions)} "
                "accessions are publicly visible (waiting for all)"
            )


def check_and_update_visibility_all_columns(config: Config, db_engine: Engine):
    """Check and update visibility for all configured (entity_type, column) combinations"""

    for entity_type, column_name in COLUMN_CONFIGS:
        try:
            check_and_update_visibility_for_column(config, db_engine, entity_type, column_name)
        except Exception as e:
            logger.error(f"Error checking {entity_type.value}.{column_name}: {e}", exc_info=True)


def check_and_update_visibility(config: Config, stop_event: threading.Event):
    """Main loop function"""
    db_engine = db_init(config.db_password, config.db_username, config.db_url)

    while True:
        start_time = time.time()
        if stop_event.is_set():
            logger.info("check_and_update_visibility stopped due to exception in another task")
            return

        check_and_update_visibility_all_columns(config, db_engine)
        logger.debug("check_and_update_visibility finished, sleeping for a while")

        elapsed_time = time.time() - start_time
        if elapsed_time < 60 * config.min_between_publicness_checks:
            wait_time = 60 * config.min_between_publicness_checks - elapsed_time
            logger.debug(f"Waiting {wait_time:.2f} seconds before next iteration")
            if stop_event.wait(timeout=wait_time):
                logger.info("check_and_update_visibility stopped due to exception in another task")
                return
