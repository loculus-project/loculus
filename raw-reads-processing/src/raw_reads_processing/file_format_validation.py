import gzip
import logging
import os
import subprocess  # noqa: S404
import zlib
from enum import StrEnum
from pathlib import Path

from raw_reads_processing.datatypes import Annotation, FileName
from raw_reads_processing.errors import InvalidSubmission, ProcessingFailure

logger = logging.getLogger(__name__)

VALIDATION_JAR_PATH = os.environ.get("READTOOLS_JAR", "/opt/app/lib/readtools.jar")


class FileFormat(StrEnum):
    FASTQ = "FASTQ"
    BAM = "BAM"
    CRAM = "CRAM"


# Raw reads must be uploaded gzip-compressed: ENA requires compressed FASTQ anyway, and
# accepting a single compression format keeps what we store uniform and cheap to serve.
# Keep in sync with ACCEPTED_FASTQ_EXTENSIONS in
# ena-submission/src/ena_deposition/call_loculus.py
ACCEPTED_FASTQ_EXTENSIONS = (".fastq.gz", ".fq.gz")
ACCEPTED_BAM_EXTENSIONS = (".bam", ".sam")
ACCEPTED_CRAM_EXTENSIONS = (".cram",)

EXTENSIONS_BY_FORMAT = {
    FileFormat.FASTQ: ACCEPTED_FASTQ_EXTENSIONS,
    FileFormat.BAM: ACCEPTED_BAM_EXTENSIONS,
    FileFormat.CRAM: ACCEPTED_CRAM_EXTENSIONS,
}

# Uncompressed FASTQ used to be accepted, so it is worth its own error message rather
# than the generic "not an accepted format" one.
UNCOMPRESSED_FASTQ_EXTENSIONS = (".fastq", ".fq")

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
            return f"File validation failed while running ENA readtools with error: {stderr.strip()[:40]}..."
        return "File validation failed while running ENA readtools."

    details = stdout[marker_pos:].partition("\n")[2]
    details = "; ".join(filter(None, map(str.strip, details.splitlines())))
    return f"File validation failed while running ENA readtools. {details}".rstrip()


def _has_extension(file: str, extensions: tuple[str, ...]) -> bool:
    # Path.suffix only returns the last extension, so "reads.fastq.gz" would
    # otherwise never match a multi-part extension like ".fastq.gz".
    return any(file.lower().endswith(extension) for extension in extensions)


def determine_file_format(file_name: str) -> FileFormat | None:
    """Determine the shared format of a set of raw reads files from their
    names alone (no download required).
    """
    if not file_name:
        return None
    for file_format, extensions in EXTENSIONS_BY_FORMAT.items():
        if _has_extension(file_name, extensions):
            return file_format
    return None


def _accepted_extensions(accepted_formats: list[FileFormat]) -> str:
    return ", ".join(
        extension
        for file_format in accepted_formats
        for extension in EXTENSIONS_BY_FORMAT[file_format]
    )


def validate_file_extensions(
    file_names: list[FileName],
    accepted_formats: list[FileFormat] = ACCEPTED_FORMATS,
) -> FileFormat:
    """Validate that all files have extensions consistent with the accepted formats."""
    paired_end_info = (
        "Paired-end FASTQ files must be submitted as separate, de-interleaved files."
    )
    # Checked before the generic branches below so that a plain ".fastq" is told to
    # gzip itself rather than that it has an unknown format or mixes formats.
    uncompressed = [
        file_name
        for file_name in file_names
        if _has_extension(file_name, UNCOMPRESSED_FASTQ_EXTENSIONS)
    ]
    if uncompressed and FileFormat.FASTQ in accepted_formats:
        raise InvalidSubmission(
            error=Annotation(
                fileNames=uncompressed,
                message=(
                    "Raw reads must be gzip-compressed. Please compress "
                    f"{', '.join(uncompressed)} with gzip and upload as "
                    f"{_accepted_extensions([FileFormat.FASTQ])}."
                ),
            )
        )
    file_formats = {determine_file_format(file_name) for file_name in file_names}
    if len(file_formats) > 1:
        raise InvalidSubmission(
            error=Annotation(
                fileNames=file_names,
                message=(
                    "Input files have mixed formats. Please provide files with consistent and "
                    f"supported formats: {', '.join(accepted_formats)} "
                    f"{paired_end_info}"
                ),
            )
        )
    file_format = file_formats.pop()
    if file_format not in accepted_formats or file_format is None:
        raise InvalidSubmission(
            error=Annotation(
                fileNames=file_names,
                message=(
                    "File is not in accepted format. Accepted file extensions: "
                    f"{_accepted_extensions(accepted_formats)}. "
                    f"{paired_end_info}"
                ),
            )
        )
    return file_format


