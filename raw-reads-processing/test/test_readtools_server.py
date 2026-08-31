# ruff: noqa: S101

import os
import socket
import subprocess
from pathlib import Path
from unittest.mock import Mock

import pytest
import requests

from raw_reads_processing import file_format_validation, readtools_server
from raw_reads_processing.config import Config
from raw_reads_processing.errors import InvalidSubmission, ProcessingFailure
from raw_reads_processing.file_format_validation import (
    FileFormat,
    validate_with_readtools,
)

from test_file_validation import (  # reuse the same fixtures both paths must agree on
    FASTA_STYLE_HEADER,
    INTERLEAVED_SAME_NAME,
    LENGTH_MISMATCH,
    NON_IUPAC_BASE,
    VALID_R1,
    VALID_R2,
    VALID_SINGLE_END,
    _find_jar,
)


def _config(**overrides) -> Config:
    defaults = dict(
        log_level="INFO",
        s3_request_timeout_seconds=10,
        read_validation_timeout_seconds=10,
        deacon_filter_timeout_seconds=10,
        deacon_max_host_reads_proportion=0.05,
        deacon_max_host_bp=1000,
    )
    defaults.update(overrides)
    return Config(**defaults)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _write(tmp_path: Path, name: str, content: str) -> Path:
    file_path = tmp_path / name
    file_path.write_text(content)
    return file_path


# --------------------------------------------------------------------------
# Client behaviour, without a real server
# --------------------------------------------------------------------------


def test_non_200_from_server_is_a_processing_failure(monkeypatch):
    monkeypatch.setattr(
        readtools_server.requests,
        "post",
        Mock(return_value=Mock(status_code=500, text="boom")),
    )
    with pytest.raises(ProcessingFailure) as exc_info:
        readtools_server.run_validation(_config(), ["reads.fastq"], "FASTQ", 10)
    assert "returned 500" in str(exc_info.value)


def test_unreachable_server_is_a_processing_failure(monkeypatch):
    monkeypatch.setattr(
        readtools_server.requests,
        "post",
        Mock(side_effect=requests.ConnectionError("refused")),
    )
    with pytest.raises(ProcessingFailure) as exc_info:
        readtools_server.run_validation(_config(), ["reads.fastq"], "FASTQ", 10)
    assert "Could not reach the readtools validation server" in str(exc_info.value)


def test_server_timeout_is_reported_like_the_subprocess_timeout(tmp_path, monkeypatch):
    """The submitter-facing timeout message must not depend on which path ran."""
    monkeypatch.setattr(
        readtools_server.requests, "post", Mock(side_effect=requests.Timeout())
    )
    reads = _write(tmp_path, "reads.fastq", VALID_SINGLE_END)
    with pytest.raises(ProcessingFailure) as exc_info:
        validate_with_readtools(
            {"reads.fastq": reads},
            FileFormat.FASTQ,
            timeout_seconds=1,
            config=_config(),
        )
    assert "timed out" in str(exc_info.value)
    assert "1 second" in str(exc_info.value)


def test_invalid_verdict_from_server_is_parsed_like_cli_output(tmp_path, monkeypatch):
    monkeypatch.setattr(
        readtools_server.requests,
        "post",
        Mock(
            return_value=Mock(
                status_code=200,
                json=Mock(
                    return_value={
                        "exitCode": 1,
                        "stdout": "RESULT: INVALID\n  Reads must contain only valid IUPAC codes\n",
                        "stderr": "",
                    }
                ),
            )
        ),
    )
    reads = _write(tmp_path, "reads.fastq", NON_IUPAC_BASE)
    with pytest.raises(InvalidSubmission) as exc_info:
        validate_with_readtools(
            {"reads.fastq": reads}, FileFormat.FASTQ, config=_config()
        )
    assert exc_info.value.error.message == (
        "File validation failed while running ENA readtools. "
        "Reads must contain only valid IUPAC codes"
    )


def test_server_is_not_used_when_disabled(tmp_path, monkeypatch):
    post = Mock()
    monkeypatch.setattr(readtools_server.requests, "post", post)
    monkeypatch.setattr(
        file_format_validation,
        "_run_readtools_subprocess",
        Mock(return_value=(0, "RESULT: VALID\n", "")),
    )
    reads = _write(tmp_path, "reads.fastq", VALID_SINGLE_END)
    validate_with_readtools(
        {"reads.fastq": reads},
        FileFormat.FASTQ,
        config=_config(readtools_server_enabled=False),
    )
    post.assert_not_called()


def test_full_validation_flag_reaches_the_server(tmp_path, monkeypatch):
    post = Mock(
        return_value=Mock(
            status_code=200,
            json=Mock(return_value={"exitCode": 0, "stdout": "", "stderr": ""}),
        )
    )
    monkeypatch.setattr(readtools_server.requests, "post", post)
    reads = _write(tmp_path, "reads.fastq", VALID_SINGLE_END)
    validate_with_readtools(
        {"reads.fastq": reads},
        FileFormat.FASTQ,
        config=_config(readtools_full_validation=True),
    )
    assert post.call_args.kwargs["json"]["full"] is True


def test_full_validation_flag_reaches_the_subprocess(tmp_path):
    """Both paths must agree on how much of the file gets validated."""
    reads = _write(tmp_path, "reads.fastq", VALID_SINGLE_END)
    if _find_jar() is None:
        pytest.skip("readtools jar not found")
    exit_code, stdout, _ = file_format_validation._run_readtools_subprocess(
        [str(reads)], FileFormat.FASTQ, 120, full=True
    )
    assert exit_code == 0
    assert "full (<=100M reads)" in stdout


