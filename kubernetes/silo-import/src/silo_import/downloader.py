from __future__ import annotations

import io
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Set

import httpx
import zstandard

from .config import ImporterConfig
from .errors import HashUnchanged, NotModified, RecordCountMismatch
from .paths import ImporterPaths
from .utils import md5_file, prune_timestamped_directories, safe_remove, write_text


def _create_http_client(**kwargs: object) -> httpx.Client:
    return httpx.Client(**kwargs)

logger = logging.getLogger(__name__)


@dataclass
class DownloadResult:
    directory: Path
    data_path: Path
    header_path: Path
    etag_path: Path
    processing_flag: Path
    etag: str
    pipeline_versions: Set[str]


def download_release(config: ImporterConfig, paths: ImporterPaths, last_etag: str) -> DownloadResult:
    timestamp = int(time.time())
    new_dir = paths.input_dir / str(timestamp)
    while new_dir.exists():  # Guard against duplicate timestamps
        timestamp += 1
        new_dir = paths.input_dir / str(timestamp)

    new_dir.mkdir(parents=True)
    data_path = new_dir / "data.ndjson.zst"
    header_path = new_dir / "header.txt"
    etag_path = new_dir / "etag.txt"
    processing_flag = new_dir / "processing"
    processing_flag.touch()

    headers = {}
    if last_etag and last_etag != "0":
        headers["If-None-Match"] = last_etag

    logger.info("Requesting released data from %s", config.released_data_endpoint)
    expected_count: Optional[int] = None
    with _create_http_client(timeout=httpx.Timeout(300.0)) as client:
        with client.stream("GET", config.released_data_endpoint, headers=headers) as response:
            if response.status_code == 304:
                logger.info("Backend returned 304 Not Modified; skipping import")
                _cleanup_directory(new_dir)
                raise NotModified("Backend state unchanged")

            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                _cleanup_directory(new_dir)
                raise RuntimeError(f"Failed to download released data: {exc}") from exc

            with data_path.open("wb") as handle:
                for chunk in response.iter_bytes():
                    handle.write(chunk)

            header_lines = [f"{key}: {value}" for key, value in response.headers.multi_items()]
            header_path.write_text("\n".join(header_lines) + "\n", encoding="utf-8")

            etag_value = response.headers.get("etag")
            if not etag_value:
                _cleanup_directory(new_dir)
                raise RuntimeError("Response did not contain an ETag header")
            write_text(etag_path, etag_value)

            expected_count = _parse_int_header(response.headers.get("x-total-records"))

    try:
        record_count, pipeline_versions = _analyse_ndjson(data_path)
    except RuntimeError as exc:
        logger.warning("Failed to decompress %s: %s", data_path, exc)
        write_text(paths.current_etag_file, etag_path.read_text(encoding="utf-8").strip())
        _cleanup_directory(new_dir)
        raise DecompressionFailed("decompression failed") from exc
    logger.info("Downloaded %s records (ETag %s)", record_count, etag_value)

    if expected_count is not None and record_count != expected_count:
        logger.warning(
            "Expected %s records but decoded %s; deleting staged directory",
            expected_count,
            record_count,
        )
        _cleanup_directory(new_dir)
        raise RecordCountMismatch("record count mismatch")

    _handle_previous_directory(
        paths.input_dir,
        new_dir,
        data_path,
        paths.current_etag_file,
        etag_value,
    )

    prune_timestamped_directories(paths.input_dir)

    return DownloadResult(
        directory=new_dir,
        data_path=data_path,
        header_path=header_path,
        etag_path=etag_path,
        processing_flag=processing_flag,
        etag=etag_value,
        pipeline_versions=pipeline_versions,
    )


def _parse_int_header(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _analyse_ndjson(path: Path) -> tuple[int, Set[str]]:
    record_count = 0
    pipeline_versions: Set[str] = set()
    decompressor = zstandard.ZstdDecompressor()
    try:
        with path.open("rb") as compressed, decompressor.stream_reader(compressed) as reader:
            text_stream = io.TextIOWrapper(reader, encoding="utf-8")
            for line in text_stream:
                line = line.strip()
                if not line:
                    continue
                record_count += 1
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"Invalid JSON record: {exc}") from exc
                metadata = obj.get("metadata") if isinstance(obj, dict) else None
                if isinstance(metadata, dict):
                    pipeline_version = metadata.get("pipelineVersion")
                    if pipeline_version:
                        pipeline_versions.add(str(pipeline_version))
    except zstandard.ZstdError as exc:
        raise RuntimeError(f"Failed to decompress {path}: {exc}") from exc
    return record_count, pipeline_versions


def _handle_previous_directory(
    input_dir: Path,
    new_dir: Path,
    new_data_path: Path,
    current_etag_file: Path,
    new_etag: str,
) -> None:
    previous_dirs = [p for p in input_dir.iterdir() if p.is_dir() and p.name.isdigit() and p != new_dir]
    if not previous_dirs:
        return
    previous_dirs.sort(key=lambda item: int(item.name))
    previous_dir = previous_dirs[-1]

    processing_flag = previous_dir / "processing"
    previous_data_path = previous_dir / "data.ndjson.zst"

    if processing_flag.exists():
        logger.warning("Previous input directory %s was incomplete; deleting", previous_dir)
        _cleanup_directory(previous_dir)
        return

    if not previous_data_path.exists():
        logger.info("Previous input directory %s did not contain data", previous_dir)
        _cleanup_directory(previous_dir)
        return

    old_hash = md5_file(previous_data_path)
    new_hash = md5_file(new_data_path)
    if old_hash == new_hash:
        logger.info("New data matches previous hash; skipping preprocessing")
        write_text(current_etag_file, new_etag)
        _cleanup_directory(new_dir)
        raise HashUnchanged("hash unchanged")

    logger.info("Removing previous input directory %s (hash mismatch)", previous_dir)
    _cleanup_directory(previous_dir)


def _cleanup_directory(directory: Path) -> None:
    safe_remove(directory)
