from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, List

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
class CurlResponse:
    status: int
    headers: dict
    body: bytes = b""


def make_curl_runner(responses: List[CurlResponse]) -> Callable[[List[str]], None]:
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
