"""Hash-based comparison to detect duplicate data."""

from __future__ import annotations

import hashlib
from pathlib import Path


def md5_file(path: Path) -> str:
    """
    Compute MD5 hash of a file.

    Args:
        path: Path to file

    Returns:
        Hex digest of MD5 hash
    """
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):  # 1MB chunks
            digest.update(chunk)
    return digest.hexdigest()