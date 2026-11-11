from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml
import zstandard
from rhydb import Database


def preprocess(preprocessing_config: Path) -> None:
    config = yaml.safe_load(preprocessing_config.read_text(encoding="utf-8"))
    input_dir = Path(config["inputDirectory"])
    database = Database()
    database.preprocess(
        database_config=input_dir / "database_config.yaml",
        reference_genomes=input_dir / config["referenceGenomeFilename"],
        input_file=input_dir / config["ndjsonInputFilename"],
        lineage_definitions=[
            input_dir / name for name in config.get("lineageDefinitionFilenames", [])
        ],
    )
    database.save_checkpoint(config["outputDirectory"])


def apply_changes(preprocessing_config: Path, compressed_changes: Path, total_records: int) -> None:
    config = yaml.safe_load(preprocessing_config.read_text(encoding="utf-8"))
    changes = compressed_changes.with_suffix("")
    with compressed_changes.open("rb") as source, changes.open("wb") as target:
        zstandard.ZstdDecompressor().copy_stream(source, target)
    with changes.open(encoding="utf-8") as lines:
        escaped = (json.loads(line)["accessionVersion"].replace("'", "''") for line in lines)
        keys = ", ".join(f"'{key}'" for key in escaped)
    database = Database(config["outputDirectory"])
    database.query(f"delete(data, where := in(accessionVersion, {{{keys}}}))")
    database.append_data_from_file("data", str(changes))
    row_count = len(database.get_filtered_bitmap("data", ""))
    if row_count != total_records:
        msg = f"Expected {total_records} rows but the database has {row_count}"
        raise RuntimeError(msg)
    database.save_checkpoint(config["outputDirectory"])


if __name__ == "__main__":
    if sys.argv[2:]:
        apply_changes(Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3]))
    else:
        preprocess(Path(sys.argv[1]))
