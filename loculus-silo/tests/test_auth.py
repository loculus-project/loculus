# ruff:file-ignore[assert]
from __future__ import annotations

from typing import Any

import pytest
from silo_import import auth
from silo_import.auth import (
    KeycloakCredentials,
    TokenProvider,
    TokenRequestError,
    authorization_header,
)

TOKEN_URL = "http://keycloak/realms/loculus/protocol/openid-connect/token"
LONG_LIVED = 36000


class FakeResponse:
    def __init__(self, status_code: int = 200, payload: Any = None, text: str = "") -> None:
        self.status_code = status_code
        self.ok = status_code < 400  # noqa: PLR2004
        self.text = text
        self._payload = payload if payload is not None else {}

    def json(self) -> Any:
        return self._payload


def credentials() -> KeycloakCredentials:
    return KeycloakCredentials(token_url=TOKEN_URL, username="silo_import", password="secret")


def record_posts(monkeypatch: pytest.MonkeyPatch, responses: list[FakeResponse]) -> list[dict]:
    """Replace requests.post and return the list that captures the form data of each call."""
    calls: list[dict] = []
    remaining = list(responses)

    def fake_post(url: str, data: dict, timeout: int) -> FakeResponse:  # noqa: ARG001
        calls.append({"url": url, "data": data})
        return remaining.pop(0)

    monkeypatch.setattr(auth.requests, "post", fake_post)
    return calls


def test_no_header_without_credentials() -> None:
    assert authorization_header(None) == {}


def test_token_is_requested_with_the_password_grant(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = record_posts(
        monkeypatch,
        [FakeResponse(payload={"access_token": "a-token", "expires_in": LONG_LIVED})],
    )

    assert authorization_header(TokenProvider(credentials())) == {"Authorization": "Bearer a-token"}
    assert calls[0]["url"] == TOKEN_URL
    assert calls[0]["data"] == {
        "client_id": "backend-client",
        "username": "silo_import",
        "password": "secret",
        "grant_type": "password",
    }


def test_token_is_reused_until_it_nears_expiry(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = record_posts(
        monkeypatch,
        [FakeResponse(payload={"access_token": "a-token", "expires_in": LONG_LIVED})],
    )
    provider = TokenProvider(credentials())

    assert provider.get_token() == "a-token"
    assert provider.get_token() == "a-token"
    assert len(calls) == 1


def test_expired_token_is_replaced(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = record_posts(
        monkeypatch,
        [
            FakeResponse(payload={"access_token": "first", "expires_in": 0}),
            FakeResponse(payload={"access_token": "second", "expires_in": LONG_LIVED}),
        ],
    )
    provider = TokenProvider(credentials())

    assert provider.get_token() == "first"
    assert provider.get_token() == "second"
    assert len(calls) == 2


def test_rejected_credentials_raise(monkeypatch: pytest.MonkeyPatch) -> None:
    record_posts(monkeypatch, [FakeResponse(status_code=401, text="invalid_grant")])

    with pytest.raises(TokenRequestError, match="401"):
        TokenProvider(credentials()).get_token()


def test_response_without_a_token_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    record_posts(monkeypatch, [FakeResponse(payload={"expires_in": LONG_LIVED})])

    with pytest.raises(TokenRequestError, match="no access_token"):
        TokenProvider(credentials()).get_token()
