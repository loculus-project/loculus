import logging
import re
from pathlib import Path
from tempfile import TemporaryDirectory

import requests

from file_processing.config import Config
from file_processing.datatypes import (
    Annotation,
    FileCategory,
    FileIdAndNameAndReadUrl,
    FileName,
    Files,
    RequestWithFiles,
    ValidationResult,
)
from file_processing.file_validation import (
    validate_file_extensions,
    validate_file_numbers,
    validate_with_readtools,
)

logger = logging.getLogger(__name__)


def _sanitize_file_name(name: str) -> str:
    """Strip any directory components from a user-submitted file name so it
    cannot be used to write outside of the intended download directory
    (e.g. via '..' segments or absolute paths).
    """
    candidate = re.split(r"[\\/]", name)[-1].strip()
    # TODO: Backend needs to validate that there's no `.` or `..`
    if not candidate or candidate in {".", ".."}:
        raise ValueError(f"Invalid or unsafe file name: {name!r}")
    return candidate


def download_file(
    config: Config, file: FileIdAndNameAndReadUrl, save_path: Path
) -> Annotation | None:
    # TODO: Retry would be good
    logger.debug(f"Downloading file '{file.name}' from S3 to '{save_path}'")
    try:
        with requests.get(
            file.url, stream=True, timeout=config.s3_request_timeout_seconds
        ) as response:
            response.raise_for_status()
            with save_path.open("wb") as f:
                f.writelines(response.iter_content(chunk_size=1024 * 1024))
    except requests.RequestException as e:
        message = f"Error downloading file '{file.name}' from S3: {e}"
        logger.error(message)
        return Annotation(
            fileName=file.name,
            fileCategory=FileCategory.RAW_READS,
            message=message,
        )
    logger.debug(f"Successfully downloaded file '{file.name}' to '{save_path}'")


def process_submitted_files(
    config: Config,
    file_mapping: RequestWithFiles,
) -> ValidationResult:
    errors: list[Annotation] = []
    result: Files = {}

    logger.debug(
        f"Processing submitted files for accessionVersion: {file_mapping.accessionVersion}"
    )
    for category, files in file_mapping.files.items():
        if not files:
            # Backend always includes a key with empty list for enabled categories
            result[category] = files
            continue
        match category:
            case FileCategory.RAW_READS:
                validation_result = validate_raw_reads_submission(
                    config,
                    files,
                )
                result.update(validation_result.files)
                errors.extend(validation_result.errors or [])
            case _:
                message = f"File category '{category}' is enabled but not supported by preprocessing."
                logger.warning(message)
                errors.append(
                    Annotation(
                        fileName=category,
                        fileCategory=category,
                        message=f"Internal error: {message} Please contact the administrator.",
                    )
                )
                result[category] = files

    # TODO: Put errors on each file instead of returning errors separately from files
    return ValidationResult(files=result, errors=errors)


# TODO: Drop files from ValidationResult to simplify

def validate_raw_reads_submission(
    config: Config,
    files: list[FileIdAndNameAndReadUrl],
) -> ValidationResult:
    logger.debug(f"Validating raw reads submission with {len(files)} files")

    file_format, errors = validate_file_extensions([file.name for file in files])
    if file_format is None:
        return ValidationResult(files={FileCategory.RAW_READS: files}, errors=errors)

    if file_number_errors := validate_file_numbers(
        file_format, [file.name for file in files]
    ):
        errors.append(file_number_errors)
        return ValidationResult(files={FileCategory.RAW_READS: files}, errors=errors)

    with TemporaryDirectory() as tmp_dir:
        local_files: dict[FileName, Path] = {}
        for file in files:
            try:
                safe_name = _sanitize_file_name(file.name)
            except ValueError as e:
                logger.error(str(e))
                errors.append(
                    Annotation(
                        fileName=file.name,
                        fileCategory=FileCategory.RAW_READS,
                        message=f"Invalid file name: {file.name}",
                    )
                )
                continue

            downloaded_file = Path(tmp_dir) / f"{file.fileId}-{safe_name}"
            download_error = download_file(config, file, downloaded_file)
            if download_error:
                errors.append(download_error)
            local_files[file.name] = downloaded_file

        if errors:
            return ValidationResult(
                files={FileCategory.RAW_READS: files}, errors=errors
            )

        if readtools_errors := validate_with_readtools(
            local_files, file_format, config.read_validation_timeout_seconds
        ):
            errors.append(readtools_errors)
            return ValidationResult(
                files={FileCategory.RAW_READS: files}, errors=errors
            )

    return ValidationResult(files={FileCategory.RAW_READS: files}, errors=errors)
