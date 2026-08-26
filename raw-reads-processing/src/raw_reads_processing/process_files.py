import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory

import requests
from raw_reads_processing.config import Config
from raw_reads_processing.datatypes import (
    Annotation,
    FileIdAndNameAndReadUrl,
    FileName,
    RequestWithFiles,
)
from raw_reads_processing.errors import ProcessingFailure
from raw_reads_processing.file_format_validation import (
    validate_file_extensions,
    validate_file_numbers,
    validate_with_readtools,
)
from raw_reads_processing.deacon import validate_with_deacon

logger = logging.getLogger(__name__)


def download_file(
    config: Config, file: FileIdAndNameAndReadUrl, save_path: Path
) -> Annotation | None:
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
        raise ProcessingFailure(message) from e
    logger.debug(f"Successfully downloaded file '{file.name}' to '{save_path}'")


def download_files(
    config: Config, files: list[FileIdAndNameAndReadUrl], target_dir: Path
) -> dict[FileName, Path]:
    """Download all files of a submission into target_dir, both mates at the same time"""
    with ThreadPoolExecutor(
        max_workers=max(1, len(files)), thread_name_prefix="s3-download"
    ) as pool:
        futures = [
            pool.submit(download_file, config, file, target_dir / f"{file.fileId}")
            for file in files
        ]
        # Wait for every download, so that a failing one is not raised while the other
        # is still writing into target_dir.
        errors = [future.exception() for future in futures]

    for error in errors:
        if error is not None:
            raise error

    return {file.name: target_dir / f"{file.fileId}" for file in files}


def validate_raw_reads_submission(
    config: Config,
    request_with_files: RequestWithFiles,
) -> None:
    files = request_with_files.files
    logger.debug(
        "Validating raw reads submission for "
        f"accessionVersion: {request_with_files.accessionVersion}"
    )

    file_format = validate_file_extensions([file.name for file in files])
    validate_file_numbers(file_format, [file.name for file in files])

    with TemporaryDirectory() as tmp_dir:
        local_files = download_files(config, files, Path(tmp_dir))

        validate_with_readtools(
            local_files, file_format, config.read_validation_timeout_seconds
        )
        validate_with_deacon(local_files, tmp_dir, config)
