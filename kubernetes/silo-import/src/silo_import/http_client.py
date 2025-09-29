"""HTTP client abstraction for downloading data from backend."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Protocol

import requests


@dataclass
class HttpResponse:
    """Response from an HTTP request."""

    status_code: int
    headers: dict[str, str]
    body_path: Path


class HttpClient(Protocol):
    """Protocol for HTTP client implementations."""

    def get(
        self,
        url: str,
        output_path: Path,
        header_path: Path,
        etag: Optional[str] = None,
    ) -> HttpResponse:
        """
        Download content from URL to output_path.

        Args:
            url: URL to download from
            output_path: Where to save the response body
            header_path: Where to save the response headers
            etag: Optional ETag for conditional request

        Returns:
            HttpResponse with status code, headers, and body path

        Raises:
            RuntimeError: If the download fails
        """
        ...


class RequestsHttpClient:
    """HTTP client implementation using requests library."""

    def __init__(self, timeout: int = 300) -> None:
        """
        Initialize the HTTP client.

        Args:
            timeout: Request timeout in seconds (default: 300)
        """
        self.timeout = timeout

    def get(
        self,
        url: str,
        output_path: Path,
        header_path: Path,
        etag: Optional[str] = None,
    ) -> HttpResponse:
        """Download using requests library."""
        headers = {}
        if etag and etag != "0":
            headers["If-None-Match"] = etag

        try:
            # Create a session with custom adapter to disable automatic decompression
            session = requests.Session()
            session.headers.update(headers)

            # Get raw response without automatic decompression
            response = session.get(url, timeout=self.timeout, stream=True)

            # Write response body to file (raw, no automatic decompression)
            with output_path.open("wb") as f:
                for chunk in response.raw.stream(8192, decode_content=False):
                    if chunk:
                        f.write(chunk)

            # Write headers to file (mimicking curl's -D format)
            self._write_header_file(header_path, response)

            # Normalize headers to lowercase keys
            normalized_headers = {k.lower(): v for k, v in response.headers.items()}

            return HttpResponse(
                status_code=response.status_code,
                headers=normalized_headers,
                body_path=output_path,
            )

        except requests.RequestException as exc:
            raise RuntimeError(f"Failed to download from {url}: {exc}") from exc

    def _write_header_file(self, path: Path, response: requests.Response) -> None:
        """Write response headers to file in HTTP format."""
        lines = [f"HTTP/1.1 {response.status_code} {response.reason}"]
        for key, value in response.headers.items():
            lines.append(f"{key}: {value}")
        lines.append("")
        path.write_text("\n".join(lines), encoding="utf-8")