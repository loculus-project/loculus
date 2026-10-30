from __future__ import annotations

import logging
import multiprocessing
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PreprocessingInputs:
    database_config: Path
    reference_genomes: Path
    input_file: Path
    lineage_definitions: list[Path]
    output_dir: Path


def _preprocess(inputs: PreprocessingInputs) -> None:
    """Build a database with the RhyDB python bindings and save it as a new state in output_dir.

    Runs in a separate process, so that a timeout can be enforced and all memory is returned to
    the OS once preprocessing is done.
    """
    from rhydb import Database  # ruff:ignore[import-outside-top-level]

    with Database() as database:
        database.preprocess(
            database_config=inputs.database_config,
            reference_genomes=inputs.reference_genomes,
            input_file=inputs.input_file,
            lineage_definitions=inputs.lineage_definitions,
        )
        database.save_checkpoint(str(inputs.output_dir))


class SiloRunner:
    def __init__(self, inputs: PreprocessingInputs) -> None:
        self._inputs = inputs

    def run_preprocessing(self, timeout_seconds: int) -> None:
        logger.info("Starting SILO preprocessing")
        process = multiprocessing.get_context("spawn").Process(
            target=_preprocess, args=(self._inputs,), name="rhydb-preprocessing"
        )
        process.start()
        process.join(timeout_seconds)
        if process.is_alive():
            process.kill()
            process.join()
            msg = f"SILO preprocessing timed out after {timeout_seconds}s"
            raise TimeoutError(msg)
        if process.exitcode != 0:
            msg = f"SILO preprocessing failed with exit code {process.exitcode}"
            raise RuntimeError(msg)
        logger.info("SILO preprocessing completed successfully")
