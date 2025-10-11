from typing import Optional


class SkipRun(Exception):
    """Raised when the importer should skip invoking SILO without error."""

    def __init__(self, message: str, new_etag: Optional[str] = None) -> None:
        super().__init__(message)
        self.new_etag = new_etag


class NotModified(SkipRun):
    """Backend indicated no new data via HTTP 304."""


class HashUnchanged(SkipRun):
    """New payload matches the previous run's hash."""


class RecordCountMismatch(SkipRun):
    """Mismatch between expected and actual record count."""


class DecompressionFailed(SkipRun):
    """Download could not be decompressed successfully."""
