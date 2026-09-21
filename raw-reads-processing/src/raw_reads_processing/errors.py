from raw_reads_processing.datatypes import Annotation, sanitize_for_json


class InvalidSubmission(Exception):
    def __init__(self, error: Annotation):
        self.error = error


class ProcessingFailure(Exception):
    """Download, timeout, missing executable, JVM crash, etc."""

    def __init__(self, message: str):
        # Preprocessing turns this message into an annotation of its own, so it
        # reaches Postgres on the same path as a validation message and needs
        # the same sanitizing. Annotation does it for InvalidSubmission.
        super().__init__(sanitize_for_json(message))
