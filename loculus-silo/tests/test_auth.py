# ruff:file-ignore[assert]
from __future__ import annotations

import base64
import json
import time
from unittest.mock import MagicMock, patch

from silo_import.auth import TokenFetcher


def make_jwt(expires_at: float) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"exp": expires_at}).encode()).decode()
    return f"header.{payload.rstrip('=')}.signature"


def mock_token_response(token: str) -> MagicMock:
    response = MagicMock()
    response.ok = True
    response.json.return_value = {"access_token": token}
    return response


def test_token_fetcher_caches_token_until_close_to_expiry() -> None:
    token = make_jwt(time.time() + 3600)
    fetcher = TokenFetcher("http://keycloak/token", "user", "password")

    with patch("silo_import.auth.requests.post", return_value=mock_token_response(token)) as post:
        assert fetcher.get_token() == token
        assert fetcher.get_token() == token

    assert post.call_count == 1


def test_token_fetcher_refreshes_token_close_to_expiry() -> None:
    expiring_token = make_jwt(time.time() + 10)
    fresh_token = make_jwt(time.time() + 3600)
    fetcher = TokenFetcher("http://keycloak/token", "user", "password")

    with patch(
        "silo_import.auth.requests.post",
        side_effect=[mock_token_response(expiring_token), mock_token_response(fresh_token)],
    ):
        assert fetcher.get_token() == expiring_token
        assert fetcher.get_token() == fresh_token
