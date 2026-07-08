import logging
import os
import subprocess
from tempfile import TemporaryDirectory

from requests import HTTPError

from loculus_preprocessing.backend import download_file
from loculus_preprocessing.config import Config
from loculus_preprocessing.datatypes import (
    AnnotationSourceType,
    DeaconSummary,
    FileCategory,
    FileIdAndNameAndReadUrl,
    ProcessingAnnotation,
)
from loculus_preprocessing.processing_functions import _internal_error_message

logger = logging.getLogger(__name__)


# TODO: pass Config here as well (backend_request_timeout_seconds, host read proportion)
def process_submitted_files(
    config: Config,
    file_mapping: dict[FileCategory, list[FileIdAndNameAndReadUrl]],
) -> tuple[list[ProcessingAnnotation], list[ProcessingAnnotation]]:
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []

    for category, files in file_mapping.items():
        if not files:
            # Backend always includes a key with empty list for enabled categories
            continue
        match category:
            case FileCategory.RAW_READS:
                rr_errors, rr_warnings = validate_raw_reads_submission(config, files, 0.05)
                errors.extend(rr_errors)
                warnings.extend(rr_warnings)
            case _:
                message = (
                    f"File category '{category}' is enabled but not supported by preprocessing."
                )
                logger.warning(message)
                errors.append(
                    ProcessingAnnotation.from_single(
                        name=category,
                        type=AnnotationSourceType.FILE,
                        message=f"Internal error: {message} Please contact the administrator.",
                    )
                )

    return errors, warnings


def validate_raw_reads_submission(
    config: Config,
    files: list[FileIdAndNameAndReadUrl],
    max_host_proportion: float,
) -> tuple[list[ProcessingAnnotation], list[ProcessingAnnotation]]:
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []

    if len(files) > 2:  # noqa: PLR2004
        message = (
            f"Received {len(files)} for raw reads upload. Please submit raw reads as one "
            "or two FASTQ files containing raw single-end or paired-end reads."
        )
        errors.append(
            ProcessingAnnotation.from_fields(
                input_fields=[f.name for f in files],
                output_fields=[f.name for f in files],
                type=AnnotationSourceType.FILE,
                message=message,
            )
        )

    allowed_extensions = [".fastq", ".fastq.gz", ".fq", ".fq.gz"]
    for file in files:
        if not any(file.name.endswith(extension) for extension in allowed_extensions):
            message = (
                f"Raw reads file '{file.name}' has unrecognized extension."
                f" Allowed extensions: {', '.join(allowed_extensions)}"
            )
            errors.append(
                ProcessingAnnotation.from_single(
                    name=file.name, type=AnnotationSourceType.FILE, message=message
                )
            )

    with TemporaryDirectory() as tmp_dir:
        for file in files:
            if (url := file.url) is None:
                message = f"Cannot download file '{file.name}': preprocessing did not receive a URL"
                errors.append(
                    ProcessingAnnotation.from_single(
                        name=file.name, type=AnnotationSourceType.FILE, message=message
                    )
                )
                continue
            file_name_internal = os.path.join(tmp_dir, file.fileId)
            try:
                download_file(config, url, file_name_internal)
            except HTTPError as e:
                logger.error(f"Error downloading file '{file.name}' from S3: {e}")
            summary_json = os.path.join(tmp_dir, f"{file.fileId}_summary.json")
            deacon_summary = run_deacon(file_name_internal, summary_json)
            if deacon_summary.seqs_removed_proportion > (1.0 - max_host_proportion):
                message = f"File {file.name} (id: {file.fileId}) had "
                errors.append(
                    ProcessingAnnotation.from_single(
                        name=file.name, type=AnnotationSourceType.FILE, message=message
                    )
                )

    return errors, warnings


def run_deacon(input_file: str, summary_json: str):
    index = ""
    args = [
        "deacon",
        "filter",
        "--threads",
        1,
        "--summary",
        summary_json,
        index,
        input_file,
        "2> /dev/null",
    ]

    logger.debug(f"Checking for host sequences in raw read file {input_file}: {' '.join(args)}")

    exit_code = subprocess.run(args, check=False).returncode  # noqa: S603
    if exit_code != 0:
        msg = f"deacon filter failed with exit code {exit_code}"
        raise Exception(msg)

    return DeaconSummary.from_json(summary_json)
