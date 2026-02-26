from __future__ import annotations

import logging
import shutil
import time
from datetime import UTC, datetime

from .config import ImporterConfig
from .constants import SPECIAL_ETAG_NONE
from .download_manager import DownloadManager
from .errors import (
    DecompressionFailedError,
    HashUnchangedError,
    NotModifiedError,
    RecordCountMismatchError,
)
from .filesystem import prune_timestamped_directories, safe_remove
from .instruct_silo import SiloRunner
from .lineage import update_lineage_definitions
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
        self.last_successful_import_time: str | None = None
        self.has_existing_silo_db: bool = False

    def _clear_download_directories(self) -> None:
        """Clear all timestamped download directories on startup."""
        if not self.paths.input_dir.exists():
            return
        for item in self.paths.input_dir.iterdir():
            if item.is_dir() and item.name.isdigit():
                logger.info("Clearing download directory on startup: %s", item)
                safe_remove(item)

    def _needs_full_preprocessing(self) -> bool:
        """Determine if a full preprocessing run is needed."""
        if not self.has_existing_silo_db:
            return True
        if self.last_successful_import_time is None:
            return True
        return time.time() - self.last_hard_refresh >= self.config.hard_refresh_interval

    def _current_timestamp_iso(self) -> str:
        """Return the current UTC time as an ISO-8601 string."""
        return datetime.now(tz=UTC).strftime("%Y-%m-%dT%H:%M:%S")

    def run_once(self) -> None:
        prune_timestamped_directories(self.paths.output_dir)

        if self._needs_full_preprocessing():
            self._run_full_preprocessing()
        else:
            try:
                self._run_incremental_append()
            except Exception:
                logger.warning(
                    "Incremental append failed; falling back to full preprocessing",
                    exc_info=True,
                )
                self._run_full_preprocessing()

    def _run_full_preprocessing(self) -> None:
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
                f"Full preprocessing: time_since_last={time.time() - self.last_hard_refresh:.1f}s, "
                f"using etag={self.current_etag}"
            )

        # Use special ETag for hard refresh to force re-download
        last_etag = SPECIAL_ETAG_NONE if hard_refresh else self.current_etag

        try:
            download = self.download_manager.download_release(self.config, self.paths, last_etag)
        except (NotModifiedError, HashUnchangedError) as skip:
            logger.info("Skipping run: %s", skip)
            if skip.new_etag is not None:
                self.current_etag = skip.new_etag
            if hard_refresh:
                self.last_hard_refresh = time.time()
            return
        except (DecompressionFailedError, RecordCountMismatchError) as skip:
            logger.warning("Skipping run: %s", skip)
            return

        try:
            update_lineage_definitions(download.pipeline_version, self.config, self.paths)
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
        self.has_existing_silo_db = True
        self.last_successful_import_time = self._current_timestamp_iso()

        if hard_refresh:
            self.last_hard_refresh = time.time()

        logger.info("Full preprocessing complete; waiting %s seconds", self.config.poll_interval)

    def _run_incremental_append(self) -> None:
        logger.info(
            f"Incremental append: fetching data released since {self.last_successful_import_time}"
        )

        last_etag = self.current_etag

        try:
            download = self.download_manager.download_release(
                self.config,
                self.paths,
                last_etag,
                released_since=self.last_successful_import_time,
            )
        except (NotModifiedError, HashUnchangedError) as skip:
            logger.info("Skipping incremental append: %s", skip)
            if skip.new_etag is not None:
                self.current_etag = skip.new_etag
            return
        except (DecompressionFailedError, RecordCountMismatchError) as skip:
            logger.warning("Skipping incremental append: %s", skip)
            return

        if download.record_count == 0:
            logger.info("No new records to append; skipping")
            safe_remove(download.directory)
            self.current_etag = download.etag
            return

        try:
            self.silo.run_append(
                download.transformed_path,
                self.paths.output_dir,
                self.config.silo_run_timeout,
            )
        except Exception:
            logger.exception("SILO append failed; cleaning up")
            safe_remove(download.directory)
            raise

        # Mark success and update state
        self.current_etag = download.etag
        self.last_successful_import_time = self._current_timestamp_iso()

        logger.info(
            "Incremental append complete (%d records); waiting %s seconds",
            download.record_count,
            self.config.poll_interval,
        )


def run_forever(config: ImporterConfig, paths: ImporterPaths) -> None:
    """Run the importer in an infinite loop."""
    runner = ImporterRunner(config, paths)
    while True:
        try:
            runner.run_once()
        except Exception:
            logger.exception("SILO import cycle failed")
        time.sleep(config.poll_interval)
