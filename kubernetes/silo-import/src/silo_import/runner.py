from __future__ import annotations

import logging
import shutil
import time

from .config import ImporterConfig
from .downloader import DownloadResult, download_release
from .errors import DecompressionFailed, HashUnchanged, NotModified, RecordCountMismatch, SkipRun
from .filesystem import prune_timestamped_directories, safe_remove
from .lineage import update_lineage_definitions
from .paths import ImporterPaths
from .sentinels import SentinelManager
from .state import ImporterState

logger = logging.getLogger(__name__)


class ImporterRunner:
    def __init__(self, config: ImporterConfig, paths: ImporterPaths) -> None:
        self.config = config
        self.paths = paths
        self.paths.ensure_directories()
        self.sentinels = SentinelManager(paths.run_sentinel, paths.done_sentinel)

    def run_once(self) -> None:
        prune_timestamped_directories(self.paths.output_dir)

        state = ImporterState.load(self.paths.current_etag_file, self.paths.last_hard_refresh_file)
        hard_refresh = state.should_hard_refresh(self.config.hard_refresh_interval)
        last_etag = state.get_etag_for_request(hard_refresh)

        try:
            download = download_release(self.config, self.paths, last_etag)
        except NotModified as skip:
            logger.info("Skipping run: %s", skip)
            if hard_refresh:
                state.save_hard_refresh(self.paths.last_hard_refresh_file)
            return
        except HashUnchanged as skip:
            logger.info("Skipping run: %s", skip)
            if hard_refresh:
                state.save_hard_refresh(self.paths.last_hard_refresh_file)
            return
        except DecompressionFailed as skip:
            logger.warning("Skipping run due to decompression failure: %s", skip)
            if hard_refresh:
                state.save_hard_refresh(self.paths.last_hard_refresh_file)
            return
        except RecordCountMismatch as skip:
            logger.warning("Skipping run due to validation issue: %s", skip)
            return

        try:
            update_lineage_definitions(download.pipeline_versions, self.config, self.paths)
        except Exception:
            logger.exception("Failed to download lineage definitions; cleaning up input")
            self._delete_new_input(download)
            raise

        self._prepare_silo_input(download)

        run_id = str(int(time.time()))
        self.sentinels.request_run(run_id)
        try:
            self.sentinels.wait_for_completion(run_id, self.config.silo_run_timeout)
        except Exception:
            logger.exception("SILO preprocessing failed; cleaning up input")
            self.sentinels.clear_pending()
            self._delete_new_input(download)
            raise

        self._mark_processing_complete(download)
        state = state.save_etag(self.paths.current_etag_file, download.etag)

        if hard_refresh:
            state = state.save_hard_refresh(self.paths.last_hard_refresh_file)

        logger.info("Run complete; waiting %s seconds", self.config.poll_interval)

    def _delete_new_input(self, download: DownloadResult) -> None:
        safe_remove(self.paths.silo_input_data_path)
        safe_remove(download.directory)

    def _prepare_silo_input(self, download: DownloadResult) -> None:
        safe_remove(self.paths.silo_input_data_path)
        shutil.copyfile(download.data_path, self.paths.silo_input_data_path)

    def _mark_processing_complete(self, download: DownloadResult) -> None:
        if download.processing_flag.exists():
            download.processing_flag.unlink()


def run_forever(config: ImporterConfig, paths: ImporterPaths) -> None:
    runner = ImporterRunner(config, paths)
    while True:
        try:
            runner.run_once()
        except SkipRun:
            # SkipRun should already be handled; this is defensive
            logger.info("Run skipped")
        except Exception:
            logger.exception("SILO import cycle failed")
        time.sleep(config.poll_interval)
