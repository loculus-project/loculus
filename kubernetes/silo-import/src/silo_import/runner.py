from __future__ import annotations

import logging
import shutil
import time

from .config import ImporterConfig
from .constants import SPECIAL_ETAG_NONE
from .download_manager import DownloadManager
from .errors import DecompressionFailed, HashUnchanged, NotModified, RecordCountMismatch
from .filesystem import prune_timestamped_directories, safe_remove
from .lineage import update_lineage_definitions
from .paths import ImporterPaths
from .sentinels import SentinelManager
from .state import (
    load_current_etag,
    load_last_hard_refresh,
    save_etag,
    save_hard_refresh,
    should_hard_refresh,
)

logger = logging.getLogger(__name__)


class ImporterRunner:
    def __init__(self, config: ImporterConfig, paths: ImporterPaths) -> None:
        self.config = config
        self.paths = paths
        self.paths.ensure_directories()
        self.sentinels = SentinelManager(paths.run_sentinel, paths.done_sentinel)
        self.download_manager = DownloadManager()

    def run_once(self) -> None:
        prune_timestamped_directories(self.paths.output_dir)

        # Load state and determine if hard refresh needed
        current_etag = load_current_etag(self.paths.current_etag_file)
        last_refresh = load_last_hard_refresh(self.paths.last_hard_refresh_file)
        hard_refresh = should_hard_refresh(last_refresh, self.config.hard_refresh_interval)

        # Use special ETag for hard refresh to force re-download
        last_etag = SPECIAL_ETAG_NONE if hard_refresh else current_etag

        try:
            download = self.download_manager.download_release(self.config, self.paths, last_etag)
        except (NotModified, HashUnchanged) as skip:
            logger.info("Skipping run: %s", skip)
            if hard_refresh:
                save_hard_refresh(self.paths.last_hard_refresh_file)
            return
        except (DecompressionFailed, RecordCountMismatch) as skip:
            logger.warning("Skipping run: %s", skip)
            if hard_refresh and isinstance(skip, DecompressionFailed):
                save_hard_refresh(self.paths.last_hard_refresh_file)
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
        shutil.copyfile(download.data_path, self.paths.silo_input_data_path)

        run_id = str(int(time.time()))
        self.sentinels.request_run(run_id)
        try:
            self.sentinels.wait_for_completion(run_id, self.config.silo_run_timeout)
        except Exception:
            logger.exception("SILO preprocessing failed; cleaning up input")
            self.sentinels.clear_pending()
            safe_remove(self.paths.silo_input_data_path)
            safe_remove(download.directory)
            raise

        # Mark success and save state
        if download.processing_flag.exists():
            download.processing_flag.unlink()
        save_etag(self.paths.current_etag_file, download.etag)

        if hard_refresh:
            save_hard_refresh(self.paths.last_hard_refresh_file)

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
