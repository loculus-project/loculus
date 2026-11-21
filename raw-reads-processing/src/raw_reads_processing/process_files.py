import logging
from pathlib import Path
from tempfile import TemporaryDirectory

import requests
from urllib3.exceptions import HTTPError as Urllib3HTTPError

from raw_reads_processing.bam_preparation import prepare_bam_for_deacon
from raw_reads_processing.config import Config
from raw_reads_processing.datatypes import (
    FileIdAndNameAndReadUrl,
    FileName,
    RequestWithFiles,
)
from raw_reads_processing.deacon import validate_bam_with_deacon, validate_with_deacon
from raw_reads_processing.deadline import ProcessingDeadline
from raw_reads_processing.errors import ProcessingFailure
from raw_reads_processing.file_format_validation import (
    FileFormat,
    validate_compression,
    validate_file_extensions,
    validate_file_numbers,
    validate_with_readtools,
)

logger = logging.getLogger(__name__)


def download_file(
    config: Config,
    file: FileIdAndNameAndReadUrl,
    save_path: Path,
    deadline: ProcessingDeadline,
) -> None:
    logger.debug(f"Downloading file '{file.name}' from S3 to '{save_path}'")
    try:
        with requests.get(
            file.url,
            stream=True,
            timeout=deadline.remaining(config.s3_request_timeout_seconds),
        ) as response:
            response.raise_for_status()
            with save_path.open("wb") as f:
                while True:
                    deadline.remaining()
                    # read1 returns available bytes instead of waiting for a full chunk.
                    chunk = response.raw.read1(1024 * 1024, decode_content=True)
                    deadline.remaining()
                    if not chunk:
                        break
                    f.write(chunk)
        deadline.remaining()
    except (requests.RequestException, Urllib3HTTPError) as e:
        message = f"Error downloading file '{file.name}' from S3: {e}"
        logger.error(message)
        raise ProcessingFailure(message) from e
    logger.debug(f"Successfully downloaded file '{file.name}' to '{save_path}'")


def validate_raw_reads_submission(
    config: Config,
    request_with_files: RequestWithFiles,
) -> None:
    deadline = ProcessingDeadline(config.processing_timeout_seconds)
    files = request_with_files.files
    logger.debug(
        "Validating raw reads submission for "
        f"accessionVersion: {request_with_files.accessionVersion}"
    )

    file_format = validate_file_extensions([file.name for file in files])
    validate_file_numbers(file_format, [file.name for file in files])

    try:
        with TemporaryDirectory() as tmp_dir:
            local_files: dict[FileName, Path] = {}
            for file in files:
                downloaded_file_path = Path(tmp_dir) / f"{file.fileId}"
                download_file(config, file, downloaded_file_path, deadline)
                local_files[file.name] = downloaded_file_path

            validate_compression(local_files, file_format)
            validate_with_readtools(
                local_files,
                file_format,
                deadline.remaining(config.read_validation_timeout_seconds),
            )
            deadline.remaining()
            if file_format == FileFormat.BAM:
                file_name, bam_path = next(iter(local_files.items()))
                prepared = prepare_bam_for_deacon(
                    file_name,
                    bam_path,
                    Path(tmp_dir),
                    deadline.remaining(config.bam_preparation_timeout_seconds),
                )
                validate_bam_with_deacon(prepared, tmp_dir, config, deadline)
            else:
                validate_with_deacon(local_files, tmp_dir, config, deadline)
            deadline.remaining()
    except ProcessingFailure:
        deadline.remaining()
        raise
