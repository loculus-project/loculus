"""Stream an NCBI Datasets zip from stdin into one <outdir>/<basename>.zst per member.

NCBI writes these zips in streaming mode (data descriptors, zip64),
so they can be read front to back without seeking or unpacking to disk.
"""

import logging
import os
import sys

import zstandard
from stream_unzip import stream_unzip

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")


def main(outdir: str, level: int) -> None:
    os.makedirs(outdir, exist_ok=True)
    chunks = iter(lambda: sys.stdin.buffer.read(1 << 20), b"")
    for raw_name, _size, data in stream_unzip(chunks):
        name = raw_name.decode()
        path = os.path.join(outdir, os.path.basename(name) + ".zst")
        n = 0
        with (
            open(path + ".part", "wb") as f,
            zstandard.ZstdCompressor(level=level, threads=-1).stream_writer(f) as w,
        ):
            for chunk in data:
                w.write(chunk)
                n += len(chunk)
        os.replace(path + ".part", path)
        logger.info("%s: %d bytes -> %d bytes", name, n, os.path.getsize(path))


if __name__ == "__main__":
    main(sys.argv[1], int(os.environ.get("ZSTD_LEVEL", "12")))
