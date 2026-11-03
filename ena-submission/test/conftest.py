import logging
import subprocess  # noqa: S404
from urllib.parse import urlsplit

import pytest
import requests

_test_context = {"name": "no-test"}

_original_log_record_factory = logging.getLogRecordFactory()


def _log_record_factory_with_test_name(*args: object, **kwargs: object) -> logging.LogRecord:
    record = _original_log_record_factory(*args, **kwargs)
    record.test_name = _test_context["name"]
    return record


logging.setLogRecordFactory(_log_record_factory_with_test_name)


@pytest.fixture(autouse=True)
def _tag_logs_with_test_name(request: pytest.FixtureRequest):
    _test_context["name"] = request.node.name
    yield
    _test_context["name"] = "no-test"


@pytest.fixture
def ena_dev_only(monkeypatch: pytest.MonkeyPatch):
    """Require ENA dev routing for submissions, including HTTP redirects."""
    original_send = requests.Session.send
    original_run = subprocess.run

    def send(session, request, **kwargs):
        url = urlsplit(request.url or "")
        is_submission = request.method not in {"GET", "HEAD", "OPTIONS"} or url.path.startswith(
            "/ena/submit/"
        )
        if is_submission and (url.scheme != "https" or url.netloc != "wwwdev.ebi.ac.uk"):
            msg = "ENA integration tests require HTTPS wwwdev for submission requests."
            raise RuntimeError(msg)
        return original_send(session, request, **kwargs)

    def run(args, **kwargs):
        is_webin_cli = isinstance(args, (list, tuple)) and bool(args) and args[0] == "ena-webin-cli"
        overrides_execution = kwargs.get("shell") or kwargs.get("executable") is not None
        if (
            not is_webin_cli
            or "-test" not in args
            or any(arg.startswith("-test=") for arg in args)
            or overrides_execution
        ):
            msg = "ENA integration tests require ena-webin-cli with explicit -test and no shell."
            raise RuntimeError(msg)
        return original_run(args, **kwargs)

    monkeypatch.setattr(requests.Session, "send", send)
    monkeypatch.setattr(subprocess, "run", run)
