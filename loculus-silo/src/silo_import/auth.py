from __future__ import annotations

import base64
import json
import logging
import time

import requests

logger = logging.getLogger(__name__)

TOKEN_REFRESH_MARGIN_SECONDS = 300


def _parse_expiry(token: str) -> float:
    """Extract the `exp` claim from a JWT without verifying the signature."""
    try:
        payload_part = token.split(".")[1]
        payload_part += "=" * (-len(payload_part) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_part))
        return float(payload.get("exp", 0))
    except (IndexError, ValueError, json.JSONDecodeError):
        logger.warning("Failed to parse JWT expiry; treating token as already expired")
        return 0


class TokenFetcher:
    """Fetch and cache a Keycloak JWT using the password grant."""

    def __init__(self, token_url: str, username: str, password: str) -> None:
        self.token_url = token_url
        self.username = username
        self.password = password
        self._token: str | None = None
        self._expires_at: float = 0

    def get_token(self) -> str:
        if self._token and time.time() < self._expires_at - TOKEN_REFRESH_MARGIN_SECONDS:
            return self._token

        logger.debug("Requesting JWT from %s", self.token_url)
        response = requests.post(
            self.token_url,
            data={
                "client_id": "backend-client",
                "username": self.username,
                "password": self.password,
                "grant_type": "password",
            },
            timeout=10,
        )
        if not response.ok:
            msg = f"Fetching JWT failed with status code {response.status_code}: {response.text}"
            raise RuntimeError(msg)

        token = response.json()["access_token"]
        self._token = token
        self._expires_at = _parse_expiry(token)
        return token
