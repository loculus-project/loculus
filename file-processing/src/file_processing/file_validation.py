import logging
import os
import subprocess  # noqa: S404
from enum import StrEnum
from pathlib import Path

from file_processing.datatypes import Annotation, FileCategory, FileName
from file_processing.errors import InvalidSubmission, ProcessingFailure

logger = logging.getLogger(__name__)

VALIDATION_JAR_PATH = os.environ.get("READTOOLS_JAR", "/opt/app/lib/readtools.jar")


class FileFormat(StrEnum):
    FASTQ = "FASTQ"
    BAM = "BAM"
    CRAM = "CRAM"


ACCEPTED_FASTQ_EXTENSIONS = {".fastq", ".fq", ".fastq.gz", ".fq.gz"}
ACCEPTED_BAM_EXTENSIONS = {".bam", ".sam"}
ACCEPTED_CRAM_EXTENSIONS = {".cram"}

ACCEPTED_FORMATS = [FileFormat.FASTQ]


def _parse_validation_error(stdout: str, stderr: str) -> str:
    """Extract the reason readtools reported RESULT: INVALID.

    readtools prints e.g.
        RESULT: INVALID
          Sequence header must start with @: >seq1 at line 1 in fastq
    to stdout (sometimes as "RESULT: INVALID (file structure / parse error)");
    fall back to stderr if that line is missing.
    """
    marker_pos = stdout.find("RESULT: INVALID")

    if marker_pos == -1:
        if stderr:
            return f"File validation failed at readtools: {stderr.strip()[:40]}..."
        return "File validation failed at readtools."

    details = stdout[marker_pos:].partition("\n")[2]
    details = "; ".join(filter(None, map(str.strip, details.splitlines())))
    return f"File validation failed at readtools. {details}".rstrip()


def _has_extension(file: str, extensions: set[str]) -> bool:
    # Path.suffix only returns the last extension, so "reads.fastq.gz" would
    # otherwise never match a multi-part extension like ".fastq.gz".
    return any(file.lower().endswith(extension) for extension in extensions)


def determine_file_format(file_name: str) -> FileFormat | None:
    """Determine the shared format of a set of raw reads files from their
    names alone (no download required).
    """
    if file_name and _has_extension(file_name, ACCEPTED_FASTQ_EXTENSIONS):
        return FileFormat.FASTQ
    if file_name and _has_extension(file_name, ACCEPTED_BAM_EXTENSIONS):
        return FileFormat.BAM
    if file_name and _has_extension(file_name, ACCEPTED_CRAM_EXTENSIONS):
        return FileFormat.CRAM
    return None


def validate_file_extensions(
    file_names: list[FileName],
    accepted_formats: list[FileFormat] = ACCEPTED_FORMATS,
) -> FileFormat:
    """Validate that all files have extensions consistent with the accepted formats."""
    file_formats = {determine_file_format(file_name) for file_name in file_names}
    if len(file_formats) > 1:
        raise InvalidSubmission(
            error=Annotation(
                fileNames=file_names,
                fileCategory=FileCategory.RAW_READS,
                message=f"Input files have mixed formats. Please provide files with consistent and supported formats: {accepted_formats}, paired-end FASTQ files must be submitted as separate, de-interleaved files.",
            )
        )
    file_format = file_formats.pop()
    if file_format not in accepted_formats or file_format is None:
        raise InvalidSubmission(
            error=Annotation(
                fileNames=file_names,
                fileCategory=FileCategory.RAW_READS,
                message=f"File is not in accepted format: {', '.join(accepted_formats)}. Paired-end FASTQ files must be submitted as separate, de-interleaved files.",
            )
        )
    return file_format


def validate_file_numbers(file_format: FileFormat, file_names: list[FileName]) -> None:
    """Validate the number of files submitted conforms to the expected number for the given file format."""
    if file_format == FileFormat.FASTQ and len(file_names) > 2:
        # ENA's readtools.jar actually allows more than 2 FASTQ files, but it treats every 1+i file as a paired read of the first file.
        # ENA documents that multi-FASTQs should be submitted using a JSON manifest, which we don't support, so we enforce a stricter limit here.
        raise InvalidSubmission(
            error=Annotation(
                fileNames=file_names,
                fileCategory=FileCategory.RAW_READS,
                message=f"Too many FASTQ files submitted ({len(file_names)}). We only allow 1 FASTQ file for single-end reads or 2 FASTQ files for paired-end reads.",
            )
        )
    if file_format in {FileFormat.BAM, FileFormat.CRAM} and len(file_names) > 1:
        raise InvalidSubmission(
            error=Annotation(
                fileNames=file_names,
                fileCategory=FileCategory.RAW_READS,
                message=f"Too many {file_format.value.upper()} files submitted ({len(file_names)}). We only allow 1 {file_format.value.upper()} file per submission.",
            )
        )
    return None


def validate_with_readtools(
    file_name_to_path: dict[FileName, Path],
    format_type: FileFormat,
    timeout_seconds: int = 300,
) -> None:
    file_names = list(file_name_to_path.keys())
    args = (
        ["java", "-jar", VALIDATION_JAR_PATH]
        + [str(file) for file in file_name_to_path.values()]
        + [
            "--format",
            format_type.value,
        ]
    )
    logger.debug(f"Running validation on '{file_names}': {args}")

    try:
        subprocess.run(  # noqa: S603
            args,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        message = f"Validation of files '{','.join(file_names)}' timed out after {timeout_seconds} seconds."
        logger.error(message)
        raise ProcessingFailure(message)
    except subprocess.CalledProcessError as error:
        validation_error = _parse_validation_error(
            stdout=error.stdout,
            stderr=error.stderr,
        )
        logger.error(validation_error)
        raise InvalidSubmission(
            error=Annotation(
                fileNames=file_names,
                message=validation_error,
            )
        )
    return None
