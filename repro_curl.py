#!/usr/bin/env python3
"""Download with curl subprocess, then decompress with zstandard."""

import subprocess
import io
from pathlib import Path
import zstandard

URL = "https://backend-pyimport.loculus.org/dummy-organism/get-released-data?compression=zstd"
DATA = Path("testfile_curl.zst")
HEAD = Path("testfile_curl.headers")

print(f"Fetching {URL} via curl")
cmd = [
    "curl",
    "-sS",
    "--fail",
    "-D",
    str(HEAD),
    "-o",
    str(DATA),
    URL,
]
subprocess.run(cmd, check=True)

print("Saved", DATA, "size", DATA.stat().st_size)
print("Status line:", HEAD.read_text().splitlines()[0])

dctx = zstandard.ZstdDecompressor()
try:
    with DATA.open("rb") as fh, dctx.stream_reader(fh) as reader:
        wrapper = io.TextIOWrapper(reader, encoding="utf-8")
        for idx, line in enumerate(wrapper, start=1):
            if idx <= 3:
                print("sample", line.strip()[:80])
        print("total lines", idx)
except zstandard.ZstdError as exc:
    print("Decompression failed:", exc)
