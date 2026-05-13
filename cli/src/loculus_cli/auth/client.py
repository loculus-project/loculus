"""Authentication client for the Loculus CLI.

The CLI talks to Authelia's OIDC provider using the device authorization grant
(RFC 8628). Authelia does not support the Resource Owner Password Credentials
grant, so there is no longer a username+password login codepath.

Tokens are cached in the system keyring keyed by the Authelia URL + the
authenticated subject. Refresh tokens are used opportunistically to avoid
prompting the user to re-authorize on every command.
"""

import os
import time
import webbrowser
from typing import TYPE_CHECKING, Any

import httpx
import keyring
from pydantic import BaseModel
from rich.console import Console

if TYPE_CHECKING:
    from ..config import InstanceConfig


class TokenInfo(BaseModel):
    """OIDC tokens returned by the Authelia token endpoint."""

    access_token: str
    refresh_token: str | None = None
    expires_in: int
    refresh_expires_in: int = 0
    token_type: str = "Bearer"
    id_token: str | None = None
    subject: str | None = None
    created_at: float


class DeviceCodeError(RuntimeError):
    """Raised when device-code authorization fails or is denied."""


_CONSOLE = Console()


class AuthClient:
    """OIDC device-code authentication client."""

    def __init__(self, instance_config: "InstanceConfig") -> None:
        self.instance_config = instance_config
        self.client = httpx.Client(timeout=30.0)
        self._service_name = os.getenv("LOCULUS_CLI_KEYRING_SERVICE", "loculus-cli")
        self._token_cache: TokenInfo | None = None
        self._discovery_cache: dict[str, str] | None = None

    # ---------------------------------------------------------------- keyring

    def _key(self, subject: str) -> str:
        return f"{self.instance_config.authelia_url}#{subject}"

    def _store_token(self, subject: str, token_info: TokenInfo) -> None:
        try:
            keyring.set_password(
                self._service_name,
                self._key(subject),
                token_info.model_dump_json(),
            )
        except Exception as e:
            raise RuntimeError(f"Failed to store token: {e}") from e

    def _load_token(self, subject: str) -> TokenInfo | None:
        try:
            blob = keyring.get_password(self._service_name, self._key(subject))
            if blob:
                return TokenInfo.model_validate_json(blob)
        except Exception:
            return None
        return None

    def _delete_token(self, subject: str) -> None:
        try:
            keyring.delete_password(self._service_name, self._key(subject))
        except Exception:
            pass

    # ---------------------------------------------------------------- expiry

    def _is_access_token_expired(self, token_info: TokenInfo) -> bool:
        # Treat as expired 5 minutes early to give callers headroom.
        return (token_info.created_at + token_info.expires_in - 300) < time.time()

    def _is_refresh_token_expired(self, token_info: TokenInfo) -> bool:
        if token_info.refresh_expires_in <= 0:
            return False
        return (token_info.created_at + token_info.refresh_expires_in) < time.time()

    # ---------------------------------------------------------------- oidc

    def _discovery(self) -> dict[str, str]:
        if self._discovery_cache is not None:
            return self._discovery_cache
        base = self.instance_config.authelia_url.rstrip("/")
        url = f"{base}/.well-known/openid-configuration"
        resp = self.client.get(url)
        resp.raise_for_status()
        self._discovery_cache = resp.json()
        return self._discovery_cache

    def login(self) -> TokenInfo:
        """Interactive device-code login. Returns the resulting tokens.

        Prints the verification URL and user code to stderr and (best-effort)
        opens the browser. Polls the token endpoint until the user finishes
        authentication or the device code expires.
        """
        disc = self._discovery()
        device_endpoint = disc.get(
            "device_authorization_endpoint",
            f"{self.instance_config.authelia_url.rstrip('/')}/api/oidc/device-authorization",
        )
        token_endpoint = disc["token_endpoint"]

        resp = self.client.post(
            device_endpoint,
            data={
                "client_id": self.instance_config.oidc_client_id,
                "scope": "openid profile email groups offline_access",
            },
        )
        if resp.status_code != 200:
            raise DeviceCodeError(
                "Device authorization request failed: "
                f"HTTP {resp.status_code} {resp.text}"
            )
        body = resp.json()

        verification_uri = (
            body.get("verification_uri_complete") or body["verification_uri"]
        )
        device_code = body["device_code"]
        user_code = body.get("user_code")
        interval = int(body.get("interval", 5))
        expires_in = int(body.get("expires_in", 600))

        _CONSOLE.print(
            f"To sign in, visit [bold]{verification_uri}[/bold]"
            + (f" and enter the code [bold]{user_code}[/bold]" if user_code else "")
        )
        try:
            webbrowser.open(verification_uri, new=2)
        except Exception:
            pass

        deadline = time.time() + expires_in
        while time.time() < deadline:
            time.sleep(interval)
            poll = self.client.post(
                token_endpoint,
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                    "device_code": device_code,
                    "client_id": self.instance_config.oidc_client_id,
                },
            )
            if poll.status_code == 200:
                token = self._token_info_from_response(poll.json())
                subject = self._subject_for(token)
                self._store_token(subject, token)
                self._token_cache = token
                self.set_current_user(subject)
                return token
            err = poll.json().get("error", "")
            if err == "authorization_pending":
                continue
            if err == "slow_down":
                interval += 5
                continue
            if err in ("expired_token", "access_denied"):
                raise DeviceCodeError(f"Device authorization failed: {err}")
            raise DeviceCodeError(
                f"Unexpected device-code response: HTTP {poll.status_code} {poll.text}"
            )
        raise DeviceCodeError("Device code expired before login completed")

    def refresh_token(self, subject: str) -> TokenInfo | None:
        """Refresh tokens for `subject`. Returns None on failure."""
        token_info = self._load_token(subject)
        if not token_info or not token_info.refresh_token:
            return None
        if self._is_refresh_token_expired(token_info):
            self._delete_token(subject)
            return None

        token_endpoint = self._discovery()["token_endpoint"]
        try:
            resp = self.client.post(
                token_endpoint,
                data={
                    "grant_type": "refresh_token",
                    "client_id": self.instance_config.oidc_client_id,
                    "refresh_token": token_info.refresh_token,
                },
            )
            resp.raise_for_status()
            new_token = self._token_info_from_response(resp.json(), default=token_info)
            self._store_token(subject, new_token)
            self._token_cache = new_token
            return new_token
        except Exception:
            self._delete_token(subject)
            return None

    def _token_info_from_response(
        self, data: dict[str, Any], default: TokenInfo | None = None
    ) -> TokenInfo:
        return TokenInfo(
            access_token=data["access_token"],
            refresh_token=data.get(
                "refresh_token", default.refresh_token if default else None
            ),
            expires_in=int(
                data.get("expires_in", default.expires_in if default else 3600)
            ),
            refresh_expires_in=int(
                data.get(
                    "refresh_expires_in",
                    default.refresh_expires_in if default else 0,
                )
            ),
            token_type=data.get("token_type", "Bearer"),
            id_token=data.get("id_token", default.id_token if default else None),
            subject=default.subject if default else None,
            created_at=time.time(),
        )

    def _subject_for(self, token: TokenInfo) -> str:
        # Best-effort: decode JWT to find the subject. Without verification —
        # the keyring key just needs to be stable per user.
        import base64
        import json

        if token.subject:
            return token.subject
        try:
            _, payload, _ = token.access_token.split(".")
            padded = payload + "=" * (-len(payload) % 4)
            claims = json.loads(base64.urlsafe_b64decode(padded))
        except Exception:
            return "current"
        sub = claims.get("preferred_username") or claims.get("sub") or "current"
        token.subject = sub
        return sub

    # ---------------------------------------------------------------- public

    def get_valid_token(self, subject: str | None = None) -> TokenInfo | None:
        sub = subject or self.get_current_user()
        if sub is None:
            return None
        if self._token_cache and not self._is_access_token_expired(self._token_cache):
            return self._token_cache
        token = self._load_token(sub)
        if not token:
            return None
        if self._is_access_token_expired(token):
            token = self.refresh_token(sub)
            if not token:
                return None
        self._token_cache = token
        return token

    def logout(self, subject: str | None = None) -> None:
        sub = subject or self.get_current_user()
        if sub:
            self._delete_token(sub)
        self._token_cache = None
        self.clear_current_user()

    def get_auth_headers(self, subject: str | None = None) -> dict[str, str]:
        token = self.get_valid_token(subject)
        if not token:
            raise RuntimeError(
                "Not authenticated. Please run 'loculus auth login' first."
            )
        return {"Authorization": f"{token.token_type} {token.access_token}"}

    def is_authenticated(self, subject: str | None = None) -> bool:
        return self.get_valid_token(subject) is not None

    def get_current_user(self) -> str | None:
        try:
            username = keyring.get_password(self._service_name, "current_user")
            if username and self.is_authenticated(username):
                return username
        except Exception:
            return None
        return None

    def set_current_user(self, username: str) -> None:
        try:
            keyring.set_password(self._service_name, "current_user", username)
        except Exception as e:
            raise RuntimeError(f"Failed to store current user: {e}") from e

    def clear_current_user(self) -> None:
        try:
            keyring.delete_password(self._service_name, "current_user")
        except Exception:
            pass
