from __future__ import annotations

import logging
import shutil
import time
from dataclasses import dataclass

from .config import ImporterConfig
from .downloader import DownloadResult, download_release
from .errors import HashUnchanged, NotModified, RecordCountMismatch, SkipRun
from .lineage import update_lineage_definitions
from .paths import ImporterPaths
from .sentinels import SentinelManager
from .utils import prune_timestamped_directories, read_text, safe_remove, write_text

logger = logging.getLogger(__name__)


@dataclass
class ImporterState:
    current_etag: str
    last_hard_refresh: int


class ImporterRunner:
    def __init__(self, config: ImporterConfig, paths: ImporterPaths) -> None:
        self.config = config
        self.paths = paths
        self.paths.ensure_directories()
        self.sentinels = SentinelManager(paths.run_sentinel, paths.done_sentinel)

    def run_once(self) -> None:
        prune_timestamped_directories(self.paths.output_dir)

        state = self._load_state()

        hard_refresh = self._should_hard_refresh(state.last_hard_refresh)
        last_etag = "0" if hard_refresh else state.current_etag

        try:
            download = download_release(self.config, self.paths, last_etag)
        except NotModified as skip:
            logger.info("Skipping run: %s", skip)
            if hard_refresh:
                self._write_last_hard_refresh(int(time.time()))
            return
        except HashUnchanged as skip:
            logger.info("Skipping run: %s", skip)
            if hard_refresh:
                self._write_last_hard_refresh(int(time.time()))
            return
        except DecompressionFailed as skip:
            logger.warning("Skipping run due to decompression failure: %s", skip)
            if hard_refresh:
                self._write_last_hard_refresh(int(time.time()))
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
        self._write_current_etag(download.etag)

        if hard_refresh:
            self._write_last_hard_refresh(int(time.time()))

        logger.info("Run complete; waiting %s seconds", self.config.poll_interval)

    def _load_state(self) -> ImporterState:
        current_etag = read_text(self.paths.current_etag_file, default="0")
        last_refresh_str = read_text(self.paths.last_hard_refresh_file, default="0")
        try:
            last_refresh = int(last_refresh_str)
        except ValueError:
            last_refresh = 0
        return ImporterState(current_etag=current_etag, last_hard_refresh=last_refresh)

    def _should_hard_refresh(self, last_hard_refresh: int) -> bool:
        now = int(time.time())
        return now - last_hard_refresh >= self.config.hard_refresh_interval

    def _write_current_etag(self, etag: str) -> None:
        write_text(self.paths.current_etag_file, etag)

    def _write_last_hard_refresh(self, timestamp: int) -> None:
        write_text(self.paths.last_hard_refresh_file, str(timestamp))

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
