"""Constants used throughout the silo_import package."""

from __future__ import annotations

# Special ETag value used to indicate no previous data
SPECIAL_ETAG_NONE = "0"

# File names for downloaded data
DATA_FILENAME = "data.ndjson.zst"
PROCESSING_FLAG_FILENAME = "processing"