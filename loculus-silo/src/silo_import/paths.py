from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .constants import (
    TRANSFORMED_DATA_FILENAME,
)


@dataclass(frozen=True)
class ImporterPaths:
    preprocessing_dir: Path
    input_dir: Path
    output_dir: Path
    silo_input_data_path: Path
    silo_binary: Path
    preprocessing_config: Path

    @classmethod
    def from_root(cls, root: Path, silo_binary: Path, preprocessing_config: Path) -> ImporterPaths:
        preprocessing_dir = (root / "preprocessing").resolve()
        input_dir = preprocessing_dir / "input"
        output_dir = preprocessing_dir / "output"
        return cls(
            preprocessing_dir=preprocessing_dir,
            input_dir=input_dir,
            output_dir=output_dir,
            silo_input_data_path=input_dir / TRANSFORMED_DATA_FILENAME,
            silo_binary=silo_binary,
            preprocessing_config=preprocessing_config,
        )

    def lineage_definition_file(self, system_name: str) -> Path:
        return self.input_dir / f"{system_name}.yaml"

    def ensure_directories(self) -> None:
        self.input_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
