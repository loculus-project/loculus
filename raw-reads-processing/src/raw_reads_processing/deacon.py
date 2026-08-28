import itertools
import logging
import os
import statistics
from pathlib import Path
from threading import BoundedSemaphore
from typing import cast

from Bio.SeqIO.QualityIO import FastqGeneralIterator
from deacon import Index
from xopen import xopen

from raw_reads_processing.config import Config
from raw_reads_processing.datatypes import Annotation, DeaconSummary, FileName
from raw_reads_processing.errors import InvalidSubmission, ProcessingFailure

logger = logging.getLogger(__name__)

DEACON_INDEX_PATH = os.environ.get("DEACON_INDEX_PATH", "/data/deacon.idx")


def load_deacon_index() -> Index:
    """Load the deacon index into this process, once, at startup.

    The index is a full in-memory deserialize (~4.5GB peak RSS for panhuman-1), not an
    mmap, so every process that loads it pays for its own copy. There must be exactly
    one, which is why the API is pinned to a single uvicorn worker (see api.py).
    """
    if not Path(DEACON_INDEX_PATH).is_file():
        raise RuntimeError(
            f"Deacon index not found at '{DEACON_INDEX_PATH}'. Please ensure the deacon index is mounted at the correct path."
        )
    logger.info(f"Loading deacon index from '{DEACON_INDEX_PATH}' (takes ~5-30s)")
    index = Index(DEACON_INDEX_PATH)
    logger.info(f"Loaded deacon index: {index.info()}")
    return index


class DeaconFilter:
    """The one loaded index, plus a cap on how many filters run against it at once.

    deacon.Index is immutable and releases the GIL while filtering, so a single index
    can serve concurrent requests from the FastAPI threadpool in genuine parallel
    without duplicating it in memory. The semaphore is what stops that threadpool
    (~40 slots) from multiplying deacon_threads into hundreds of worker threads.
    """

    def __init__(self, index: Index, config: Config):
        self._index = index
        self._threads = config.deacon_threads
        self._slots = BoundedSemaphore(config.deacon_max_concurrent_filters)

    def run(
        self, file_name_to_path: dict[FileName, Path], config: Config
    ) -> DeaconSummary:
        # Files arrive in submission order, so the first is R1 and an optional second
        # is R2. Name them explicitly: deacon treats two inputs as mates of one pair.
        paths = list(file_name_to_path.values())
        read1 = str(paths[0])
        read2 = str(paths[1]) if len(paths) > 1 else None

        deacon_a = _deacon_a_for_reads(file_name_to_path, config)
        logger.debug(
            f"Running deacon filter on '{', '.join(str(f) for f in file_name_to_path)}' "
            f"with -a {deacon_a} -r {config.deacon_r}, threads={self._threads}"
        )

        try:
            with self._slots:
                summary = self._index.filter(
                    read1,
                    input2=read2,
                    deplete=False,
                    # Search mode keeps the reads that MATCH the human index, so the
                    # output is human sequence: discard it rather than let it reach
                    # this process's stdout, which is the pod log.
                    output=os.devnull,
                    output2=os.devnull if read2 else None,
                    abs_threshold=deacon_a,
                    rel_threshold=config.deacon_r,
                    threads=self._threads,
                    quiet=True,
                )
        except Exception as error:
            # Unreadable or mismatched input reaches us as a RuntimeError carrying
            # deacon's own message; the index and the process are unaffected.
            # TODO: send a slack notification to alert the team that deacon is failing
            message = f"Deacon filter failed: {error}"
            logger.error(message)
            raise ProcessingFailure(message) from error
        return DeaconSummary.from_dict(summary)


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
    message = f"Failed to determine median read length for file '{file_name}'. File may be empty or corrupted."
    try:
        with xopen(path, "rt", threads=0) as fh:
            lengths = [
                len(seq)
                for _, seq, _ in itertools.islice(FastqGeneralIterator(fh), sample_size)
            ]
    except (ValueError, OSError) as error:
        logging.error(f"{message} {error}")
        raise InvalidSubmission(
            Annotation(fileNames=[file_name], message=message)
        ) from error
    if not lengths:
        logging.error(message)
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


# TODO: Add a link to the documentation for removing host reads
DEACON_ERROR_PROMPT = (
    "We cannot accept files with a high proportion of human reads, as they may contain "
    "sensitive human genetic information. Please remove host reads from your data and resubmit."
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


def validate_with_deacon(
    deacon_filter: DeaconFilter, files: dict[FileName, Path], config: Config
) -> None:
    deacon_summary = deacon_filter.run(files, config)
    log_deacon_summary(deacon_summary, config)

    if deacon_summary.seqs_out_proportion > cast(
        float, config.deacon_max_host_reads_proportion
    ) or deacon_summary.bp_out > cast(int, config.deacon_max_host_bp):
        raise InvalidSubmission(
            Annotation(
                fileNames=list(files.keys()),
                message=deacon_message(),
            )
        )
