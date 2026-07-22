import logging
from pathlib import Path
from tempfile import TemporaryDirectory

import requests
from file_processing.config import Config
from file_processing.datatypes import (
    Annotation,
    FileCategory,
    FileIdAndNameAndReadUrl,
    Files,
    ResponseWithFiles,
)
from file_processing.deacon import process_deacon_run, run_deacon_filter
from file_processing.file_validation import (
    ACCEPTED_FORMATS,
    determine_format_type,
    run_validation,
)

logger = logging.getLogger(__name__)


def download_file(config: Config, url: str, save_path: Path) -> None:
    with requests.get(
        url, stream=True, timeout=config.backend_request_timeout_seconds
    ) as response:
        response.raise_for_status()
        with save_path.open("wb") as f:
            f.writelines(response.iter_content(chunk_size=1024 * 1024))


def process_submitted_files(
    config: Config,
    file_mapping: Files,
) -> ResponseWithFiles:
    errors: list[Annotation] = []
    warnings: list[Annotation] = []

    for category, files in file_mapping.items():
        if not files:
            # Backend always includes a key with empty list for enabled categories
            continue
        match category:
            case FileCategory.RAW_READS:
                return validate_raw_reads_submission(
                    config,
                    files,
                )
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

    return ResponseWithFiles(files=file_mapping, errors=errors, warnings=warnings)


def validate_raw_reads_submission(
    config: Config,
    files: list[FileIdAndNameAndReadUrl],
) -> ResponseWithFiles:
    errors: list[Annotation] = []
    warnings: list[Annotation] = []

    format_type = determine_format_type([file.name for file in files])
    if format_type not in ACCEPTED_FORMATS:
        errors.append(
            Annotation(
                fileName=", ".join(file.name for file in files),
                fileCategory=FileCategory.RAW_READS,
                message=f"File format: {format_type} is not in the list of accepted formats: {ACCEPTED_FORMATS}. Paired-end FASTQ files must be submitted as separate, de-interleaved files.",
            )
        )
        return ResponseWithFiles(
            files={FileCategory.RAW_READS: files}, errors=errors, warnings=warnings
        )

    with TemporaryDirectory(delete=False) as tmp_dir:
        local_files = []
        for file in files:
            file_name_internal = Path(tmp_dir) / f"{file.fileId}-{file.name}"
            try:
                download_file(config, file.url, file_name_internal)
            except requests.HTTPError as e:
                message = f"Error downloading file '{file.name}' from S3: {e}"
                logger.error(message)
                errors.append(
                    Annotation(
                        fileName=file.name,
                        fileCategory=FileCategory.RAW_READS,
                        message=message,
                    )
                )
                continue
            local_files.append(str(file_name_internal))
        if errors:
            return ResponseWithFiles(
                files={FileCategory.RAW_READS: files}, errors=errors, warnings=warnings
            )
        file_format_validation = run_validation(local_files, tmp_dir)
        if file_format_validation:
            errors.append(file_format_validation)
            return ResponseWithFiles(
                files={FileCategory.RAW_READS: files}, errors=errors, warnings=warnings
            )
        deacon_summary = run_deacon_filter(local_files, tmp_dir, config)
        errors, warnings = process_deacon_run(deacon_summary, files, config)

    return ResponseWithFiles(
        files={FileCategory.RAW_READS: files}, errors=errors, warnings=warnings
    )
