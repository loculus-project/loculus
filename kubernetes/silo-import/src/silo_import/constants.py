"""Constants used throughout the silo_import package."""

from __future__ import annotations

# Special ETag value used to indicate no previous data
SPECIAL_ETAG_NONE = "0"

# File names for downloaded data
DATA_FILENAME = "data.ndjson.zst"
HEADER_FILENAME = "header.txt"
ETAG_FILENAME = "etag.txt"
PROCESSING_FLAG_FILENAME = "processing"

# Hash computation settings
MD5_CHUNK_SIZE = 1024 * 1024  # 1MB chunks

# Directory pruning settings
DEFAULT_KEEP_DIRECTORIES = 1