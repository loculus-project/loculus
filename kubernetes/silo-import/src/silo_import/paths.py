from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ImporterPaths:
    preprocessing_dir: Path
    input_dir: Path
    output_dir: Path
    lineage_definition_file: Path
    current_etag_file: Path
    last_hard_refresh_file: Path
    silo_input_data_path: Path
    run_sentinel: Path
    done_sentinel: Path

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
            current_etag_file=input_dir / "etag.txt",
            last_hard_refresh_file=input_dir / "last_hard_refresh_time.txt",
            silo_input_data_path=input_dir / "data.ndjson.zst",
            run_sentinel=input_dir / "run_silo",
            done_sentinel=input_dir / "silo_done",
        )

    def ensure_directories(self) -> None:
        self.input_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
