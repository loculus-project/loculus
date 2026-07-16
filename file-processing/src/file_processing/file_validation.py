import logging
import subprocess  # noqa: S404
from enum import StrEnum
from pathlib import Path

from file_processing.datatypes import Annotation

logger = logging.getLogger(__name__)

VALIDATION_JAR_PATH = "/opt/app/lib/readtools.jar"


class FormatType(StrEnum):
    FASTQ = "FASTQ"
    BAM = "BAM"
    CRAM = "CRAM"


def run_validation(
    input_files: list[str], data_dir: str, format_type: FormatType
) -> Annotation | None:
    for file in input_files:
        args = [
            "java",
            "-jar",
            VALIDATION_JAR_PATH,
            file,
            "--format",
            format_type.value,
        ]
        logger.debug(f"Running validation on '{file}': {args}")
        log_file_path = Path(data_dir) / f"{Path(file).name}.validation.log"
        error_log_path = Path(data_dir) / f"{Path(file).name}.validation.error.log"

        exit_code = subprocess.run(  # noqa: S603
            args,
            check=False,
            stdout=log_file_path.open("w"),
            stderr=error_log_path.open("w"),
        ).returncode
        if exit_code != 0:
            # TODO: parse error message from stdout/stderr and include in Annotation
            message = f"File validation failed with exit code {exit_code}"
            logger.error(message)
            return Annotation(
                fileName=Path(file).name,
                message=message,
            )
    return None
