class SkipRunError(Exception):
    """Raised when the importer should skip invoking SILO without error."""

    def __init__(self, message: str, new_etag: str | None = None) -> None:
        super().__init__(message)
        self.new_etag = new_etag


class NotModifiedError(SkipRunError):
    """Backend indicated no new data via HTTP 304."""

    def __init__(self, new_etag: str | None = None) -> None:
        super().__init__("Backend indicated no new data via HTTP 304.")
        self.new_etag = new_etag


class HashUnchangedError(SkipRunError):
    """New payload matches the previous run's hash."""

    def __init__(self, new_etag: str | None = None) -> None:
        super().__init__("New payload matches the previous run's hash.")
        self.new_etag = new_etag


class RecordCountMismatchError(SkipRunError):
    """Mismatch between expected and actual record count."""

    def __init__(self, new_etag: str | None = None) -> None:
        super().__init__("New payload matches the previous run's hash.")
        self.new_etag = new_etag


class DecompressionFailedError(SkipRunError):
    """Download could not be decompressed successfully."""

    def __init__(
        self,
        message: str = "Download could not be decompressed successfully.",
        new_etag: str | None = None,
    ) -> None:
        super().__init__(message)
        self.new_etag = new_etag
