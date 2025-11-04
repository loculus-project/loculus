"""Filesystem utility functions."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)


def safe_remove(path: Path) -> None:
    """
    Safely remove a file or directory.

    Args:
        path: Path to remove

    Note:
        Ignores FileNotFoundError. Logs warnings for other OS errors.
    """
    try:
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    except FileNotFoundError:
        return
    except OSError as exc:
        logger.warning("Failed to remove %s: %s", path, exc)


def prune_timestamped_directories(directory: Path) -> None:
    """
    Remove old timestamped directories, keeping only the most recent ones.

    Args:
        directory: Parent directory containing timestamped subdirectories
        keep: Number of most recent directories to keep (default 1)

    Note:
        Only directories with numeric names are considered timestamped.
        Non-critical cleanup failures are logged as warnings.
    """
    keep = 1
    if not directory.exists():
        return

    candidates = [p for p in directory.iterdir() if p.is_dir() and p.name.isdigit()]
    if len(candidates) <= keep:
        return

    candidates.sort(key=lambda item: int(item.name), reverse=True)
    for candidate in candidates[keep:]:
        try:
            shutil.rmtree(candidate)
        except OSError as exc:
            logger.warning("Failed to prune %s: %s", candidate, exc)
