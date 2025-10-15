from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, List, Optional

import zstandard


def compress_ndjson(records: Iterable[dict]) -> bytes:
    payload = "\n".join(json.dumps(record) for record in records) + "\n"
    compressor = zstandard.ZstdCompressor()
    return compressor.compress(payload.encode("utf-8"))


def read_ndjson_file(path: Path) -> List[dict]:
    decompressor = zstandard.ZstdDecompressor()
    with path.open("rb") as handle:
        data = decompressor.decompress(handle.read())
    return [json.loads(line) for line in data.decode("utf-8").splitlines() if line]


@dataclass
class MockHttpResponse:
    status: int
    headers: dict
    body: bytes = b""


def make_curl_runner(responses: List[MockHttpResponse]) -> Callable[[List[str]], None]:
    def _runner(cmd: List[str]) -> None:
        if not responses:
            raise AssertionError("No fake curl responses remaining")
        response = responses.pop(0)

        header_path: Path | None = None
        data_path: Path | None = None
        for idx, value in enumerate(cmd):
            if value == "-D" and idx + 1 < len(cmd):
                header_path = Path(cmd[idx + 1])
            if value == "-o" and idx + 1 < len(cmd):
                data_path = Path(cmd[idx + 1])

        if header_path is None or data_path is None:
            raise AssertionError("curl command missing header or output path")

        header_lines = [f"HTTP/1.1 {response.status} {'OK' if response.status == 200 else 'Not Modified'}"]
        for key, value in (response.headers or {}).items():
            header_lines.append(f"{key}: {value}")
        header_lines.append("")
        header_path.write_text("\n".join(header_lines), encoding="utf-8")

        data_path.write_bytes(response.body or b"")

    return _runner


def make_mock_download_func(responses: List[MockHttpResponse]):
    """Create a mock download function for testing."""
    from silo_import.download_manager import HttpResponse

    responses_copy = list(responses)

    def mock_download(url: str, output_path: Path, etag: Optional[str] = None, timeout: int = 300) -> HttpResponse:
        if not responses_copy:
            raise AssertionError("No fake HTTP responses remaining")
        response = responses_copy.pop(0)

        # Write body file
        output_path.write_bytes(response.body or b"")

        # Parse headers for response
        headers = {k.lower(): v for k, v in (response.headers or {}).items()}

        return HttpResponse(status_code=response.status, headers=headers)

    return mock_download, responses_copy


def ack_on_success(paths, timeout: float = 5.0) -> threading.Thread:
    """Helper that simulates SILO acknowledging and completing a run."""
    from silo_import.file_io import write_text

    def _worker() -> None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if paths.run_silo.exists():
                content = paths.run_silo.read_text(encoding="utf-8").strip()
                if content:
                    _, run_id = content.split("=", 1)
                    paths.run_silo.unlink(missing_ok=True)
                    write_text(paths.silo_done, f"run_id={run_id}\nstatus=success\n")
                    return
            time.sleep(0.01)
        raise AssertionError("Timed out waiting for run file")

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
    return thread
