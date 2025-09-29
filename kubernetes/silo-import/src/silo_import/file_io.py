"""File I/O utility functions."""

from __future__ import annotations

from pathlib import Path
from typing import Dict


def read_text(path: Path, default: str = "0") -> str:
    """
    Read text from a file with a default fallback.

    Args:
        path: Path to file
        default: Default value if file doesn't exist or is empty

    Returns:
        File contents or default value
    """
    try:
        text = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return default
    return text or default


def write_text(path: Path, value: str) -> None:
    """
    Write text to a file, creating parent directories if needed.

    Args:
        path: Path to file
        value: Text to write
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def parse_key_value_file(path: Path) -> Dict[str, str]:
    """
    Parse a file containing key=value pairs.

    Args:
        path: Path to file

    Returns:
        Dictionary of key-value pairs
    """
    pairs: Dict[str, str] = {}
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if "=" not in line:
                continue
            key, value = line.strip().split("=", 1)
            pairs[key] = value
    return pairs