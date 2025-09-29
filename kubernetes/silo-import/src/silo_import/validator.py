"""Data validation for downloaded releases."""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class RecordCountValidationError(Exception):
    """Record count does not match expected value."""


def validate_record_count(actual: int, expected: Optional[int]) -> None:
    """
    Validate that the actual record count matches expected.

    Args:
        actual: Actual number of records found
        expected: Expected number of records (None means no validation)

    Raises:
        RecordCountValidationError: If counts don't match
    """
    if expected is not None and actual != expected:
        logger.warning("Expected %s records but decoded %s", expected, actual)
        raise RecordCountValidationError(f"Expected {expected} records but got {actual}")


def parse_int_header(value: Optional[str]) -> Optional[int]:
    """
    Parse an integer from an HTTP header value.

    Args:
        value: Header value as string

    Returns:
        Parsed integer or None if value is None or invalid
    """
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None