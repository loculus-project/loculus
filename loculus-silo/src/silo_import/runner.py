from __future__ import annotations

import logging
import shutil
import time

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

    def _clear_download_directories(self) -> None:
        """Clear all timestamped download directories on startup."""
        if not self.paths.input_dir.exists():
            return
        for item in self.paths.input_dir.iterdir():
            if item.is_dir() and item.name.isdigit():
                logger.info("Clearing download directory on startup: %s", item)
                safe_remove(item)

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
            if skip.new_etag is not None:
                self.current_etag = skip.new_etag
            return

        try:
            update_lineage_definitions(download.pipeline_versions, self.config, self.paths)
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
