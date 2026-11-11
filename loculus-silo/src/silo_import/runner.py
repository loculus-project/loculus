from __future__ import annotations

import logging
import shutil
import time
from http.client import NOT_MODIFIED

from .config import ImporterConfig, MetadataField
from .constants import MAX_KNOWN_HASHES, SPECIAL_ETAG_NONE
from .download_manager import DownloadManager, DownloadResult
from .errors import (
    DecompressionFailedError,
    HashUnchangedError,
    NotModifiedError,
    RecordCountMismatchError,
)
from .filesystem import prune_timestamped_directories, safe_remove
from .instruct_silo import SiloRunner
from .lineage import update_hierarchical_filters, update_lineage_definitions
from .paths import ImporterPaths

logger = logging.getLogger(__name__)


class ImporterRunner:
    def __init__(self, config: ImporterConfig, paths: ImporterPaths) -> None:
        self.config = config
        self.paths = paths
        self.paths.ensure_directories()
        self._clear_download_directories()
        self.silo = SiloRunner(paths.silo_binary, paths.preprocessing_config)
        self.download_manager = DownloadManager()
        self.current_etag = SPECIAL_ETAG_NONE
        self.last_hard_refresh: float = 0
        self.hierarchical_filter_values: dict[MetadataField, set[str]] = {}
        self.record_hashes: dict[str, str] | None = None

    def _clear_download_directories(self) -> None:
        """Clear all timestamped download directories on startup."""
        if not self.paths.input_dir.exists():
            return
        for item in self.paths.input_dir.iterdir():
            if item.is_dir() and item.name.isdigit():
                logger.info("Clearing download directory on startup: %s", item)
                safe_remove(item)

    def _download(self, last_etag: str, hard_refresh: bool) -> DownloadResult:
        manager = self.download_manager
        if not self.config.incremental:
            return manager.download_release(self.config, self.paths, last_etag)
        if manager.changes_status(self.config, last_etag) == NOT_MODIFIED:
            raise NotModifiedError
        stored = None if hard_refresh else self.record_hashes
        known = stored if stored and len(stored) <= MAX_KNOWN_HASHES else {}
        download = manager.download_release(self.config, self.paths, last_etag, known)
        merged = known | download.analysis.hashes
        if merged == stored and len(merged) == download.total_records:
            safe_remove(download.directory)
            raise HashUnchangedError(new_etag=download.etag)
        if not download.complete and (
            len(merged) != download.total_records
            or not all(
                values <= self.hierarchical_filter_values.get(name, set())
                for name, values in download.analysis.hierarchical_filter_values.items()
            )
        ):
            logger.info("Changes cannot be applied incrementally; requesting all released data")
            safe_remove(download.directory)
            download = manager.download_release(self.config, self.paths, last_etag, {})
        return download

    def _apply_changes(self, download: DownloadResult) -> None:
        logger.info("Applying %s changed records", download.analysis.record_count)
        stored_hashes, self.record_hashes = self.record_hashes or {}, None
        try:
            self.silo.run_preprocessing(
                self.config.silo_run_timeout,
                changes=download.transformed_path,
                total_records=download.total_records,
            )
        finally:
            safe_remove(download.directory)
        self.record_hashes = stored_hashes | download.analysis.hashes
        self.current_etag = download.etag

    def run_once(self) -> None:
        prune_timestamped_directories(self.paths.output_dir)

        # Determine if hard refresh needed
        hard_refresh = time.time() - self.last_hard_refresh >= self.config.hard_refresh_interval

        if hard_refresh:
            logger.info(
                f"Hard refresh triggered: "
                f"time_since_last={time.time() - self.last_hard_refresh:.1f}s, "
                f"interval={self.config.hard_refresh_interval}s,"
                f"last_refresh_time={self.last_hard_refresh}"
            )
        else:
            logger.info(
                f"Soft refresh: time_since_last={time.time() - self.last_hard_refresh:.1f}s, "
                f"using etag={self.current_etag}"
            )

        # Use special ETag for hard refresh to force re-download
        last_etag = SPECIAL_ETAG_NONE if hard_refresh else self.current_etag

        try:
            download = self._download(last_etag, hard_refresh)
        except (NotModifiedError, HashUnchangedError) as skip:
            logger.info("Skipping run: %s", skip)
            if skip.new_etag is not None:
                self.current_etag = skip.new_etag
            if hard_refresh:
                self.last_hard_refresh = time.time()
            return
        except (DecompressionFailedError, RecordCountMismatchError) as skip:
            logger.warning("Skipping run: %s", skip)
            if skip.new_etag is not None:
                self.current_etag = skip.new_etag
            return

        if not download.complete:
            self._apply_changes(download)
            return

        self.record_hashes = None
        try:
            update_lineage_definitions(download.analysis.pipeline_version, self.config, self.paths)
            update_hierarchical_filters(
                download.analysis.hierarchical_filter_values,
                self.hierarchical_filter_values,
                self.config,
                self.paths,
            )
            self.hierarchical_filter_values = download.analysis.hierarchical_filter_values
        except Exception:
            logger.exception("Failed to download lineage definitions; cleaning up input")
            safe_remove(self.paths.silo_input_data_path)
            safe_remove(download.directory)
            raise

        # Prepare input for SILO
        safe_remove(self.paths.silo_input_data_path)
        shutil.copyfile(download.transformed_path, self.paths.silo_input_data_path)

        try:
            self.silo.run_preprocessing(self.config.silo_run_timeout)
        except Exception:
            logger.exception("SILO preprocessing failed; cleaning up input")
            safe_remove(self.paths.silo_input_data_path)
            safe_remove(download.directory)
            raise

        # Mark success and update state
        self.current_etag = download.etag
        self.record_hashes = download.analysis.hashes

        if hard_refresh:
            self.last_hard_refresh = time.time()

        logger.info("Run complete; waiting %s seconds", self.config.poll_interval)


def run_forever(config: ImporterConfig, paths: ImporterPaths) -> None:
    """Run the importer in an infinite loop."""
    runner = ImporterRunner(config, paths)
    while True:
        try:
            runner.run_once()
        except Exception:
            logger.exception("SILO import cycle failed")
        time.sleep(config.poll_interval)
