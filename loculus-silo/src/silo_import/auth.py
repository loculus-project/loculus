"""Access tokens for instances that keep released data behind the login.

On an instance configured with `requireLogin`, the backend's `/get-released-data` endpoint is no
longer public, so the importer has to present a token like any other client. Credentials are
supplied through the environment; when they are absent the importer runs unauthenticated, which is
what a public instance wants.
"""

from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass

import requests

logger = logging.getLogger(__name__)

# Fetch a new token a little before the current one expires, so that a request is never sent with a
# token that is about to die. Clamped to half the token's lifetime, so that a short lifespan does
# not turn into a token request per download.
REFRESH_MARGIN = dt.timedelta(minutes=5)

TOKEN_REQUEST_TIMEOUT_SECONDS = 10

DEFAULT_CLIENT_ID = "backend-client"


class TokenRequestError(RuntimeError):
    """Could not obtain an access token."""


@dataclass(frozen=True)
class KeycloakCredentials:
    token_url: str
    username: str
    password: str
    client_id: str = DEFAULT_CLIENT_ID


class TokenProvider:
    """Fetches an access token with the password grant and reuses it until it nears expiry."""

    def __init__(self, credentials: KeycloakCredentials) -> None:
        self._credentials = credentials
        self._token: str | None = None
        self._refresh_at = dt.datetime.min.replace(tzinfo=dt.UTC)

    def get_token(self) -> str:
        now = dt.datetime.now(tz=dt.UTC)
        if self._token is not None and now < self._refresh_at:
            return self._token

        token, lifetime = self._request_token()
        self._token = token
        self._refresh_at = now + lifetime - min(REFRESH_MARGIN, lifetime / 2)
        return token

    def _request_token(self) -> tuple[str, dt.timedelta]:
        logger.info("Requesting an access token from %s", self._credentials.token_url)
        try:
            response = requests.post(
                self._credentials.token_url,
                data={
                    "client_id": self._credentials.client_id,
                    "username": self._credentials.username,
                    "password": self._credentials.password,
                    "grant_type": "password",
                },
                timeout=TOKEN_REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            msg = f"Could not reach {self._credentials.token_url}: {exc}"
            raise TokenRequestError(msg) from exc

        if not response.ok:
            msg = (
                f"Could not get an access token from {self._credentials.token_url}: "
                f"HTTP {response.status_code} {response.text}"
            )
            raise TokenRequestError(msg)

        payload = response.json()
        token = payload.get("access_token")
        if not token:
            msg = f"The response from {self._credentials.token_url} contained no access_token"
            raise TokenRequestError(msg)

        return token, dt.timedelta(seconds=int(payload.get("expires_in", 0)))


def authorization_header(token_provider: TokenProvider | None) -> dict[str, str]:
    """The Authorization header to send, empty on instances whose data is public."""
    if token_provider is None:
        return {}
    return {"Authorization": f"Bearer {token_provider.get_token()}"}
