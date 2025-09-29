"""State management for the silo importer."""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from .constants import SPECIAL_ETAG_NONE


@dataclass
class ImporterState:
    """Application state for the importer."""

    current_etag: str
    last_hard_refresh: int

    @classmethod
    def load(cls, current_etag_file: Path, last_hard_refresh_file: Path) -> ImporterState:
        """
        Load state from disk.

        Args:
            current_etag_file: Path to file containing current ETag
            last_hard_refresh_file: Path to file containing last hard refresh timestamp

        Returns:
            Loaded state (uses defaults if files don't exist)
        """
        current_etag = _read_text(current_etag_file, default=SPECIAL_ETAG_NONE)

        last_refresh_str = _read_text(last_hard_refresh_file, default="0")
        try:
            last_hard_refresh = int(last_refresh_str)
        except ValueError:
            last_hard_refresh = 0

        return cls(current_etag=current_etag, last_hard_refresh=last_hard_refresh)

    def save_etag(self, etag_file: Path, etag: str) -> ImporterState:
        """
        Save new ETag and return updated state.

        Args:
            etag_file: Path to ETag file
            etag: New ETag value

        Returns:
            New state with updated ETag
        """
        _write_text(etag_file, etag)
        return ImporterState(current_etag=etag, last_hard_refresh=self.last_hard_refresh)

    def save_hard_refresh(self, refresh_file: Path) -> ImporterState:
        """
        Mark hard refresh as completed and return updated state.

        Args:
            refresh_file: Path to hard refresh timestamp file

        Returns:
            New state with current timestamp
        """
        timestamp = int(time.time())
        _write_text(refresh_file, str(timestamp))
        return ImporterState(current_etag=self.current_etag, last_hard_refresh=timestamp)

    def should_hard_refresh(self, interval: int) -> bool:
        """
        Check if a hard refresh should be performed.

        Args:
            interval: Hard refresh interval in seconds

        Returns:
            True if hard refresh is due
        """
        now = int(time.time())
        return now - self.last_hard_refresh >= interval

    def get_etag_for_request(self, hard_refresh: bool) -> str:
        """
        Get the ETag to use for the next request.

        Args:
            hard_refresh: Whether this is a hard refresh

        Returns:
            ETag value (or special value for hard refresh)
        """
        return SPECIAL_ETAG_NONE if hard_refresh else self.current_etag


def _read_text(path: Path, default: str) -> str:
    """Read text from file with default fallback."""
    try:
        text = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return default
    return text or default


def _write_text(path: Path, value: str) -> None:
    """Write text to file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")