"""
Utility functions for JSON parsing with enhanced error logging.
"""

import json
import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)


def safe_json_loads(content: str | bytes, context: str = "") -> Any:
    """
    Parse JSON content with enhanced error logging.

    Args:
        content: The JSON content to parse (string or bytes)
        context: Optional context description for better error messages

    Returns:
        Parsed JSON object

    Raises:
        json.JSONDecodeError: If JSON parsing fails (after logging enhanced error)
    """
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        # Log the first 100 characters of the content that failed to parse
        content_preview = content[:100] if content else (b"" if isinstance(content, bytes) else "")
        context_msg = f" in {context}" if context else ""
        logger.error(
            f"Failed to parse JSON content{context_msg}. Error: {e}. "
            f"Content preview (first 100 chars): {content_preview!r}"
        )
        raise


def safe_response_json(response: requests.Response, context: str = "") -> Any:
    """
    Parse JSON from a requests Response object with enhanced error logging.

    Args:
        response: The requests Response object
        context: Optional context description for better error messages

    Returns:
        Parsed JSON object

    Raises:
        json.JSONDecodeError: If JSON parsing fails (after logging enhanced error)
    """
    try:
        return response.json()
    except json.JSONDecodeError as e:
        # Log the first 100 characters of the response content that failed to parse
        content_preview = response.text[:100] if response.text else ""
        context_msg = f" in {context}" if context else ""
        logger.error(
            f"Failed to parse JSON response{context_msg}. Error: {e}. "
            f"Response content preview (first 100 chars): {content_preview!r}"
        )
        raise
