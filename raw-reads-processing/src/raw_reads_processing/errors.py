from raw_reads_processing.datatypes import Annotation, sanitize_for_json


class InvalidSubmission(Exception):
    def __init__(self, error: Annotation):
        self.error = error


class ProcessingFailure(Exception):
    """Download, timeout, missing executable, JVM crash, etc."""

    def __init__(self, message: str):
        super().__init__(sanitize_for_json(message))
