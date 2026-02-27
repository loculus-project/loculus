"""Main download orchestration logic."""

from __future__ import annotations

import hashlib
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from http.client import BAD_REQUEST
from pathlib import Path

import requests

from .config import ImporterConfig
from .constants import (
    DATA_FILENAME,
    TRANSFORMED_DATA_FILENAME,
)
from .decompressor import analyze_ndjson
from .errors import (
    DecompressionFailedError,
    HashUnchangedError,
    NotModifiedError,
    RecordCountMismatchError,
)
from .filesystem import prune_timestamped_directories, safe_remove
from .paths import ImporterPaths
from .transformer import TransformationError, transform_data_format

logger = logging.getLogger(__name__)


class RecordCountValidationError(Exception):
    """Record count does not match expected value."""


def _md5_file(path: Path) -> str:
    """Compute MD5 hash of a file."""
    digest = hashlib.md5()  # noqa: S324
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):  # 1MB chunks
            digest.update(chunk)
    return digest.hexdigest()


def _validate_record_count(actual: int, expected: int | None) -> None:
    """Validate that the actual record count matches expected."""
    if expected is not None and actual != expected:
        logger.warning("Expected %s records but decoded %s", expected, actual)
        msg = f"Expected {expected} records but got {actual}"
        raise RecordCountValidationError(msg)
    logger.info("Actual record count matches expected record count")


def _parse_int_header(value: str | None) -> int | None:
    """Parse an integer from an HTTP header value."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@dataclass
class HttpResponse:
    """Response from an HTTP request."""

    status_code: int
    headers: dict[str, str]


@dataclass
class DownloadResult:
    """Result of a successful download."""

    directory: Path
    transformed_path: Path
    etag: str
    pipeline_version: int | None
    record_count: int = 0


def _download_file(
    url: str,
    output_path: Path,
    etag: str | None = None,
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
        msg = f"Failed to download from {url}: {exc}"
        raise RuntimeError(msg) from exc


# Type for download function (allows test mocking)
DownloadFunc = Callable[[str, Path, str | None, int], HttpResponse]


class DownloadManager:
    """Manages downloading and validating data releases."""

    def __init__(self, download_func: DownloadFunc | None = None) -> None:
        self.download_func = download_func or _download_file

    def download_release(
        self,
        config: ImporterConfig,
        paths: ImporterPaths,
        last_etag: str,
        released_since: str | None = None,
    ) -> DownloadResult:
        """
        Download and validate a data release from the backend.

        Args:
            config: Importer configuration
            paths: Importer paths
            last_etag: ETag from previous download for conditional request
            released_since: Optional ISO-8601 timestamp to only fetch data released strictly after

        Returns:
            DownloadResult with paths and metadata

        Raises:
            NotModified: Backend returned 304 (no new data)
            HashUnchanged: Downloaded data matches previous hash
            DecompressionFailed: Could not decompress downloaded data
            RecordCountMismatch: Record count doesn't match header
            RuntimeError: Other download or validation errors
        """
        logger.info(f"Starting download from backend with ETag: {last_etag}")
        # Create timestamped directory for this download
        download_dir = _create_download_directory(paths.input_dir)
        data_path = download_dir / DATA_FILENAME
        transformed_path = download_dir / TRANSFORMED_DATA_FILENAME

        try:
            # Download data from backend
            endpoint = (
                config.released_data_since_endpoint(released_since)
                if released_since
                else config.released_data_endpoint
            )
            logger.info("Requesting released data from %s", endpoint)
            response = self.download_func(
                endpoint,
                data_path,
                last_etag,
                300,
            )

            if response.status_code >= BAD_REQUEST:
                msg = (
                    f"Failed to download data: HTTP {response.status_code}."
                    f"Headers: {response.headers} Body: "
                    + data_path.read_text(encoding="utf-8", errors="replace")
                    if data_path.exists()
                    else "missing"
                )
                raise RuntimeError(msg)

            # Check for 304 Not Modified
            if response.status_code == 304:  # noqa: PLR2004
                logger.info("Backend returned 304 Not Modified; skipping import")
                safe_remove(download_dir)
                raise NotModifiedError

            # Extract and validate ETag
            etag_value = response.headers.get("etag")
            if not etag_value:
                safe_remove(download_dir)
                msg = f"Response headers: {response.headers} did not contain an ETag header"
                raise RuntimeError(msg)

            # Parse expected record count from header
            expected_count = _parse_int_header(response.headers.get("x-total-records"))

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
                message = f"Decompression failed ({exc})"
                raise DecompressionFailedError(message) from exc

            logger.info("Downloaded %s records (ETag %s)", analysis.record_count, etag_value)

            # Convert to new SILO format
            try:
                transform_data_format(data_path, transformed_path)
            except Exception as exc:
                logger.error("Data transformation failed: %s", exc)
                safe_remove(download_dir)
                raise TransformationError from exc

            # Validate record count
            try:
                _validate_record_count(analysis.record_count, expected_count)
            except RecordCountValidationError as err:
                safe_remove(download_dir)
                raise RecordCountMismatchError from err

            # Check against previous download to avoid reprocessing (skip for incremental)
            if not released_since:
                _handle_previous_directory(paths, download_dir, transformed_path, etag_value)

            # Prune old directories
            prune_timestamped_directories(paths.input_dir)

            return DownloadResult(
                directory=download_dir,
                transformed_path=transformed_path,
                etag=etag_value,
                pipeline_version=analysis.pipeline_version,
                record_count=analysis.record_count,
            )

        except (
            NotModifiedError,
            HashUnchangedError,
            DecompressionFailedError,
            RecordCountMismatchError,
        ):
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
        p for p in paths.input_dir.iterdir() if p.is_dir() and p.name.isdigit() and p != new_dir
    ]
    if not previous_dirs:
        return

    previous_dirs.sort(key=lambda item: int(item.name))
    previous_dir = previous_dirs[-1]

    previous_data_path = previous_dir / TRANSFORMED_DATA_FILENAME

    # Clean up previous directory with no data
    if not previous_data_path.exists():
        logger.info("Previous input directory %s did not contain data", previous_dir)
        return

    # Compare hashes to detect duplicates
    old_hash = _md5_file(previous_data_path)
    new_hash = _md5_file(new_data_path)
    if old_hash == new_hash:
        logger.info("New data matches previous hash; skipping preprocessing")
        safe_remove(new_dir)
        raise HashUnchangedError(new_etag=new_etag)