def test_quick_is_the_default(tmp_path, monkeypatch):
    post = Mock(
        return_value=Mock(
            status_code=200,
            json=Mock(return_value={"exitCode": 0, "stdout": "", "stderr": ""}),
        )
    )
    monkeypatch.setattr(readtools_server.requests, "post", post)
    reads = _write(tmp_path, "reads.fastq", VALID_SINGLE_END)
    validate_with_readtools({"reads.fastq": reads}, FileFormat.FASTQ, config=_config())
    assert post.call_args.kwargs["json"]["full"] is False


def test_startup_reports_a_server_that_dies_immediately():
    config = _config(
        readtools_server_port=_free_port(), readtools_server_startup_timeout_seconds=5
    )
    dead = subprocess.Popen(["false"])  # noqa: S607, S603
    dead.wait()
    with pytest.raises(ProcessingFailure) as exc_info:
        readtools_server.wait_until_ready(config, dead)
    assert "exited with code" in str(exc_info.value)


# --------------------------------------------------------------------------
# Against a real server: the two paths must agree, message for message
# --------------------------------------------------------------------------


@pytest.fixture(scope="module")
def live_server():
    jar = _find_jar()
    if jar is None:
        pytest.skip("readtools jar not found; set READTOOLS_JAR to its path")

    config = _config(
        readtools_server_port=_free_port(),
        readtools_server_threads=2,
        # Warm-up is about speed, not correctness; skip it to keep the test quick.
        readtools_server_startup_timeout_seconds=120,
    )
    proc = subprocess.Popen(  # noqa: S603
        [
            "java",
            "-jar",
            jar,
            "server",
            "--port",
            str(config.readtools_server_port),
            "--threads",
            "2",
            "--warmup-rounds",
            "0",
        ]
    )
    try:
        readtools_server.wait_until_ready(config, proc)
        yield config
    finally:
        readtools_server.stop_readtools_server(proc)


CASES = [
    ("valid_single", {"reads.fastq": VALID_SINGLE_END}),
    ("valid_paired", {"R1.fastq": VALID_R1, "R2.fastq": VALID_R2}),
    ("fasta_header", {"bad.fastq": FASTA_STYLE_HEADER}),
    ("non_iupac", {"bad.fastq": NON_IUPAC_BASE}),
    ("length_mismatch", {"bad.fastq": LENGTH_MISMATCH}),
    ("interleaved", {"interleaved.fastq": INTERLEAVED_SAME_NAME}),
]


def _outcome(files, config):
    """Verdict plus exact message, so a drift in wording fails the test."""
    try:
        validate_with_readtools(files, FileFormat.FASTQ, config=config)
    except InvalidSubmission as e:
        return ("invalid", e.error.message)
    return ("valid", None)


@pytest.mark.parametrize(("name", "contents"), CASES, ids=[c[0] for c in CASES])
def test_server_and_subprocess_agree(live_server, tmp_path, name, contents):
    files = {
        file_name: _write(tmp_path, file_name, content)
        for file_name, content in contents.items()
    }
    via_server = _outcome(files, live_server)
    via_subprocess = _outcome(files, _config(readtools_server_enabled=False))
    assert via_server == via_subprocess


def test_health_endpoint_validates_a_real_read(live_server):
    assert readtools_server.readtools_server_healthy(live_server)


def test_server_handles_concurrent_validations(live_server, tmp_path):
    """Concurrent requests must each get their own verdict, not another request's."""
    from concurrent.futures import ThreadPoolExecutor

    work = []
    for i, (name, contents) in enumerate(CASES * 3):
        case_dir = tmp_path / f"case{i}"
        case_dir.mkdir()
        files = {
            file_name: _write(case_dir, file_name, content)
            for file_name, content in contents.items()
        }
        work.append((name, files))

    expected = {name: _outcome(files, live_server) for name, files in work}
    with ThreadPoolExecutor(6) as pool:
        results = list(
            pool.map(lambda item: (item[0], _outcome(item[1], live_server)), work)
        )

    for name, outcome in results:
        assert outcome == expected[name], f"{name} got another request's verdict"


def test_environment_jar_path_is_shared_by_both_modules():
    """Both paths must load the same jar, or they could validate differently."""
    if os.environ.get("READTOOLS_JAR"):
        assert (
            readtools_server.VALIDATION_JAR_PATH
            == file_format_validation.VALIDATION_JAR_PATH
        )


def test_readtools_failing_to_run_is_not_blamed_on_the_submitter(tmp_path, monkeypatch):
    """An out-of-heap JVM exits 2; that is our problem, not a bad file."""
    monkeypatch.setattr(
        readtools_server.requests,
        "post",
        Mock(
            return_value=Mock(
                status_code=200,
                json=Mock(
                    return_value={
                        "exitCode": 2,
                        "stdout": "",
                        "stderr": "java.lang.OutOfMemoryError: Java heap space",
                    }
                ),
            )
        ),
    )
    reads = _write(tmp_path, "reads.fastq", VALID_SINGLE_END)
    with pytest.raises(ProcessingFailure) as exc_info:
        validate_with_readtools(
            {"reads.fastq": reads}, FileFormat.FASTQ, config=_config()
        )
    assert "OutOfMemoryError" in str(exc_info.value)
