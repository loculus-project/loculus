import logging

from loculus_preprocessing.datatypes import (
    AnnotationSourceType,
    FileCategory,
    FileIdAndName,
    ProcessingAnnotation,
)

logger = logging.getLogger(__name__)


def process_submitted_files(
    file_mapping: dict[FileCategory, list[FileIdAndName]],
) -> tuple[list[ProcessingAnnotation], list[ProcessingAnnotation]]:
    errors: list[ProcessingAnnotation] = []
    warnings: list[ProcessingAnnotation] = []

    for category, files in file_mapping.items():
        if not files:
            # Backend always includes a key with empty list for enabled categories
            continue
        match category:
            case FileCategory.RAW_READS:
                rr_errors, rr_warnings = validate_raw_reads_submission(files)
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
    files: list[FileIdAndName],
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

    return errors, warnings
