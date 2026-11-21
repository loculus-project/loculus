# ruff: noqa: PLC0414
from unittest.mock import MagicMock, Mock

import pytest
from test_api import VALID_PAYLOAD
from test_api import client as client

from raw_reads_processing import api, deacon, deadline, process_files
from raw_reads_processing.bam_preparation import DeaconInputBatch, PreparedBamReads
from raw_reads_processing.errors import ProcessingFailure


@pytest.mark.parametrize("extension", ["fastq.gz", "bam"])
@pytest.mark.parametrize("expire", [False, True])
def test_stages_share_one_processing_budget(client, monkeypatch, extension, expire):
    clock = [0]
    monkeypatch.setattr(deadline.time, "monotonic", lambda: clock[0])
    api.app.state.config.processing_timeout_seconds = 20

    def download(config, file, save_path, deadline):
        clock[0] += 4

    def readtools(files, file_format, timeout):
        assert timeout == 10
        clock[0] += 7

    def prepare(file_name, path, directory, timeout):
        assert timeout == 9
        clock[0] += 4

    def screen(files, directory, config, deadline):
        expected = 5 if extension == "bam" else 9
        assert deadline.remaining(config.deacon_filter_timeout_seconds) == expected
        if expire:
            clock[0] = 21

    monkeypatch.setattr(process_files, "download_file", download)
    monkeypatch.setattr(process_files, "validate_compression", lambda *args: None)
    monkeypatch.setattr(process_files, "validate_with_readtools", readtools)
    monkeypatch.setattr(process_files, "prepare_bam_for_deacon", prepare)
    monkeypatch.setattr(process_files, "validate_with_deacon", screen)
    monkeypatch.setattr(process_files, "validate_bam_with_deacon", screen)
    payload = {
        **VALID_PAYLOAD,
        "files": [{**VALID_PAYLOAD["files"][0], "name": f"reads.{extension}"}],
    }

    response = client.post("/process-files", json=payload)

    assert response.status_code == (500 if expire else 200)
    if expire:
        assert (
            response.json()["detail"]
            == "Raw-read processing timed out after 20 seconds."
        )


def test_download_stops_when_total_budget_expires(client, monkeypatch):
    clock = [0]
    monkeypatch.setattr(deadline.time, "monotonic", lambda: clock[0])

    def read_chunk(*args, **kwargs):
        clock[0] += 16
        return b"chunk"

    response = MagicMock()
    response.raw.read1.side_effect = read_chunk
    request = MagicMock()
    request.__enter__.return_value = response
    monkeypatch.setattr(process_files.requests, "get", lambda *args, **kwargs: request)
    readtools = Mock()
    monkeypatch.setattr(process_files, "validate_with_readtools", readtools)

    result = client.post("/process-files", json=VALID_PAYLOAD)

    assert result.status_code == 500
    assert result.json()["detail"] == "Raw-read processing timed out after 30 seconds."
    readtools.assert_not_called()
    assert response.raw.read1.call_count == 2
    request.__exit__.assert_called_once()


@pytest.mark.parametrize("bam", [False, True])
def test_deacon_receives_remaining_budget_after_sampling(
    client, monkeypatch, tmp_path, bam
):
    clock = [0]
    monkeypatch.setattr(deadline.time, "monotonic", lambda: clock[0])
    budget = deadline.ProcessingDeadline(5)

    def sample(*args, **kwargs):
        clock[0] += 2
        return 150

    runner = Mock(side_effect=ProcessingFailure("stopped"))
    monkeypatch.setattr(deacon, "median_read_length", sample)
    monkeypatch.setattr(deacon, "_run_deacon_filter", runner)
    path = tmp_path / "reads"
    config = api.app.state.config

    with pytest.raises(ProcessingFailure, match="stopped"):
        if bam:
            prepared = PreparedBamReads("reads.bam", (DeaconInputBatch((path,), 1),), 1)
            deacon.validate_bam_with_deacon(prepared, str(tmp_path), config, budget)
        else:
            deacon.validate_with_deacon(
                {"reads.fastq.gz": path}, str(tmp_path), config, budget
            )

    assert runner.call_args.kwargs["timeout_seconds"] == 3
