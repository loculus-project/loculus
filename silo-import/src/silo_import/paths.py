from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .constants import (
    LINEAGES_FILENAME,
    TRANSFORMED_DATA_FILENAME,
)


@dataclass(frozen=True)
class ImporterPaths:
    preprocessing_dir: Path
    input_dir: Path
    output_dir: Path
    lineage_definition_file: Path
    silo_input_data_path: Path
    silo_binary: Path
    preprocessing_config: Path

    @classmethod
    def from_root(
        cls, root: Path, silo_binary: Path, preprocessing_config: Path
    ) -> ImporterPaths:
        preprocessing_dir = (root / "preprocessing").resolve()
        input_dir = preprocessing_dir / "input"
        output_dir = preprocessing_dir / "output"
        return cls(
            preprocessing_dir=preprocessing_dir,
            input_dir=input_dir,
            output_dir=output_dir,
            lineage_definition_file=input_dir / LINEAGES_FILENAME,
            silo_input_data_path=input_dir / TRANSFORMED_DATA_FILENAME,
            silo_binary=silo_binary,
            preprocessing_config=preprocessing_config,
        )

    def ensure_directories(self) -> None:
        self.input_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
