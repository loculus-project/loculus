#!/usr/bin/env python3
"""Minimal repro: stream download with httpx, then decompress with zstandard."""

import io
from pathlib import Path

import httpx
import zstandard

URL = "https://backend-pyimport.loculus.org/dummy-organism/get-released-data?compression=zstd"
OUT = Path("testfile.zst")

print(f"Fetching {URL}")
with httpx.Client(timeout=httpx.Timeout(300.0)) as client:
    with client.stream(
        "GET",
        URL,
        headers={"Accept-Encoding": "identity"},
        decode_content=False,
    ) as response:
        response.raise_for_status()
        with OUT.open("wb") as fh:
            for chunk in response.iter_bytes():
                fh.write(chunk)

print("Saved", OUT, "size", OUT.stat().st_size)

dctx = zstandard.ZstdDecompressor()
try:
    with OUT.open("rb") as fh, dctx.stream_reader(fh) as reader:
        wrapper = io.TextIOWrapper(reader, encoding="utf-8")
        for idx, line in enumerate(wrapper, start=1):
            if idx <= 3:
                print("sample", line.strip()[:80])
        print("total lines", idx)
except zstandard.ZstdError as exc:
    print("Decompression failed:", exc)
