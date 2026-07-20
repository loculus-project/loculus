import gzip
import logging
import os
import re
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
ACCEPTED_CRAM_EXTENSIONS = {".cram"}

ACCEPTED_FORMATS = [FormatType.FASTQ]

# Mirrors readtools' own Illumina/CASAVA read-name pairing detection
# (uk.ac.ebi.ena.readtools.common.reads.CasavaRead / PairedFastqReadsValidator)
_CASAVA_18_HEADER = re.compile(r"^(.+)([ \t]+)([0-9]+):([YN]):([0-9]*[02468])($|:.*$)")
_CASAVA_LIKE_MACHINE_ID = re.compile(
    r"^[a-zA-Z0-9_-]+:[0-9]+:[a-zA-Z0-9_-]+:[0-9]+:[0-9]+:[0-9-]+:[0-9-]+$"
)
_MATE_SUFFIX = re.compile(r"^(.*)[./:_]([1234])$")


def _mate_index(header: str) -> str | None:
    """Best-effort mate number (1, 2, ...) for a FASTQ read header, or None if
    the header doesn't follow a recognizable paired-read naming convention.
    """
    casava_match = _CASAVA_18_HEADER.match(header)
    if casava_match:
        return casava_match.group(3)
    if _CASAVA_LIKE_MACHINE_ID.match(header):
        return None
    suffix_match = _MATE_SUFFIX.match(header)
    return suffix_match.group(2) if suffix_match else None


def _open_text(file_path: str):
    if file_path.endswith(".gz"):
        return gzip.open(file_path, "rt")
    return Path(file_path).open()


def _mixed_mates(file_path: str) -> str | None:
    """Return a description of the mate numbers mixed together in a single
    FASTQ file (e.g. an interleaved file, or one half of a paired submission
    that wasn't properly de-interleaved), or None if at most one mate is present.
    """
    mate_indices: set[str] = set()
    with _open_text(file_path) as f:
        for line_number, line in enumerate(f):
            if line_number % 4 != 0:
                continue
            index = _mate_index(line.rstrip("\n")[1:])
            if index is not None:
                mate_indices.add(index)
    if len(mate_indices) > 1:
        return ", ".join(sorted(mate_indices))
    return None


def _parse_validation_error(log_file_path: Path, error_log_path: Path) -> str:
    """Extract the reason readtools reported RESULT: INVALID.

    readtools prints e.g.
        RESULT: INVALID
          Sequence header must start with @: >seq1 at line 1 in fastq
    to stdout (sometimes as "RESULT: INVALID (file structure / parse error)");
    fall back to stderr if that line is missing.
    """
    stdout_lines = log_file_path.read_text().splitlines()
    for i, line in enumerate(stdout_lines):
        if line.strip().startswith("RESULT: INVALID"):
            details = [
                detail.strip() for detail in stdout_lines[i + 1 :] if detail.strip()
            ]
            if details:
                return "; ".join(details)
            break
    stderr_content = error_log_path.read_text().strip()
    return stderr_content or "File validation failed"


def _has_extension(file: str, extensions: set[str]) -> bool:
    # Path.suffix only returns the last extension, so "reads.fastq.gz" would
    # otherwise never match a multi-part extension like ".fastq.gz".
    return any(file.lower().endswith(extension) for extension in extensions)


def determine_format_type(file_names: list[str]) -> FormatType | None:
    """Determine the shared format of a set of raw reads files from their
    names alone (no download required), or None if they're mixed/unsupported.
    """
    if file_names and all(
        _has_extension(f, ACCEPTED_FASTQ_EXTENSIONS) for f in file_names
    ):
        return FormatType.FASTQ
    if file_names and all(
        _has_extension(f, ACCEPTED_BAM_EXTENSIONS) for f in file_names
    ):
        return FormatType.BAM
    if file_names and all(
        _has_extension(f, ACCEPTED_CRAM_EXTENSIONS) for f in file_names
    ):
        return FormatType.CRAM
    return None


def run_validation(input_files: list[str], data_dir: str) -> Annotation | None:
    format_type = determine_format_type(input_files)
    if format_type is None:
        message = f"Input files have mixed or unsupported formats. Please provide files with consistent and supported formats: {ACCEPTED_FORMATS}, paired-end FASTQ files must be submitted as separate, de-interleaved files."
        logger.error(message)
        return Annotation(
            fileName=",".join(input_files),
            message=message,
        )
    if format_type == FormatType.FASTQ:
        for file in input_files:
            # Readtools handles single interleaved FASTQ files as single non-interleaved FASTQ files.
            # Paired read checks are not performed and confusing error messages may be produced.
            # To avoid this we prevent users from submitting interleaved FASTQ files by checking for mixed mate numbers in the file.
            mixed = _mixed_mates(file)
            if mixed is not None:
                message = (
                    f"File '{Path(file).name}' contains reads from multiple mates "
                    f"(read numbers: {mixed}). Interleaved FASTQ files are not supported; "
                    "please submit paired-end reads as separate, de-interleaved files."
                )
                logger.error(message)
                return Annotation(
                    fileName=Path(file).name,
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
