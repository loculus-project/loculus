from collections.abc import Sequence
from enum import StrEnum

# Keep suffixes in sync with raw-reads-processing/file_format_validation.py.
ACCEPTED_FASTQ_EXTENSIONS = (".fastq.gz", ".fq.gz")
ACCEPTED_RAW_READS_EXTENSIONS = (*ACCEPTED_FASTQ_EXTENSIONS, ".bam")


class RawReadsFormat(StrEnum):
    FASTQ = "FASTQ"
    BAM = "BAM"


def canonical_raw_reads_extension(file_name: str) -> str:
    """Webin-CLI requires lower-case suffixes."""
    lowered = file_name.lower()
    for extension in ACCEPTED_RAW_READS_EXTENSIONS:
        if lowered.endswith(extension):
            return extension
    msg = (
        f"Raw read file '{file_name}' does not end in an accepted extension "
        f"({', '.join(ACCEPTED_RAW_READS_EXTENSIONS)})"
    )
    raise ValueError(msg)


def raw_reads_format(file_names: Sequence[str]) -> RawReadsFormat:
    if not file_names:
        msg = "No raw read files provided"
        raise ValueError(msg)
    extensions = [canonical_raw_reads_extension(name) for name in file_names]
    if ".bam" in extensions:
        if len(extensions) != 1:
            msg = "A BAM submission must contain exactly one BAM and no other raw read files"
            raise ValueError(msg)
        return RawReadsFormat.BAM
    if len(extensions) > 2:  # noqa: PLR2004
        msg = "A FASTQ submission must contain one or two files"
        raise ValueError(msg)
    return RawReadsFormat.FASTQ
