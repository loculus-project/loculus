import itertools
import logging
import os
import statistics
import subprocess  # noqa: S404
import time
from pathlib import Path
from typing import Literal, cast

from Bio.SeqIO.FastaIO import SimpleFastaParser
from Bio.SeqIO.QualityIO import FastqGeneralIterator
from xopen import xopen

from raw_reads_processing.bam_preparation import PreparedBamReads
from raw_reads_processing.config import Config
from raw_reads_processing.datatypes import Annotation, DeaconSummary, FileName
from raw_reads_processing.errors import (
    DECOMPRESSION_ERRORS,
    FALSE_POSITIVE_HINT,
    InvalidSubmission,
    ProcessingFailure,
)

logger = logging.getLogger(__name__)

DEACON_INDEX_PATH = os.environ.get("DEACON_INDEX_PATH", "/data/deacon.idx")


def prepare_deacon_index() -> None:
    if not Path(DEACON_INDEX_PATH).is_file():
        raise RuntimeError(
            f"Deacon index not found at '{DEACON_INDEX_PATH}'. Please ensure the deacon index is mounted at the correct path."
        )


def start_deacon_server() -> subprocess.Popen:
    args = [
        "deacon",
        "server",
        "start",
    ]
    logger.debug("Starting Deacon server")

    return subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)  # noqa: S603


