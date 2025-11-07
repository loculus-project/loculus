from __future__ import annotations  # noqa: I001

import json
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

import zstandard
from silo_import.download_manager import HttpResponse


def compress_ndjson(records: Iterable[dict]) -> bytes:
    payload = "\n".join(json.dumps(record) for record in records) + "\n"
    compressor = zstandard.ZstdCompressor()
    return compressor.compress(payload.encode("utf-8"))


def read_ndjson_file(path: Path) -> list[dict]:
    decompressor = zstandard.ZstdDecompressor()
    with path.open("rb") as handle:
        data = decompressor.decompress(handle.read())
    return [json.loads(line) for line in data.decode("utf-8").splitlines() if line]


@dataclass
class MockHttpResponse:
    status: int
    headers: dict
    body: bytes = b""


def make_curl_runner(responses: list[MockHttpResponse]) -> Callable[[list[str]], None]:
    def _runner(cmd: list[str]) -> None:
        if not responses:
            msg = "No fake curl responses remaining"
            raise AssertionError(msg)
        response = responses.pop(0)

        header_path: Path | None = None
        data_path: Path | None = None
        for idx, value in enumerate(cmd):
            if value == "-D" and idx + 1 < len(cmd):
                header_path = Path(cmd[idx + 1])
            if value == "-o" and idx + 1 < len(cmd):
                data_path = Path(cmd[idx + 1])

        if header_path is None or data_path is None:
            msg = "curl command missing header or output path"
            raise AssertionError(msg)

        header_lines = [
            f"HTTP/1.1 {response.status} {'OK' if response.status == 200 else 'Not Modified'}"  # noqa: PLR2004
        ]
        for key, value in (response.headers or {}).items():
            header_lines.append(f"{key}: {value}")
        header_lines.append("")
        header_path.write_text("\n".join(header_lines), encoding="utf-8")

        data_path.write_bytes(response.body or b"")

    return _runner


def make_mock_download_func(responses: list[MockHttpResponse]):
    """Create a mock download function for testing."""

    responses_copy = list(responses)

    def mock_download(
        url: str, output_path: Path, etag: str | None = None, timeout: int = 300  # noqa: ARG001
    ) -> HttpResponse:
        if not responses_copy:
            msg = "No fake HTTP responses remaining"
            raise AssertionError(msg)
        response = responses_copy.pop(0)

        # Write body file
        output_path.write_bytes(response.body or b"")

        # Parse headers for response
        headers = {k.lower(): v for k, v in (response.headers or {}).items()}

        return HttpResponse(status_code=response.status, headers=headers)

    return mock_download, responses_copy


@dataclass
class MockSubprocessResult:
    returncode: int = 0
    stdout: str = ""
    stderr: str = ""


def make_mock_subprocess_run(result: MockSubprocessResult | None = None):
    """Create a mock for subprocess.run that returns a successful result."""
    if result is None:
        result = MockSubprocessResult()

    def mock_run(*args, **kwargs):  # noqa: ARG001
        return result

    return mock_run
