"""Authentication client for Keycloak integration."""

import os
import time

import httpx
import keyring
from pydantic import BaseModel

from ..config import InstanceConfig


class TokenInfo(BaseModel):
    """Token information from Keycloak."""

    access_token: str
    refresh_token: str
    expires_in: int
    refresh_expires_in: int
    token_type: str
    created_at: float  # Unix timestamp when token was created


class AuthClient:
    """Authentication client for Keycloak."""

    def __init__(self, instance_config: InstanceConfig):
        self.instance_config = instance_config
        self.client = httpx.Client(timeout=30.0)
        self._service_name = os.getenv("LOCULUS_CLI_KEYRING_SERVICE", "loculus-cli")
        self._token_cache: TokenInfo | None = None

    def _get_keyring_key(self, username: str) -> str:
        """Get keyring key for storing tokens."""
        return f"{self.instance_config.keycloak_url}#{username}"

    def _store_token(self, username: str, token_info: TokenInfo) -> None:
        """Store token in keyring."""
        try:
            keyring.set_password(
                self._service_name,
                self._get_keyring_key(username),
                token_info.model_dump_json(),
            )
        except Exception as e:
            raise RuntimeError(f"Failed to store token: {e}") from e

    def _load_token(self, username: str) -> TokenInfo | None:
        """Load token from keyring."""
        try:
            token_data = keyring.get_password(
                self._service_name, self._get_keyring_key(username)
            )
            if token_data:
                return TokenInfo.model_validate_json(token_data)
            return None
        except Exception:
            return None

    def _delete_token(self, username: str) -> None:
        """Delete token from keyring."""
        try:
            keyring.delete_password(self._service_name, self._get_keyring_key(username))
        except Exception:
            pass  # Ignore errors when deleting

    def _is_token_expired(self, token_info: TokenInfo) -> bool:
        """Check if token is expired."""
        current_time = time.time()
        # Consider token expired if it expires in less than 5 minutes
        return (token_info.created_at + token_info.expires_in - 300) < current_time

    def _is_refresh_token_expired(self, token_info: TokenInfo) -> bool:
        """Check if refresh token is expired."""
        current_time = time.time()
        return (token_info.created_at + token_info.refresh_expires_in) < current_time

    def login(self, username: str, password: str) -> TokenInfo:
        """Login with username and password."""
        token_url = (
            f"{self.instance_config.keycloak_url}/realms/"
            f"{self.instance_config.keycloak_realm}/protocol/openid-connect/token"
        )

        data = {
            "grant_type": "password",
            "client_id": self.instance_config.keycloak_client_id,
            "username": username,
            "password": password,
        }

        try:
            response = self.client.post(token_url, data=data)
            response.raise_for_status()

            token_data = response.json()
            token_info = TokenInfo(
                access_token=token_data["access_token"],
                refresh_token=token_data["refresh_token"],
                expires_in=token_data["expires_in"],
                refresh_expires_in=token_data["refresh_expires_in"],
                token_type=token_data.get("token_type", "Bearer"),
                created_at=time.time(),
            )

            # Store token in keyring
            self._store_token(username, token_info)
            self._token_cache = token_info

            return token_info

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                raise RuntimeError("Invalid username or password") from e
            elif e.response.status_code == 400:
                # Try to get more specific error message
                try:
                    error_data = e.response.json()
                    error_description = error_data.get(
                        "error_description", "Bad request"
                    )
                    raise RuntimeError(
                        f"Authentication failed: {error_description}"
                    ) from e
                except Exception:
                    raise RuntimeError("Authentication failed: Bad request") from e
            else:
                raise RuntimeError(
                    f"Authentication failed: HTTP {e.response.status_code}"
                ) from e
        except Exception as e:
            raise RuntimeError(f"Authentication failed: {e}") from e

    def refresh_token(self, username: str) -> TokenInfo | None:
        """Refresh access token using refresh token."""
        token_info = self._load_token(username)
        if not token_info:
            return None

        if self._is_refresh_token_expired(token_info):
            # Refresh token is expired, need to login again
            self._delete_token(username)
            return None

        token_url = (
            f"{self.instance_config.keycloak_url}/realms/"
            f"{self.instance_config.keycloak_realm}/protocol/openid-connect/token"
        )

        data = {
            "grant_type": "refresh_token",
            "client_id": self.instance_config.keycloak_client_id,
            "refresh_token": token_info.refresh_token,
        }

        try:
            response = self.client.post(token_url, data=data)
            response.raise_for_status()

            token_data = response.json()
            new_token_info = TokenInfo(
                access_token=token_data["access_token"],
                refresh_token=token_data.get("refresh_token", token_info.refresh_token),
                expires_in=token_data["expires_in"],
                refresh_expires_in=token_data.get(
                    "refresh_expires_in", token_info.refresh_expires_in
                ),
                token_type=token_data.get("token_type", "Bearer"),
                created_at=time.time(),
            )

            # Store updated token
            self._store_token(username, new_token_info)
            self._token_cache = new_token_info

            return new_token_info

        except Exception:
            # If refresh fails, delete the token
            self._delete_token(username)
            return None

    def get_valid_token(self, username: str) -> TokenInfo | None:
        """Get a valid access token, refreshing if necessary."""
        # Try cache first
        if self._token_cache and not self._is_token_expired(self._token_cache):
            return self._token_cache

        # Load from keyring
        token_info = self._load_token(username)
        if not token_info:
            return None

        # Check if token is expired
        if self._is_token_expired(token_info):
            # Try to refresh
            token_info = self.refresh_token(username)
            if not token_info:
                return None

        self._token_cache = token_info
        return token_info

    def logout(self, username: str) -> None:
        """Logout and clear stored token."""
        self._delete_token(username)
        self._token_cache = None

    def get_auth_headers(self, username: str) -> dict[str, str]:
        """Get authentication headers for API requests."""
        token_info = self.get_valid_token(username)
        if not token_info:
            raise RuntimeError(
                "Not authenticated. Please run 'loculus auth login' first."
            )

        return {"Authorization": f"{token_info.token_type} {token_info.access_token}"}

    def is_authenticated(self, username: str) -> bool:
        """Check if user is authenticated."""
        return self.get_valid_token(username) is not None

    def get_current_user(self) -> str | None:
        """Get current authenticated user."""
        # For now, we'll need to store the username separately
        # This is a limitation of the current design
        try:
            username = keyring.get_password(self._service_name, "current_user")
            if username and self.is_authenticated(username):
                return username
            return None
        except Exception:
            return None

    def set_current_user(self, username: str) -> None:
        """Set current authenticated user."""
        try:
            keyring.set_password(self._service_name, "current_user", username)
        except Exception as e:
            raise RuntimeError(f"Failed to store current user: {e}") from e

    def clear_current_user(self) -> None:
        """Clear current authenticated user."""
        try:
            keyring.delete_password(self._service_name, "current_user")
        except Exception:
            pass
