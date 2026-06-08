from __future__ import annotations

import json
import logging
import os
import shutil
import time
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import orjsonl
import requests
import zstandard

from .constants import DATA_FILENAME, SPECIAL_ETAG_NONE, TRANSFORMED_DATA_FILENAME
from .download_manager import (
    _create_download_directory,
    _download_file,
    _handle_previous_directory,
)
from .errors import HashUnchangedError, NotModifiedError
from .filesystem import prune_timestamped_directories, safe_remove
from .instruct_silo import SiloRunner
from .paths import ImporterPaths
from .transformer import transform_data_format

logger = logging.getLogger(__name__)

DownloadFunc = Callable[[str, Path, str | None, int], Any]
HTTP_BAD_REQUEST = 400


@dataclass(frozen=True)
class OverviewImporterConfig:
    backend_base_urls: dict[str, str]
    organism_display_names: dict[str, str]
    clade_field_candidates: dict[str, list[str]]
    metadata_fields: list[str]
    hard_refresh_interval: int
    poll_interval: int
    silo_run_timeout: int
    root_dir: Path
    silo_binary: Path
    preprocessing_config: Path

    @classmethod
    def from_env(cls) -> OverviewImporterConfig:
        env = os.environ
        backend_base_urls = _json_env_dict(env, "OVERVIEW_BACKEND_BASE_URLS")
        if not backend_base_urls:
            msg = "OVERVIEW_BACKEND_BASE_URLS environment variable is required"
            raise RuntimeError(msg)

        metadata_fields = _json_env_list(env, "OVERVIEW_METADATA_FIELDS")
        if not metadata_fields:
            msg = "OVERVIEW_METADATA_FIELDS environment variable is required"
            raise RuntimeError(msg)

        root_raw = env.get("ROOT_DIR")
        root_dir = Path(root_raw).resolve() if root_raw else Path("/")

        return cls(
            backend_base_urls={key: value.rstrip("/") for key, value in backend_base_urls.items()},
            organism_display_names=_json_env_dict(env, "OVERVIEW_ORGANISM_DISPLAY_NAMES"),
            clade_field_candidates=_json_env_list_dict(env, "OVERVIEW_CLADE_FIELD_CANDIDATES"),
            metadata_fields=metadata_fields,
            hard_refresh_interval=int(env.get("HARD_REFRESH_INTERVAL", "3600")),
            poll_interval=int(env.get("SILO_IMPORT_POLL_INTERVAL_SECONDS", "30")),
            silo_run_timeout=int(env.get("SILO_RUN_TIMEOUT_SECONDS", "3600")),
            root_dir=root_dir,
            silo_binary=Path(env.get("PATH_TO_SILO_BINARY", "/usr/local/bin/silo")),
            preprocessing_config=Path(
                env.get("PREPROCESSING_CONFIG", "/app/preprocessing_config.yaml")
            ),
        )

    def released_data_endpoint(self, organism_key: str) -> str:
        return f"{self.backend_base_urls[organism_key]}/get-released-data?compression=zstd"


@dataclass
class OverviewDownloadResult:
    directory: Path
    transformed_path: Path
    etag: str


