from __future__ import annotations

import importlib.util
from pathlib import Path
from unittest import mock

import pytest
import requests

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "loculus_client.py"
SPEC = importlib.util.spec_from_file_location("loculus_client", SCRIPT_PATH)
loculus_client = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(loculus_client)

CONFIG = loculus_client.ApproveConfig(
    organism="sars-cov-2",
    backend_url="http://backend",
    keycloak_token_url="http://keycloak/token",  # noqa: S106
    keycloak_client_id="backend-client",
    username="insdc_ingest_user",
    password="secret",  # noqa: S106
)


def response(status: int, body: dict | None = None) -> requests.Response:
    r = requests.Response()
    r.status_code = status
    r._content = b"{}" if body is None else requests.compat.json.dumps(body).encode()
    return r


@pytest.fixture
def no_sleep():
    with mock.patch.object(loculus_client, "sleep") as sleep:
        yield sleep


def test_get_jwt_rides_out_a_keycloak_restart(no_sleep):
    outcomes = [
        requests.ConnectionError("connection refused"),
        response(503),
        response(200, {"access_token": "token"}),
    ]
    with mock.patch.object(loculus_client.requests, "post", side_effect=outcomes) as post:
        assert loculus_client.get_jwt(CONFIG) == "token"
    assert post.call_count == len(outcomes)
    assert [c.args[0] for c in no_sleep.call_args_list] == [5.0, 10.0]


def test_get_jwt_fails_at_once_on_a_client_error(no_sleep):
    with (
        mock.patch.object(loculus_client.requests, "post", return_value=response(401)) as post,
        pytest.raises(requests.HTTPError),
    ):
        loculus_client.get_jwt(CONFIG)
    assert post.call_count == 1
    no_sleep.assert_not_called()


def test_get_jwt_gives_up_after_the_retry_budget(no_sleep):
    with (
        mock.patch.object(
            loculus_client.requests, "post", side_effect=requests.ConnectionError("down")
        ),
        pytest.raises(requests.ConnectionError),
    ):
        loculus_client.get_jwt(CONFIG)
    waited = sum(c.args[0] for c in no_sleep.call_args_list)
    assert waited >= loculus_client.KEYCLOAK_RETRY_MAX_WAIT_SECONDS
