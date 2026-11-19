import itertools
import logging
import os
import re
import statistics
import subprocess
from pathlib import Path
from typing import cast

from Bio.SeqIO.QualityIO import FastqGeneralIterator
from xopen import xopen

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

    return subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def stop_deacon_server(proc: subprocess.Popen) -> None:
    args = ["deacon", "--use-server", "server", "stop"]
    logger.debug("Stopping Deacon server")

    subprocess.run(
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
    path: Path, file_name: str, sample_size: int = _READ_LENGTH_SAMPLE_SIZE
) -> float:
    """Median read length over the first `sample_size` reads.

    xopen sniffs compression from the magic bytes, which matters because downloads
    are stored without their original extension.

    Read length should be homogeneous within a sequencing run, so a small sample from
    the start of the file is representative and costs only a few milliseconds.
    """
    try:
        with xopen(path, "rt", threads=0) as fh:
            lengths = [
                len(seq)
                for _, seq, _ in itertools.islice(FastqGeneralIterator(fh), sample_size)
            ]
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
    # Without -o deacon writes every matching read to stdout, which
    # capture_output would hold in memory.
    host_reads_path = (
        Path(data_dir) / HOST_READS_FILE_NAME
        if config.deacon_measure_host_breadth
        else Path(os.devnull)
    )
    deacon_a = _deacon_a_for_reads(file_name_to_path, config)
    args = [
        "deacon",
        "--use-server",
        "filter",
        "--summary",
        summary_json_path,
        "-o",
        host_reads_path,
        "-a",
        str(deacon_a),
        "-r",
        str(config.deacon_r),
        DEACON_INDEX_PATH,
        *file_name_to_path.values(),
    ]
    logger.debug(
        f"Running Deacon filter on '{', '.join(str(f) for f in file_name_to_path)}': {args}"
    )

    try:
        subprocess.run(
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


HOST_READS_FILE_NAME = "host_reads.fastq.zst"

_MINIMIZER_COUNT = re.compile(r"Distinct minimizer count:\s*(\d+)")
_INDEX_PARAMETER = {
    "k": re.compile(r"\(k\):\s*(\d+)"),
    "w": re.compile(r"\(w\):\s*(\d+)"),
}


def _deacon_index_info(index_path: Path | str, timeout: int) -> str:
    # deacon prints the index information on stderr.
    return subprocess.run(
        ["deacon", "index", "info", str(index_path)],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    ).stdout


def _parse_index_info(pattern: re.Pattern, info: str) -> int:
    match = pattern.search(info)
    if match is None:
        msg = f"Could not find {pattern.pattern!r} in deacon index info: {info!r}"
        raise ValueError(msg)
    return int(match.group(1))


def measure_host_breadth(data_dir: str, config: Config) -> int | None:
    """Number of distinct host-index minimizers found in the reads deacon matched.

    `bp_out` counts depth: 50 reads from one locus and 50 reads from 50 loci score
    the same. This counts each host minimizer once, so it tracks how much of the
    host genome the reads cover. Intersecting with the host index also drops
    minimizers that only exist because of sequencing errors.

    Diagnostic only, so any failure is logged and swallowed.
    """
    host_reads_path = Path(data_dir) / HOST_READS_FILE_NAME
    reads_index_path = Path(data_dir) / "host_reads.idx"
    intersection_path = Path(data_dir) / "host_reads_intersection.idx"
    timeout = config.deacon_filter_timeout_seconds
    try:
        host_index_info = _deacon_index_info(DEACON_INDEX_PATH, timeout)
        subprocess.run(
            [
                "deacon",
                "index",
                "build",
                "-k",
                str(_parse_index_info(_INDEX_PARAMETER["k"], host_index_info)),
                "-w",
                str(_parse_index_info(_INDEX_PARAMETER["w"], host_index_info)),
                "-o",
                str(reads_index_path),
                str(host_reads_path),
            ],
            check=True,
            capture_output=True,
            timeout=timeout,
        )
        # Loads the host index a second time, outside the deacon server.
        subprocess.run(
            [
                "deacon",
                "index",
                "intersect",
                "-o",
                str(intersection_path),
                str(reads_index_path),
                DEACON_INDEX_PATH,
            ],
            check=True,
            capture_output=True,
            timeout=timeout,
        )
        return _parse_index_info(
            _MINIMIZER_COUNT, _deacon_index_info(intersection_path, timeout)
        )
    except (subprocess.SubprocessError, OSError, ValueError) as error:
        stderr = getattr(error, "stderr", None)
        logger.warning(f"Could not measure host breadth: {error} stderr: {stderr!r}")
        return None


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
    log_deacon_summary(deacon_summary, config)
    if config.deacon_measure_host_breadth and deacon_summary.seqs_out > 0:
        host_minimizers = measure_host_breadth(data_dir, config)
        if host_minimizers is not None:
            logger.info(
                f"Host breadth: {host_minimizers} distinct host minimizers in "
                f"{deacon_summary.bp_out} host bp "
                f"({deacon_summary.bp_out / max(host_minimizers, 1):.1f} bp per minimizer)"
            )

    if deacon_summary.seqs_out_proportion > cast(
        float, config.deacon_max_host_reads_proportion
    ) or deacon_summary.bp_out > cast(int, config.deacon_max_host_bp):
        raise InvalidSubmission(
            Annotation(
                fileNames=list(files.keys()),
                message=deacon_message(),
            )
        )
