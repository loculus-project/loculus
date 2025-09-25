from __future__ import annotations

import json
from pathlib import Path
from typing import Callable, Iterable, List, Optional

import httpx
import zstandard


class FakeStreamResponse:
    def __init__(self, *, status_code: int = 200, headers: Optional[dict[str, str]] = None, body: bytes | Iterable[bytes] = b"") -> None:
        self.status_code = status_code
        self.headers = httpx.Headers(headers or {})
        self._body = body
        self.request = httpx.Request("GET", "http://fake")

    def iter_bytes(self) -> Iterable[bytes]:
        if isinstance(self._body, (bytes, bytearray)):
            yield bytes(self._body)
        else:
            yield from self._body

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            response = httpx.Response(self.status_code, headers=self.headers, request=self.request)
            raise httpx.HTTPStatusError("HTTP error", request=self.request, response=response)

    def close(self) -> None:  # pragma: no cover - provided for symmetry
        return


class _FakeStreamContext:
    def __init__(self, response: FakeStreamResponse) -> None:
        self._response = response

    def __enter__(self) -> FakeStreamResponse:
        return self._response

    def __exit__(self, exc_type, exc, tb) -> None:
        self._response.close()


class FakeGetResponse:
    def __init__(self, *, text: str, status_code: int = 200) -> None:
        self.text = text
        self.status_code = status_code
        self.headers = httpx.Headers()
        self.request = httpx.Request("GET", "http://fake")

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            response = httpx.Response(self.status_code, headers=self.headers, request=self.request)
            raise httpx.HTTPStatusError("HTTP error", request=self.request, response=response)


class FakeHttpClient:
    def __init__(self, *, stream_responses: Optional[List[FakeStreamResponse]] = None, get_responses: Optional[List[FakeGetResponse]] = None) -> None:
        self._stream_responses = stream_responses or []
        self._get_responses = get_responses or []

    # Context manager support
    def __enter__(self) -> "FakeHttpClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def stream(
        self,
        method: str,
        url: str,
        headers: Optional[dict[str, str]] = None,
        decode_content: bool = True,
    ) -> _FakeStreamContext:
        if not self._stream_responses:
            raise AssertionError("No fake stream responses remaining")
        response = self._stream_responses.pop(0)
        response.request = httpx.Request(method, url, headers=headers)
        return _FakeStreamContext(response)

    def get(self, url: str) -> FakeGetResponse:
        if not self._get_responses:
            raise AssertionError("No fake GET responses remaining")
        response = self._get_responses.pop(0)
        response.request = httpx.Request("GET", url)
        return response


def make_client_factory(clients: List[FakeHttpClient]) -> Callable[..., FakeHttpClient]:
    def _factory(**_: object) -> FakeHttpClient:
        if not clients:
            raise AssertionError("No fake clients available")
        return clients.pop(0)

    return _factory


def compress_ndjson(records: Iterable[dict]) -> bytes:
    payload = "\n".join(json.dumps(record) for record in records) + "\n"
    compressor = zstandard.ZstdCompressor()
    return compressor.compress(payload.encode("utf-8"))


def read_ndjson_file(path: Path) -> List[dict]:
    decompressor = zstandard.ZstdDecompressor()
    with path.open("rb") as handle:
        data = decompressor.decompress(handle.read())
    return [json.loads(line) for line in data.decode("utf-8").splitlines() if line]
