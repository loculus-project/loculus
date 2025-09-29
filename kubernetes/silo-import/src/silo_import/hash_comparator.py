"""Hash-based comparison to detect duplicate data."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from .constants import MD5_CHUNK_SIZE

logger = logging.getLogger(__name__)


def md5_file(path: Path, chunk_size: int = MD5_CHUNK_SIZE) -> str:
    """
    Compute MD5 hash of a file.

    Args:
        path: Path to file
        chunk_size: Size of chunks to read (default 1MB)

    Returns:
        Hex digest of MD5 hash
    """
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def files_match(path1: Path, path2: Path) -> bool:
    """
    Check if two files have the same MD5 hash.

    Args:
        path1: First file
        path2: Second file

    Returns:
        True if hashes match, False otherwise
    """
    hash1 = md5_file(path1)
    hash2 = md5_file(path2)
    match = hash1 == hash2
    if match:
        logger.info("Files %s and %s have matching hash %s", path1, path2, hash1)
    else:
        logger.info("Files %s and %s have different hashes", path1, path2)
    return match