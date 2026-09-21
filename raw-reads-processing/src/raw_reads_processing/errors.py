import gzip
import zlib

from raw_reads_processing.datatypes import Annotation

FALSE_POSITIVE_HINT = (
    "If you believe this file is valid, please contact the administrators."
)

DECOMPRESSION_ERRORS = {
    gzip.BadGzipFile: "is named as gzip-compressed but is not a valid gzip file.",
    EOFError: "appears to be truncated - the gzip stream ends early.",
    zlib.error: "appears to be corrupt - its compressed data could not be read.",
}


class InvalidSubmission(Exception):
    def __init__(self, error: Annotation):
        self.error = error


class ProcessingFailure(Exception):
    """Download, timeout, missing executable, JVM crash, etc."""
