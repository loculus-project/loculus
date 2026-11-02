# ruff: noqa: PLC0414
import subprocess

import pytest
from test_api import client as client
from test_bam_preparation import samtools as samtools
from test_deacon import (
    FIXTURES_DIR,
    _parse_fastq_records,
    _random_read,
)
from test_deacon import (
    deacon_index as deacon_index,
)
from test_deacon import (
    deacon_server as deacon_server,
)

from raw_reads_processing import deacon, process_files


@pytest.mark.usefixtures("readtools_jar", "samtools", "deacon_index")
@pytest.mark.parametrize("contaminated", [False, True])
def test_bam_api_with_real_readtools_samtools_and_deacon(
    tmp_path, monkeypatch, client, contaminated
):
    sequence, quality = (
        _parse_fastq_records(FIXTURES_DIR / "test_small_1.fastq")[0]
        if contaminated
        else _random_read()
    )
    sam = "@HD\tVN:1.6\n" + "".join(
        f"{name}\t{flag}\t*\t0\t0\t*\t*\t0\t0\t{sequence}\t{quality}\n"
        for name, flag in (("pair", 77), ("unpaired", 4), ("single", 77), ("pair", 141))
    )
    bam = tmp_path / "source.bam"
    subprocess.run(
        ["samtools", "view", "-b", "-o", str(bam)],
        input=sam,
        text=True,
        check=True,
        capture_output=True,
    )
    original = bam.read_bytes()
    downloads = []

    def download(config, file, save_path):
        save_path.write_bytes(original)
        downloads.append(save_path)

    monkeypatch.setattr(process_files, "download_file", download)
    response = client.post(
        "/process-files",
        json={
            "accessionVersion": "LOC_0001.1",
            "files": [
                {
                    "fileId": "1",
                    "name": "original reads.BAM",
                    "url": "http://example.com/reads",
                }
            ],
        },
    )
    assert response.status_code == 200
    if contaminated:
        error = response.json()["errors"][0]
        assert error["fileNames"] == ["original reads.BAM"]
        assert deacon.DEACON_ERROR_PROMPT in error["message"]
    else:
        assert response.json() == {"errors": []}
    assert bam.read_bytes() == original
    assert not downloads[0].parent.exists()
