"""Constants used throughout the silo_import package."""

from __future__ import annotations

# Special ETag value used to indicate no previous data
SPECIAL_ETAG_NONE = "0"

# File names for downloaded data
DATA_FILENAME = "untransformed_data.ndjson.zst"
TRANSFORMED_DATA_FILENAME = "data.ndjson.zst"  # name is set by SILO
LINEAGES_FILENAME = "lineage_definitions.yaml"  # default name if no lineage definition map provided
