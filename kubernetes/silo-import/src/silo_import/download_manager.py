"""Main download orchestration logic."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional, Set

import requests

from .config import ImporterConfig
from .constants import (
    DATA_FILENAME,
    PROCESSING_FLAG_FILENAME,
    SPECIAL_ETAG_NONE,
)
from .decompressor import analyze_ndjson
from .errors import DecompressionFailed, HashUnchanged, NotModified, RecordCountMismatch
from .filesystem import prune_timestamped_directories, safe_remove
from .hash_comparator import md5_file
from .paths import ImporterPaths
from .validator import RecordCountValidationError, parse_int_header, validate_record_count

logger = logging.getLogger(__name__)


@dataclass
class HttpResponse:
    """Response from an HTTP request."""

    status_code: int
    headers: dict[str, str]


@dataclass
class DownloadResult:
    """Result of a successful download."""

    directory: Path
    data_path: Path
    processing_flag: Path
    etag: str
    pipeline_versions: Set[str]


def _download_file(
    url: str,
    output_path: Path,
    etag: Optional[str] = None,
    timeout: int = 300,
) -> HttpResponse:
    """
    Download a file using requests.

    Args:
        url: URL to download from
        output_path: Where to save the response body
        etag: Optional ETag for conditional request
        timeout: Request timeout in seconds

    Returns:
        HttpResponse with status code and headers

    Raises:
        RuntimeError: If the download fails
    """
    headers = {}
    if etag and etag != "0":
        headers["If-None-Match"] = etag

    try:
        session = requests.Session()
        session.headers.update(headers)
        response = session.get(url, timeout=timeout, stream=True)

        # Write response body to file (raw, no automatic decompression)
        with output_path.open("wb") as f:
            for chunk in response.raw.stream(8192, decode_content=False):
                if chunk:
                    f.write(chunk)

        # Normalize headers to lowercase keys
        normalized_headers = {k.lower(): v for k, v in response.headers.items()}

        return HttpResponse(status_code=response.status_code, headers=normalized_headers)

    except requests.RequestException as exc:
        raise RuntimeError(f"Failed to download from {url}: {exc}") from exc


# Type for download function (allows test mocking)
DownloadFunc = Callable[[str, Path, Optional[str], int], HttpResponse]


class DownloadManager:
    """Manages downloading and validating data releases."""

    def __init__(self, download_func: Optional[DownloadFunc] = None) -> None:
        self.download_func = download_func or _download_file

    def download_release(
        self,
        config: ImporterConfig,
        paths: ImporterPaths,
        last_etag: str,
    ) -> DownloadResult:
        """
        Download and validate a data release from the backend.

        Args:
            config: Importer configuration
            paths: Importer paths
            last_etag: ETag from previous download for conditional request

        Returns:
            DownloadResult with paths and metadata

        Raises:
            NotModified: Backend returned 304 (no new data)
            HashUnchanged: Downloaded data matches previous hash
            DecompressionFailed: Could not decompress downloaded data
            RecordCountMismatch: Record count doesn't match header
            RuntimeError: Other download or validation errors
        """
        # Create timestamped directory for this download
        download_dir = _create_download_directory(paths.input_dir)
        data_path = download_dir / DATA_FILENAME
        processing_flag = download_dir / PROCESSING_FLAG_FILENAME
        processing_flag.touch()

        try:
            # Download data from backend
            logger.info("Requesting released data from %s", config.released_data_endpoint)
            response = self.download_func(
                config.released_data_endpoint,
                data_path,
                last_etag,
                300,
            )

            # Check for 304 Not Modified
            if response.status_code == 304:
                logger.info("Backend returned 304 Not Modified; skipping import")
                safe_remove(download_dir)
                raise NotModified("Backend state unchanged")

            # Extract and validate ETag
            etag_value = response.headers.get("etag")
            if not etag_value:
                safe_remove(download_dir)
                raise RuntimeError("Response did not contain an ETag header")

            # Parse expected record count from header
            expected_count = parse_int_header(response.headers.get("x-total-records"))

            # Decompress and analyze the data
            try:
                analysis = analyze_ndjson(data_path)
            except RuntimeError as exc:
                logger.warning(
                    "Failed to decompress %s (size=%s bytes): %s",
                    data_path,
                    data_path.stat().st_size if data_path.exists() else "missing",
                    exc,
                )
                safe_remove(download_dir)
                raise DecompressionFailed(f"decompression failed ({exc})", new_etag=SPECIAL_ETAG_NONE) from exc

            logger.info("Downloaded %s records (ETag %s)", analysis.record_count, etag_value)

            # Validate record count
            try:
                validate_record_count(analysis.record_count, expected_count)
            except RecordCountValidationError:
                safe_remove(download_dir)
                raise RecordCountMismatch("record count mismatch")

            # Check against previous download to avoid reprocessing
            _handle_previous_directory(paths, download_dir, data_path, etag_value)

            # Prune old directories
            prune_timestamped_directories(paths.input_dir)

            return DownloadResult(
                directory=download_dir,
                data_path=data_path,
                processing_flag=processing_flag,
                etag=etag_value,
                pipeline_versions=analysis.pipeline_versions,
            )

        except (NotModified, HashUnchanged, DecompressionFailed, RecordCountMismatch):
            # Re-raise these as they're expected skip conditions
            raise
        except Exception:
            # Clean up on unexpected errors
            safe_remove(download_dir)
            raise


def _create_download_directory(input_dir: Path) -> Path:
    """Create a new timestamped directory for download."""
    timestamp = int(time.time())
    new_dir = input_dir / str(timestamp)
    while new_dir.exists():  # Guard against duplicate timestamps
        timestamp += 1
        new_dir = input_dir / str(timestamp)
    new_dir.mkdir(parents=True)
    return new_dir


def _handle_previous_directory(
    paths: ImporterPaths,
    new_dir: Path,
    new_data_path: Path,
    new_etag: str,
) -> None:
    """Check previous download and clean up if needed."""
    previous_dirs = [
        p
        for p in paths.input_dir.iterdir()
        if p.is_dir() and p.name.isdigit() and p != new_dir
    ]
    if not previous_dirs:
        return

    previous_dirs.sort(key=lambda item: int(item.name))
    previous_dir = previous_dirs[-1]

    processing_flag = previous_dir / PROCESSING_FLAG_FILENAME
    previous_data_path = previous_dir / DATA_FILENAME

    # Clean up incomplete previous download
    if processing_flag.exists():
        logger.warning("Previous input directory %s was incomplete; deleting", previous_dir)
        safe_remove(previous_dir)
        return

    # Clean up previous directory with no data
    if not previous_data_path.exists():
        logger.info("Previous input directory %s did not contain data", previous_dir)
        safe_remove(previous_dir)
        return

    # Compare hashes to detect duplicates
    old_hash = md5_file(previous_data_path)
    new_hash = md5_file(new_data_path)
    if old_hash == new_hash:
        logger.info("New data matches previous hash; skipping preprocessing")
        safe_remove(new_dir)
        raise HashUnchanged("hash unchanged", new_etag=new_etag)

    # Remove previous directory since we have new data
    logger.info("Removing previous input directory %s (hash mismatch)", previous_dir)
    safe_remove(previous_dir)