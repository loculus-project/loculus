"""
Backwards-compatible facade for download functionality.

This module maintains the original API while delegating to the refactored modules.
"""

from __future__ import annotations

from .config import ImporterConfig
from .download_manager import DownloadManager, DownloadResult
from .paths import ImporterPaths

__all__ = ["DownloadResult", "download_release"]


def download_release(config: ImporterConfig, paths: ImporterPaths, last_etag: str) -> DownloadResult:
    """
    Download and validate a data release from the backend.

    This is a backwards-compatible wrapper around DownloadManager.

    Args:
        config: Importer configuration
        paths: Importer paths
        last_etag: ETag from previous download

    Returns:
        DownloadResult with paths and metadata

    Raises:
        NotModified: Backend returned 304
        HashUnchanged: Data matches previous hash
        DecompressionFailed: Could not decompress
        RecordCountMismatch: Record count mismatch
        RuntimeError: Other errors
    """
    manager = DownloadManager(config, paths)
    return manager.download_release(last_etag)