def validate_file_numbers(file_format: FileFormat, file_names: list[FileName]) -> None:
    """Validate the number of files submitted conforms to
    the expected number for the given file format."""
    if file_format == FileFormat.FASTQ and len(file_names) > 2:  # noqa: PLR2004
        # ENA's readtools.jar actually allows more than 2 FASTQ files,
        # but it treats every 1+i file as a paired read of the first file.
        # ENA documents that multi-FASTQs should be submitted using a JSON manifest,
        # which we don't support, so we enforce a stricter limit here.
        raise InvalidSubmission(
            error=Annotation(
                fileNames=file_names,
                message=(
                    f"Too many FASTQ files submitted ({len(file_names)}). We only allow"
                    " 1 FASTQ file for single-end reads or 2 FASTQ files for paired-end reads."
                ),
            )
        )
    if file_format in {FileFormat.BAM, FileFormat.CRAM} and len(file_names) > 1:
        raise InvalidSubmission(
            error=Annotation(
                fileNames=file_names,
                message=(
                    f"Too many {file_format.value.upper()} files submitted ({len(file_names)})."
                    f" We only allow 1 {file_format.value.upper()} file per submission."
                ),
            )
        )


GZIP_MAGIC = b"\x1f\x8b"

_FALSE_POSITIVE_HINT = (
    "If you believe this file is valid, please contact the administrators."
)
_DECOMPRESSION_ERRORS = {
    gzip.BadGzipFile: "is named as gzip-compressed but is not a valid gzip file.",
    EOFError: "appears to be truncated - the gzip stream ends early.",
    zlib.error: "appears to be corrupt - its compressed data could not be read.",
}


def _is_gzip(path: Path) -> bool:
    with path.open("rb") as f:
        return f.read(2) == GZIP_MAGIC


def validate_compression(
    file_name_to_path: dict[FileName, Path], file_format: FileFormat
) -> None:
    """Check each file really is gzip-compressed, exactly once.

    Extension validation has already required a `.gz` name; readtools decides compression
    from the content and would happily accept a mislabelled file, so the two have to be
    confirmed to agree here.
    """
    # FASTQ only: BAM is BGZF, i.e. a valid gzip stream, but `.bam` carries no `.gz`.
    if file_format != FileFormat.FASTQ:
        return

    for file_name, path in file_name_to_path.items():
        if not _is_gzip(path):
            raise InvalidSubmission(
                error=Annotation(
                    fileNames=[file_name],
                    message=(
                        f"File '{file_name}' is named as gzip-compressed but its contents "
                        "are not gzip-compressed. Please gzip-compress it before uploading."
                    ),
                )
            )
        try:
            with gzip.open(path, "rb") as f:
                inner_is_gzip = f.read(2) == GZIP_MAGIC
        # Only these three mean the submitter's file is bad; anything else (a missing
        # temp file, a disk error) is ours and must not be blamed on them.
        except (gzip.BadGzipFile, EOFError, zlib.error) as error:
            logger.exception("Could not decompress '%s'", file_name)
            reason = _DECOMPRESSION_ERRORS.get(
                type(error), "could not be decompressed."
            )
            raise InvalidSubmission(
                error=Annotation(
                    fileNames=[file_name],
                    message=f"File '{file_name}' {reason} {_FALSE_POSITIVE_HINT}",
                )
            ) from error
        if inner_is_gzip:
            raise InvalidSubmission(
                error=Annotation(
                    fileNames=[file_name],
                    message=(
                        f"File '{file_name}' is gzip-compressed more than once. "
                        "Please compress it exactly once."
                    ),
                )
            )


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
        message = (
            f"Validation of files '{','.join(file_names)}' "
            f"timed out after {timeout_seconds} seconds."
        )
        logger.error(message)
        raise ProcessingFailure(message) from None
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
        ) from error
