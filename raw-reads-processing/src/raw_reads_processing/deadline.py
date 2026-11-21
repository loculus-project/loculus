import time

from raw_reads_processing.errors import ProcessingFailure


class ProcessingDeadline:
    def __init__(self, timeout_seconds: float):
        self.timeout_seconds = timeout_seconds
        self.expires_at = time.monotonic() + timeout_seconds

    def remaining(self, stage_timeout: float | None = None) -> float:
        remaining = self.expires_at - time.monotonic()
        if remaining <= 0:
            raise ProcessingFailure(
                f"Raw-read processing timed out after {self.timeout_seconds:g} seconds."
            )
        return min(remaining, stage_timeout) if stage_timeout is not None else remaining
