from file_processing.datatypes import Annotation

class InvalidSubmission(Exception):
    def __init__(self, error: Annotation):
        self.error = error


class ProcessingFailure(Exception):
    """Download, timeout, missing executable, JVM crash, etc."""