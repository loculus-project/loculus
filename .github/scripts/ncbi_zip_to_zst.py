"""Stream an NCBI Datasets zip from stdin into one <outdir>/<basename>.zst per member.

NCBI writes these zips in streaming mode (data descriptors, zip64),
so they can be read front to back without seeking or unpacking to disk.

Level 12 with long-distance matching over a 128 MB window: on SARS-CoV-2 this beats level 19
(226x vs ~215x) at ~600 MB/s on 4 threads, fast enough to keep up with the download
(~200-300 MB/s of FASTA). A window above 128 MB would need `zstd -d --long=N` to decode.
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
    params = zstandard.ZstdCompressionParameters.from_level(
        level, window_log=27, enable_ldm=True, threads=-1
    )
    chunks = iter(lambda: sys.stdin.buffer.read(1 << 20), b"")
    for raw_name, _size, data in stream_unzip(chunks):
        name = raw_name.decode()
        path = os.path.join(outdir, os.path.basename(name) + ".zst")
        n = 0
        with (
            open(path + ".part", "wb") as f,
            zstandard.ZstdCompressor(compression_params=params).stream_writer(f) as w,
        ):
            for chunk in data:
                w.write(chunk)
                n += len(chunk)
        os.replace(path + ".part", path)
        logger.info("%s: %d bytes -> %d bytes", name, n, os.path.getsize(path))


if __name__ == "__main__":
    main(sys.argv[1], int(os.environ.get("ZSTD_LEVEL", "12")))
