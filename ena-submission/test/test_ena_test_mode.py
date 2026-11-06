"""Offline checks that must pass before CI runs authenticated ENA integration tests."""

# ruff: noqa: S101
import subprocess  # noqa: S404
import tempfile
from unittest.mock import Mock

import pytest
import requests
from ena_deposition.config import Config, get_config, secure_ena_connection
from ena_deposition.ena_client import post_webin_cli, post_webin_with_retry

DEV_SUBMISSION_URL = "https://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit"
DEV_REPORTS_URL = "https://wwwdev.ebi.ac.uk/ena/submit/report"
PROD_SUBMISSION_URL = "https://www.ebi.ac.uk/ena/submit/drop-box/submit"


@pytest.fixture
def config(monkeypatch: pytest.MonkeyPatch) -> Config:
    # Never use real credentials in command assertions or failure output.
    monkeypatch.setenv("ENA_USERNAME", "unused-offline-test")
    monkeypatch.setenv("ENA_PASSWORD", "unused-offline-test")
    return get_config("test/test_config.yaml")


@pytest.fixture
def guarded_transports(monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest):
    """Install mocks underneath the same guard used by the live integration suite."""
    response = requests.Response()
    response.status_code = 200
    send = Mock(return_value=response)
    run = Mock(return_value=subprocess.CompletedProcess([], 0, "", ""))
    monkeypatch.setattr(requests.Session, "send", send)
    monkeypatch.setattr(subprocess, "run", run)
    request.getfixturevalue("ena_dev_only")
    return send, run


def test_integration_config_selects_dev(config: Config):
    assert config.submit_to_ena_prod is False
    assert config.test is True
    assert config.ena_submission_url == DEV_SUBMISSION_URL
    assert config.ena_reports_service_url == DEV_REPORTS_URL


@pytest.mark.parametrize("is_broker", [False, True])
def test_dev_setting_overrides_stale_production_settings(config: Config, is_broker: bool):
    config.is_broker = is_broker
    config.backend_url = config.allowed_submission_hosts[0]
    config.test = False
    config.ena_submission_url = PROD_SUBMISSION_URL
    config.ena_reports_service_url = "https://www.ebi.ac.uk/ena/submit/report"
    secure_ena_connection(config)
    assert config.test is True
    assert config.ena_submission_url == DEV_SUBMISSION_URL
    assert config.ena_reports_service_url == DEV_REPORTS_URL


@pytest.mark.parametrize("context", ["reads", "genome"])
def test_actual_webin_command_includes_test(config: Config, guarded_transports, context):
    _, run = guarded_transports
    output_dir = tempfile.TemporaryDirectory()
    with output_dir:
        post_webin_cli(config, "manifest.tsv", output_dir, context=context)
    run.assert_called_once()
    args = run.call_args.args[0]
    assert "-test" in args
    assert "-submit" in args
    assert f"-context={context}" in args
    assert run.call_args.kwargs["shell"] is False


@pytest.mark.parametrize("context", ["reads", "genome"])
def test_missing_test_flag_stops_before_process_start(config: Config, guarded_transports, context):
    _, run = guarded_transports
    config.test = False
    with pytest.raises(RuntimeError, match="explicit -test"):
        post_webin_cli(config, "manifest.tsv", Mock(), context=context)
    run.assert_not_called()


@pytest.mark.parametrize(
    ("args", "kwargs"),
    [
        (["ena-webin-cli", "-submit", "-password=-test"], {}),
        (["ena-webin-cli", "-submit", "-test", "-test=false"], {}),
        (["ena-webin-cli", "-submit", "-test"], {"shell": True}),
        ("ena-webin-cli -submit -test", {}),
    ],
)
def test_unsafe_command_stops_before_process_start(guarded_transports, args, kwargs):
    _, run = guarded_transports
    with pytest.raises(RuntimeError, match="explicit -test"):
        subprocess.run(args, check=False, **kwargs)  # noqa: S603
    run.assert_not_called()


@pytest.mark.parametrize("url", [DEV_SUBMISSION_URL, PROD_SUBMISSION_URL])
def test_xml_submission_checks_actual_request_url(config: Config, guarded_transports, url: str):
    send, _ = guarded_transports
    config.ena_submission_url = url
    if url == DEV_SUBMISSION_URL:
        post_webin_with_retry(config, {"SUBMISSION": "<SUBMISSION/>"})
        send.assert_called_once()
        request = send.call_args.args[1]
        assert request.url == DEV_SUBMISSION_URL
        assert request.method == "POST"
    else:
        with pytest.raises(RuntimeError, match="HTTPS wwwdev"):
            post_webin_with_retry(config, {"SUBMISSION": "<SUBMISSION/>"})
        send.assert_not_called()


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("POST", "http://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit"),
        ("POST", "https://wwwdev.ebi.ac.uk.example.org/ena/submit/drop-box/submit"),
        ("PUT", PROD_SUBMISSION_URL),
        ("DELETE", PROD_SUBMISSION_URL),
        ("GET", "https://www.ebi.ac.uk/ena/submit/report/analysis-process/ERZ123"),
    ],
)
def test_unsafe_http_request_stops_before_send(guarded_transports, method: str, url: str):
    send, _ = guarded_transports
    with pytest.raises(RuntimeError, match="HTTPS wwwdev"):
        requests.request(method, url, timeout=1)
    send.assert_not_called()


def test_public_read_only_lookup_is_allowed(guarded_transports):
    send, _ = guarded_transports
    requests.get("https://www.ebi.ac.uk/ena/browser/api/summary/PRJEB123", timeout=1)
    send.assert_called_once()


def test_redirect_to_production_stops_before_send(
    monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest
):
    redirect = requests.Response()
    redirect.status_code = 307
    redirect.headers["Location"] = PROD_SUBMISSION_URL
    redirect.request = requests.Request("POST", DEV_SUBMISSION_URL, data="test").prepare()
    redirect._content = b""
    send = Mock(return_value=redirect)
    monkeypatch.setattr(requests.adapters.HTTPAdapter, "send", send)
    request.getfixturevalue("ena_dev_only")
    with pytest.raises(RuntimeError, match="HTTPS wwwdev"):
        requests.post(DEV_SUBMISSION_URL, data="test", timeout=1)
    send.assert_called_once()
    assert send.call_args.args[0].url == DEV_SUBMISSION_URL
