"""Constants used throughout the silo_import package."""

from __future__ import annotations

# Special ETag value used to indicate no previous data
SPECIAL_ETAG_NONE = "0"

# File names for downloaded data
DATA_FILENAME = "data.ndjson.zst"
TRANSFORMED_DATA_FILENAME = "transformed_data.ndjson.zst"
LINEAGES_FILENAME = "lineage_definitions.yaml"

# Sentinel file names
RUN_SILO_SENTINEL = "run_silo"
SILO_DONE_SENTINEL = "silo_done"
