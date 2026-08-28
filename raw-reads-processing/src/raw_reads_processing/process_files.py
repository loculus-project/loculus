import logging
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
from raw_reads_processing.deacon import DeaconFilter, validate_with_deacon
from raw_reads_processing.errors import InvalidSubmission, ProcessingFailure
from raw_reads_processing.file_format_validation import (
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
            written = 0
            with save_path.open("wb") as f:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    written += len(chunk)
                    # Stop as soon as the cap is passed rather than after writing the
                    # whole file: this bound is what replaces the deacon filter timeout,
                    # and it also keeps an oversized upload off the pod's disk.
                    if written > config.max_input_file_bytes:
                        raise InvalidSubmission(
                            Annotation(
                                fileNames=[file.name],
                                message=(
                                    f"File '{file.name}' is larger than the maximum accepted size of "
                                    f"{config.max_input_file_bytes} bytes. Please split the submission "
                                    "into smaller files."
                                ),
                            )
                        )
                    f.write(chunk)
    except requests.RequestException as e:
        message = f"Error downloading file '{file.name}' from S3: {e}"
        logger.error(message)
        raise ProcessingFailure(message) from e
    logger.debug(f"Successfully downloaded file '{file.name}' to '{save_path}'")


def validate_raw_reads_submission(
    config: Config,
    deacon_filter: DeaconFilter,
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
        local_files: dict[FileName, Path] = {}
        for file in files:
            downloaded_file_path = Path(tmp_dir) / f"{file.fileId}"
            download_file(config, file, downloaded_file_path)
            local_files[file.name] = downloaded_file_path

        validate_with_readtools(
            local_files, file_format, config.read_validation_timeout_seconds
        )
        validate_with_deacon(deacon_filter, local_files, config)
