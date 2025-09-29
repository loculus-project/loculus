"""HTTP client abstraction for downloading data from backend."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Protocol


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


class CurlHttpClient:
    """HTTP client implementation using curl subprocess."""

    def get(
        self,
        url: str,
        output_path: Path,
        header_path: Path,
        etag: Optional[str] = None,
    ) -> HttpResponse:
        """Download using curl subprocess."""
        curl_cmd = [
            "curl",
            "-sS",
            "--fail",
            "-D",
            str(header_path),
            "-o",
            str(output_path),
        ]
        if etag and etag != "0":
            curl_cmd.extend(["-H", f"If-None-Match: {etag}"])
        curl_cmd.append(url)

        try:
            subprocess.run(curl_cmd, check=True)
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"Failed to download from {url}: {exc}") from exc

        status_code, headers = self._parse_header_file(header_path)
        return HttpResponse(status_code=status_code, headers=headers, body_path=output_path)

    def _parse_header_file(self, path: Path) -> tuple[int, dict[str, str]]:
        """Parse curl's header dump file."""
        raw = path.read_text(encoding="utf-8")
        blocks = [block for block in raw.split("\n\n") if block.strip()]
        if not blocks:
            raise RuntimeError("curl did not return any headers")
        lines = blocks[-1].splitlines()
        if not lines:
            raise RuntimeError("Malformed curl headers")
        parts = lines[0].split()
        if len(parts) < 2:
            raise RuntimeError("Malformed status line in headers")
        status_code = int(parts[1])
        headers: dict[str, str] = {}
        for line in lines[1:]:
            if ":" in line:
                key, value = line.split(":", 1)
                headers[key.strip().lower()] = value.strip()
        return status_code, headers