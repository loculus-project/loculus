from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ImporterPaths:
    preprocessing_dir: Path
    input_dir: Path
    output_dir: Path
    lineage_definition_file: Path
    silo_input_data_path: Path
    run_silo: Path
    silo_done: Path

    @classmethod
    def from_root(cls, root: Path) -> "ImporterPaths":
        preprocessing_dir = (root / "preprocessing").resolve()
        input_dir = preprocessing_dir / "input"
        output_dir = preprocessing_dir / "output"
        return cls(
            preprocessing_dir=preprocessing_dir,
            input_dir=input_dir,
            output_dir=output_dir,
            lineage_definition_file=input_dir / "lineage_definitions.yaml",
            silo_input_data_path=input_dir / "data.ndjson.zst",
            run_silo=input_dir / "run_silo",
            silo_done=input_dir / "silo_done",
        )

    def ensure_directories(self) -> None:
        self.input_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