def stop_deacon_server(proc: subprocess.Popen) -> None:
    args = ["deacon", "--use-server", "server", "stop"]
    logger.debug("Stopping Deacon server")

    subprocess.run(  # noqa: S603
        args,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        logger.warning("Failed to stop Deacon server gracefully, sending SIGKILL")
        proc.kill()
        proc.wait()


_READ_LENGTH_SAMPLE_SIZE = 100


def median_read_length(
    path: Path,
    file_name: str,
    sample_size: int = _READ_LENGTH_SAMPLE_SIZE,
    *,
    input_format: Literal["fastq", "fasta"] = "fastq",
) -> float:
    """Median read length over the first `sample_size` reads.

    xopen sniffs compression from the magic bytes, which matters because downloads
    are stored without their original extension.

    Read length should be homogeneous within a sequencing run, so a small sample from
    the start of the file is representative and costs only a few milliseconds.
    """
    try:
        with xopen(path, "rt", threads=0) as fh:
            sequences = (
                (seq for _, seq in SimpleFastaParser(fh))
                if input_format == "fasta"
                else (seq for _, seq, _ in FastqGeneralIterator(fh))
            )
            lengths = [len(seq) for seq in itertools.islice(sequences, sample_size)]
    # A damaged file rather than a malformed record; subclasses ValueError.
    except UnicodeDecodeError as error:
        # The position is an offset into the decoder's chunk, not into the file.
        message = (
            f"File '{file_name}' contains invalid Unicode "
            f"(byte 0x{error.object[error.start]:02x}: {error.reason}). "
            f"{FALSE_POSITIVE_HINT}"
        )
        logger.error(message)
        raise InvalidSubmission(
            Annotation(fileNames=[file_name], message=message)
        ) from error
    # readtools reads only the start of the file, so a stream that ends early
    # further in reaches us intact.
    except tuple(DECOMPRESSION_ERRORS) as error:
        reason = DECOMPRESSION_ERRORS.get(type(error), "could not be decompressed.")
        message = f"File '{file_name}' {reason} {FALSE_POSITIVE_HINT}"
        logger.error(message)
        raise InvalidSubmission(
            Annotation(fileNames=[file_name], message=message)
        ) from error
    except ValueError as error:
        # Otherwise the submitter gets an "Internal error" that blames us for their file.
        message = f"Failed to parse file '{file_name}': {error} {FALSE_POSITIVE_HINT}"
        logger.error(message)
        raise InvalidSubmission(
            Annotation(fileNames=[file_name], message=message)
        ) from error
    if not lengths:
        message = (
            f"Failed to determine median read length for file '{file_name}'. "
            f"File may be empty or corrupted. {FALSE_POSITIVE_HINT}"
        )
        logger.error(message)
        raise InvalidSubmission(Annotation(fileNames=[file_name], message=message))
    return statistics.median(lengths)


def _deacon_a_for_reads(file_name_to_path: dict[FileName, Path], config: Config) -> int:
    """Pick the deacon `-a` k-mer threshold, sampling the first one or two input
    files to decide whether this is a short-read library.
    """
    observed_length = min(
        [
            median_read_length(path, file_name)
            for file_name, path in file_name_to_path.items()
        ],
        default=0.0,
    )
    return _deacon_a_for_length(observed_length, config)


def _deacon_a_for_length(observed_length: float, config: Config) -> int:
    short_reads = observed_length < config.short_reads_threshold
    deacon_a = config.deacon_a_short_reads if short_reads else config.deacon_a
    logger.info(
        f"Median read length ~{observed_length:.0f}bp "
        f"({'short' if short_reads else 'normal'}-read deacon params: -a {deacon_a})"
    )
    return deacon_a


def run_deacon_filter(
    file_name_to_path: dict[FileName, Path], data_dir: str, config: Config
) -> DeaconSummary:
    summary_json_path = Path(data_dir) / "summary.json"
    deacon_a = _deacon_a_for_reads(file_name_to_path, config)
    args = [
        "deacon",
        "--use-server",
        "filter",
        "--summary",
        summary_json_path,
        "-a",
        str(deacon_a),
        "-r",
        str(config.deacon_r),
        DEACON_INDEX_PATH,
        *file_name_to_path.values(),
    ]
    logger.debug(
        f"Running Deacon filter on '{', '.join(str(f) for f in file_name_to_path.keys())}': {args}"
    )

    try:
        subprocess.run(  # noqa: S603
            args,
            check=True,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=config.deacon_filter_timeout_seconds,
        )
        return DeaconSummary.from_json(summary_json_path)
    except subprocess.TimeoutExpired:
        message = (
            f"Validation of files '{','.join(str(f) for f in file_name_to_path.values())}' "
            f"timed out after {config.deacon_filter_timeout_seconds} seconds."
        )
        logger.error(message)
        raise ProcessingFailure(message) from None
    except subprocess.CalledProcessError as error:
        # TODO: send a slack notification to alert the team that deacon is failing
        message = f"Deacon filter failed with exit code {error.returncode}."
        logger.error(message + f" stdout: {error.stdout} stderr: {error.stderr}")
        raise ProcessingFailure(message) from error


def _run_deacon_filter(
    paths: tuple[Path, ...],
    file_names: list[FileName],
    summary_json_path: Path,
    deacon_a: int,
    config: Config,
    *,
    timeout_seconds: float,
) -> DeaconSummary:
    args = [
        "deacon",
        "--use-server",
        "filter",
        "--summary",
        summary_json_path,
        "--output",
        os.devnull,
        "-a",
        str(deacon_a),
        "-r",
        str(config.deacon_r),
        DEACON_INDEX_PATH,
        *paths,
    ]
    logger.debug(f"Running Deacon filter on '{', '.join(file_names)}': {args}")

    try:
        subprocess.run(  # noqa: S603
            args,
            check=True,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
        )
        return DeaconSummary.from_json(summary_json_path)
    except subprocess.TimeoutExpired:
        message = _deacon_timeout_message(file_names, config)
        logger.error(message)
        raise ProcessingFailure(message) from None
    except subprocess.CalledProcessError as error:
        # TODO: send a slack notification to alert the team that deacon is failing
        message = (
            f"Deacon filter failed for files '{','.join(file_names)}' "
            f"with exit code {error.returncode}."
        )
        logger.error(message + f" stdout: {error.stdout} stderr: {error.stderr}")
        raise ProcessingFailure(message) from error
    except (OSError, ValueError, TypeError) as error:
        message = (
            f"Could not complete Deacon screening for files '{','.join(file_names)}'."
        )
        logger.error("%s %s", message, error)
        raise ProcessingFailure(message) from error


def _deacon_timeout_message(file_names: list[FileName], config: Config) -> str:
    return (
        f"Validation of files '{','.join(file_names)}' "
        f"timed out after {config.deacon_filter_timeout_seconds} seconds."
    )


def _remaining_deacon_time(
    deadline: float, file_names: list[FileName], config: Config
) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ProcessingFailure(_deacon_timeout_message(file_names, config))
    return remaining


# TODO: Add a link to the documentation for removing host reads
DEACON_ERROR_PROMPT = (
    "We cannot accept files with a high proportion of human reads, as they may contain "
    "sensitive human genetic information. Please remove host reads from your data and resubmit. "
    "Please see our documentation for more information on how to remove host reads from your data."
)


def deacon_message() -> str:
    intro = "Our QC pipeline identified reads that map to the human genome. "
    prompt = DEACON_ERROR_PROMPT
    return intro + prompt


def log_deacon_summary(deacon_summary: DeaconSummary, config: Config) -> None:
    reads_ok = deacon_summary.seqs_out_proportion <= cast(
        float, config.deacon_max_host_reads_proportion
    )
    bp_ok = deacon_summary.bp_out <= cast(int, config.deacon_max_host_bp)
    status = "passed" if reads_ok and bp_ok else "failed"

    logger.info(
        f"Deacon filter {status} in {deacon_summary.time:.2f}s: "
        f"reads {deacon_summary.seqs_out}/{deacon_summary.seqs_in} "
        f"({deacon_summary.seqs_out_proportion:.2%}, "
        f"threshold {config.deacon_max_host_reads_proportion:.2%}) "
        f"[{'OK' if reads_ok else 'EXCEEDED'}], "
        f"bp {deacon_summary.bp_out}/{deacon_summary.bp_in} "
        f"({deacon_summary.bp_out_proportion:.2%}, "
        f"threshold {config.deacon_max_host_bp} bp) "
        f"[{'OK' if bp_ok else 'EXCEEDED'}] mapped to the human genome."
    )


def validate_with_deacon(files: dict[FileName, Path], data_dir: str, config: Config):
    deacon_summary = run_deacon_filter(
        files,
        data_dir=data_dir,
        config=config,
    )
    _validate_deacon_summary(deacon_summary, list(files), config)


def validate_bam_with_deacon(
    prepared: PreparedBamReads, data_dir: str, config: Config
) -> None:
    """Screen all batches and apply QC thresholds to their combined counts."""
    deadline = time.monotonic() + config.deacon_filter_timeout_seconds
    file_names = [prepared.original_file_name]
    if (
        not prepared.batches
        or prepared.read_count <= 0
        or any(
            batch.read_count <= 0 or len(batch.paths) not in (1, 2)
            for batch in prepared.batches
        )
    ):
        raise ProcessingFailure(
            f"No complete read batches were prepared for BAM file '{prepared.original_file_name}'."
        )
    if sum(batch.read_count for batch in prepared.batches) != prepared.read_count:
        raise ProcessingFailure(
            f"Prepared read counts do not match BAM file '{prepared.original_file_name}'."
        )

    observed_lengths = []
    for batch in prepared.batches:
        for path in batch.paths:
            _remaining_deacon_time(deadline, file_names, config)
            observed_lengths.append(
                median_read_length(
                    path, prepared.original_file_name, input_format="fasta"
                )
            )
    deacon_a = _deacon_a_for_length(min(observed_lengths), config)
    summaries = []
    for index, batch in enumerate(prepared.batches):
        summary = _run_deacon_filter(
            batch.paths,
            file_names,
            Path(data_dir) / f"bam-summary-{index}.json",
            deacon_a,
            config,
            timeout_seconds=_remaining_deacon_time(deadline, file_names, config),
        )
        if summary.seqs_in != batch.read_count or summary.bp_in <= 0:
            raise ProcessingFailure(
                f"Deacon did not screen all prepared reads for BAM file '{prepared.original_file_name}'."
            )
        _remaining_deacon_time(deadline, file_names, config)
        summaries.append(summary)

    seqs_in = sum(summary.seqs_in for summary in summaries)
    seqs_out = sum(summary.seqs_out for summary in summaries)
    bp_in = sum(summary.bp_in for summary in summaries)
    bp_out = sum(summary.bp_out for summary in summaries)
    deacon_summary = DeaconSummary(
        time=sum(summary.time for summary in summaries),
        seqs_in=seqs_in,
        seqs_out=seqs_out,
        seqs_out_proportion=seqs_out / seqs_in,
        bp_in=bp_in,
        bp_out=bp_out,
        bp_out_proportion=bp_out / bp_in,
    )
    _validate_deacon_summary(deacon_summary, file_names, config)


def _validate_deacon_summary(
    deacon_summary: DeaconSummary, file_names: list[FileName], config: Config
) -> None:
    log_deacon_summary(deacon_summary, config)

    if deacon_summary.seqs_out_proportion > cast(
        float, config.deacon_max_host_reads_proportion
    ) or deacon_summary.bp_out > cast(int, config.deacon_max_host_bp):
        raise InvalidSubmission(
            Annotation(
                fileNames=file_names,
                message=deacon_message(),
            )
        )
