from __future__ import annotations

import sys
from pathlib import Path

import yaml
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


if __name__ == "__main__":
    preprocess(Path(sys.argv[1]))