class OverviewImporterRunner:
    def __init__(
        self,
        config: OverviewImporterConfig,
        paths: ImporterPaths,
        download_func: DownloadFunc | None = None,
    ) -> None:
        self.config = config
        self.paths = paths
        self.paths.ensure_directories()
        self._clear_download_directories()
        self.silo = SiloRunner(paths.silo_binary, paths.preprocessing_config)
        self.download_func = download_func or _download_file
        self.current_etags: dict[str, str] = {}
        self.last_hard_refresh: float = 0

    def _clear_download_directories(self) -> None:
        if not self.paths.input_dir.exists():
            return
        for item in self.paths.input_dir.iterdir():
            if item.is_dir() and item.name.isdigit():
                logger.info("Clearing download directory on startup: %s", item)
                safe_remove(item)

    def run_once(self) -> None:
        prune_timestamped_directories(self.paths.output_dir)
        hard_refresh = time.time() - self.last_hard_refresh >= self.config.hard_refresh_interval
        etags = None if hard_refresh else self.current_etags

        try:
            download = self.download_release(etags)
        except (NotModifiedError, HashUnchangedError) as skip:
            logger.info("Skipping overview run: %s", skip)
            if hard_refresh:
                self.last_hard_refresh = time.time()
            return

        safe_remove(self.paths.silo_input_data_path)
        shutil.copyfile(download.transformed_path, self.paths.silo_input_data_path)

        try:
            self.silo.run_preprocessing(self.config.silo_run_timeout)
        except Exception:
            logger.exception("Overview SILO preprocessing failed; cleaning up input")
            safe_remove(self.paths.silo_input_data_path)
            safe_remove(download.directory)
            raise

        self.current_etags = json.loads(download.etag)
        if hard_refresh:
            self.last_hard_refresh = time.time()
        logger.info("Overview run complete; waiting %s seconds", self.config.poll_interval)

    def download_release(self, etags: dict[str, str] | None) -> OverviewDownloadResult:
        logger.info("Starting overview download")
        download_dir = _create_download_directory(self.paths.input_dir)
        data_path = download_dir / DATA_FILENAME
        transformed_path = download_dir / TRANSFORMED_DATA_FILENAME

        try:
            downloaded_paths, response_etags = self._download_all(download_dir, etags)
            records = []
            for organism_key, path in downloaded_paths.items():
                records.extend(self._overview_records_for_organism(organism_key, path))

            _write_ndjson_zst(records, data_path)
            transform_data_format(data_path, transformed_path)

            combined_etag = json.dumps(response_etags, sort_keys=True)
            _handle_previous_directory(self.paths, download_dir, transformed_path, combined_etag)
            prune_timestamped_directories(self.paths.input_dir)
            logger.info("Downloaded %s overview records", len(records))
            return OverviewDownloadResult(download_dir, transformed_path, combined_etag)
        except Exception:
            safe_remove(download_dir)
            raise

    def _download_all(
        self,
        download_dir: Path,
        etags: dict[str, str] | None,
    ) -> tuple[dict[str, Path], dict[str, str]]:
        first_pass_paths, first_pass_etags, not_modified = self._download_pass(download_dir, etags)
        if etags and len(not_modified) == len(self.config.backend_base_urls):
            raise NotModifiedError
        if etags and not_modified:
            for path in first_pass_paths.values():
                safe_remove(path)
            return self._download_pass(download_dir, None)[:2]
        return first_pass_paths, first_pass_etags

    def _download_pass(
        self,
        download_dir: Path,
        etags: dict[str, str] | None,
    ) -> tuple[dict[str, Path], dict[str, str], set[str]]:
        downloaded_paths: dict[str, Path] = {}
        response_etags: dict[str, str] = {}
        not_modified: set[str] = set()

        for organism_key in self.config.backend_base_urls:
            path = download_dir / f"{organism_key}-{DATA_FILENAME}"
            response = self.download_func(
                self.config.released_data_endpoint(organism_key),
                path,
                etags.get(organism_key, SPECIAL_ETAG_NONE) if etags else SPECIAL_ETAG_NONE,
                300,
            )
            if response.status_code == requests.codes.not_modified:
                not_modified.add(organism_key)
                safe_remove(path)
                continue
            if response.status_code >= HTTP_BAD_REQUEST:
                body = (
                    path.read_text(encoding="utf-8", errors="replace")
                    if path.exists()
                    else "missing"
                )
                msg = (
                    f"Failed to download {organism_key}: HTTP {response.status_code}. "
                    f"Body: {body}"
                )
                raise RuntimeError(msg)

            etag = response.headers.get("etag")
            if not etag:
                msg = f"{organism_key} response did not contain an ETag header"
                raise RuntimeError(msg)
            response_etags[organism_key] = etag
            downloaded_paths[organism_key] = path

        return downloaded_paths, response_etags, not_modified

    def _overview_records_for_organism(self, organism_key: str, path: Path) -> list[dict[str, Any]]:
        records = []
        for record in orjsonl.stream(path):
            if not isinstance(record, dict):
                continue
            metadata = record.get("metadata", {})
            if not isinstance(metadata, dict):
                continue
            overview_metadata = self._overview_metadata(organism_key, metadata)
            records.append(
                {
                    "metadata": overview_metadata,
                    "unalignedNucleotideSequences": {},
                    "alignedNucleotideSequences": {},
                    "alignedAminoAcidSequences": {},
                    "nucleotideInsertions": {},
                    "aminoAcidInsertions": {},
                }
            )
        return records

    def _overview_metadata(self, organism_key: str, metadata: dict[str, Any]) -> dict[str, Any]:
        overview_metadata = {
            field: metadata.get(field)
            for field in self.config.metadata_fields
            if field not in {"organismKey", "organism", "clade"}
        }
        overview_metadata["organismKey"] = organism_key
        overview_metadata["organism"] = self.config.organism_display_names.get(
            organism_key, organism_key
        )
        overview_metadata["clade"] = _first_non_empty(
            metadata.get(field)
            for field in self.config.clade_field_candidates.get(organism_key, [])
        )
        return overview_metadata


def _json_env_dict(env: Mapping[str, str], key: str) -> dict[str, str]:
    raw = env.get(key)
    if not raw:
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in data.items()
    ):
        msg = f"{key} must be a JSON object with string values"
        raise RuntimeError(msg)
    return data


def _json_env_list(env: Mapping[str, str], key: str) -> list[str]:
    raw = env.get(key)
    if not raw:
        return []
    data = json.loads(raw)
    if not isinstance(data, list) or not all(isinstance(item, str) for item in data):
        msg = f"{key} must be a JSON array of strings"
        raise RuntimeError(msg)
    return data


def _json_env_list_dict(env: Mapping[str, str], key: str) -> dict[str, list[str]]:
    raw = env.get(key)
    if not raw:
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict) or not all(
        isinstance(k, str)
        and isinstance(v, list)
        and all(isinstance(item, str) for item in v)
        for k, v in data.items()
    ):
        msg = f"{key} must be a JSON object with string-array values"
        raise RuntimeError(msg)
    return data


def _first_non_empty(values: Iterable[Any]) -> Any:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and not value:
            continue
        return value
    return None


def _write_ndjson_zst(records: list[dict[str, Any]], path: Path) -> None:
    compressor = zstandard.ZstdCompressor()
    with path.open("wb") as handle, compressor.stream_writer(handle) as writer:
        for record in records:
            writer.write(json.dumps(record, separators=(",", ":")).encode("utf-8"))
            writer.write(b"\n")


def run_overview_forever(config: OverviewImporterConfig, paths: ImporterPaths) -> None:
    runner = OverviewImporterRunner(config, paths)
    while True:
        try:
            runner.run_once()
        except Exception:
            logger.exception("Overview SILO import cycle failed")
        time.sleep(config.poll_interval)
