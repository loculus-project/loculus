import logging
from pathlib import Path
from tempfile import TemporaryDirectory

from file_processing.errors import ProcessingFailure
import requests

from file_processing.config import Config
from file_processing.datatypes import (
    Annotation,
    FileCategory,
    FileIdAndNameAndReadUrl,
    FileName,
    RequestWithFiles,
)
from file_processing.file_validation import (
    validate_file_extensions,
    validate_file_numbers,
    validate_with_readtools,
)

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
        raise ProcessingFailure(message)
    logger.debug(f"Successfully downloaded file '{file.name}' to '{save_path}'")


def process_submitted_files(
    config: Config,
    file_mapping: RequestWithFiles,
) -> None:
    logger.debug(
        f"Processing submitted files for accessionVersion: {file_mapping.accessionVersion}"
    )
    for category, files in file_mapping.files.items():
        if not files:
            # Backend always includes a key with empty list for enabled categories
            continue
        match category:
            case FileCategory.RAW_READS:
                validate_raw_reads_submission(
                    config,
                    files,
                )
            case _:
                message = f"File category '{category}' is enabled but not supported by preprocessing."
                logger.warning(message)
                raise ProcessingFailure(
                    message,
                )

    return None


def validate_raw_reads_submission(
    config: Config,
    files: list[FileIdAndNameAndReadUrl],
) -> None:
    logger.debug(f"Validating raw reads submission with {len(files)} files")

    file_format = validate_file_extensions([file.name for file in files])
    validate_file_numbers(file_format, [file.name for file in files])

    with TemporaryDirectory() as tmp_dir:
        local_files: dict[FileName, Path] = {}
        for file in files:
            downloaded_file_path = Path(tmp_dir) / f"{file.fileId}"
            download_file(config, file, downloaded_file_path)
            local_files[file.name] = downloaded_file_path

        validate_with_readtools(
            local_files, file_format, config.read_validation_timeout_seconds
        )

    return None
