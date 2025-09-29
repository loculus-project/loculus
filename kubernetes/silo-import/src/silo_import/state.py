"""State management for the silo importer."""

from __future__ import annotations

import time
from pathlib import Path

from .constants import SPECIAL_ETAG_NONE
from .file_io import read_text, write_text


def load_current_etag(etag_file: Path) -> str:
    """
    Load current ETag from file.

    Args:
        etag_file: Path to ETag file

    Returns:
        Current ETag or special value if file doesn't exist
    """
    return read_text(etag_file, default=SPECIAL_ETAG_NONE)


def save_etag(etag_file: Path, etag: str) -> None:
    """
    Save ETag to file.

    Args:
        etag_file: Path to ETag file
        etag: New ETag value
    """
    write_text(etag_file, etag)


def load_last_hard_refresh(refresh_file: Path) -> int:
    """
    Load last hard refresh timestamp from file.

    Args:
        refresh_file: Path to refresh timestamp file

    Returns:
        Timestamp or 0 if file doesn't exist or is invalid
    """
    refresh_str = read_text(refresh_file, default="0")
    try:
        return int(refresh_str)
    except ValueError:
        return 0


def save_hard_refresh(refresh_file: Path) -> None:
    """
    Mark hard refresh as completed by saving current timestamp.

    Args:
        refresh_file: Path to hard refresh timestamp file
    """
    timestamp = int(time.time())
    write_text(refresh_file, str(timestamp))


def should_hard_refresh(last_refresh: int, interval: int) -> bool:
    """
    Check if a hard refresh should be performed.

    Args:
        last_refresh: Timestamp of last hard refresh
        interval: Hard refresh interval in seconds

    Returns:
        True if hard refresh is due
    """
    return int(time.time()) - last_refresh >= interval