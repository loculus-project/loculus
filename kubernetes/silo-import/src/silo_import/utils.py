"""
Backwards-compatible utilities module.

This module re-exports functions from the refactored modules to maintain
backwards compatibility with existing code.
"""

from __future__ import annotations

# Re-export from new modules
from .file_io import parse_key_value_file, read_text, write_text
from .filesystem import prune_timestamped_directories, safe_remove
from .hash_comparator import md5_file

__all__ = [
    "read_text",
    "write_text",
    "md5_file",
    "parse_key_value_file",
    "prune_timestamped_directories",
    "safe_remove",
]
