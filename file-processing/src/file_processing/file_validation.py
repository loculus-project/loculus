import logging
import os
import subprocess  # noqa: S404
from enum import StrEnum
from pathlib import Path

from file_processing.datatypes import Annotation

logger = logging.getLogger(__name__)

VALIDATION_JAR_PATH = os.environ.get("READTOOLS_JAR", "/opt/app/lib/readtools.jar")


class FormatType(StrEnum):
    FASTQ = "FASTQ"
    BAM = "BAM"
    CRAM = "CRAM"


ACCEPTED_FASTQ_EXTENSIONS = {".fastq", ".fq", ".fastq.gz", ".fq.gz"}
ACCEPTED_BAM_EXTENSIONS = {".bam", ".sam"}


def _parse_validation_error(log_file_path: Path, error_log_path: Path) -> str:
    """Extract the reason readtools reported RESULT: INVALID.

    readtools prints e.g.
        RESULT: INVALID
          Sequence header must start with @: >seq1 at line 1 in fastq
    to stdout; fall back to stderr if that line is missing.
    """
    stdout_lines = log_file_path.read_text().splitlines()
    for i, line in enumerate(stdout_lines):
        if line.strip() == "RESULT: INVALID":
            details = [detail.strip() for detail in stdout_lines[i + 1 :] if detail.strip()]
            if details:
                return "; ".join(details)
            break
    stderr_content = error_log_path.read_text().strip()
    return stderr_content or "File validation failed"


def run_validation(input_files: list[str], data_dir: str) -> Annotation | None:
    if input_files and all(
        Path(file).suffix.lower() in ACCEPTED_FASTQ_EXTENSIONS for file in input_files
    ):
        format_type = FormatType.FASTQ
    elif input_files and all(
        Path(file).suffix.lower() in ACCEPTED_BAM_EXTENSIONS for file in input_files
    ):
        format_type = FormatType.BAM
    else:
        message = "Input files have mixed or unsupported formats. Please provide files with consistent and supported formats (FASTQ or BAM)."
        logger.error(message)
        return Annotation(
            fileName=",".join(input_files),
            message=message,
        )
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
            message = _parse_validation_error(log_file_path, error_log_path)
            logger.error(message)
            return Annotation(
                fileName=Path(file).name,
                message=message,
            )
    return None
