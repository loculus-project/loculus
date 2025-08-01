"""Instance information client for fetching configuration from loculus-info endpoint."""

import time
from typing import Any

import httpx

from .types import Schema


class InstanceInfo:
    """Client for fetching instance configuration from loculus-info endpoint."""

    def __init__(self, instance_url: str):
        self.instance_url = instance_url.rstrip("/")
        self._cache: dict[str, Any] | None = None
        self._cache_expiry: float | None = None
        self.cache_ttl = 300  # 5 minutes

    def _is_cache_valid(self) -> bool:
        """Check if cached data is still valid."""
        if self._cache is None or self._cache_expiry is None:
            return False
        return time.time() < self._cache_expiry

    def get_info(self) -> dict[str, Any]:
        """Fetch instance info with caching."""
        if self._is_cache_valid():
            assert self._cache is not None  # Cache is valid, so it can't be None
            return self._cache

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.get(f"{self.instance_url}/loculus-info")
                response.raise_for_status()

            self._cache = response.json()
            self._cache_expiry = time.time() + self.cache_ttl
            return self._cache

        except httpx.HTTPError as e:
            raise RuntimeError(
                f"Failed to fetch instance info from "
                f"{self.instance_url}/loculus-info: {e}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"Error fetching instance info: {e}") from e

    def get_hosts(self) -> dict[str, str]:
        """Get host URLs for backend, keycloak, website."""
        info = self.get_info()
        if "hosts" not in info:
            raise RuntimeError("Instance info missing 'hosts' section")
        return info["hosts"]

    def get_organisms(self) -> list[str]:
        """Get list of available organisms."""
        info = self.get_info()
        if "organisms" not in info:
            raise RuntimeError("Instance info missing 'organisms' section")
        return list(info["organisms"].keys())

    def get_organism_schema(self, organism: str) -> Schema:
        """Get metadata schema for specific organism."""
        info = self.get_info()
        if "organisms" not in info:
            raise RuntimeError("Instance info missing 'organisms' section")
        if organism not in info["organisms"]:
            available = ", ".join(info["organisms"].keys())
            raise ValueError(
                f"Organism '{organism}' not found. Available organisms: {available}"
            )

        organism_data = info["organisms"][organism]
        if "schema" not in organism_data:
            raise RuntimeError(f"Schema not found for organism '{organism}'")

        return organism_data["schema"]

    def get_lapis_urls(self) -> dict[str, str]:
        """Get LAPIS URLs for all organisms."""
        hosts = self.get_hosts()
        if "lapis" not in hosts:
            raise RuntimeError("LAPIS URLs not found in instance info")
        lapis_hosts = hosts["lapis"]
        if not isinstance(lapis_hosts, dict):
            raise RuntimeError("LAPIS hosts must be a dictionary")
        return lapis_hosts

    def get_lapis_url(self, organism: str) -> str:
        """Get LAPIS URL for specific organism."""
        lapis_urls = self.get_lapis_urls()
        if organism not in lapis_urls:
            available = ", ".join(lapis_urls.keys())
            raise ValueError(
                f"LAPIS not available for organism '{organism}'. Available: {available}"
            )
        return lapis_urls[organism]

    def get_version_info(self) -> dict[str, str]:
        """Get version information."""
        info = self.get_info()
        return {
            "title": info.get("title", "Unknown"),
            "version": info.get("version", "Unknown"),
            "minCliVersion": info.get("minCliVersion", "Unknown"),
        }

    def clear_cache(self) -> None:
        """Clear cached instance info."""
        self._cache = None
        self._cache_expiry = None
