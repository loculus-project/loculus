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

    def get_query_service_url(self) -> str:
        """Get the base URL of the Loculus query-service.

        The CLI talks to the query-service v1 API. `organism` is passed
        as a query parameter on each request, so the URL itself is not
        per-organism.
        """
        hosts = self.get_hosts()
        if "queryService" not in hosts:
            raise RuntimeError("queryService URL not found in instance info")
        url = hosts["queryService"]
        if not isinstance(url, str):
            raise RuntimeError("queryService host must be a string")
        return url

    def get_lapis_url(self, organism: str) -> str:
        """Backwards-compatible accessor; returns the query-service base URL.

        The organism is now passed at call time, but several callers in the
        CLI still expect a function that takes an organism. Validate that
        the organism exists, then return the (organism-agnostic) base URL.
        """
        organisms = self.get_organisms()
        if organism not in organisms:
            available = ", ".join(organisms)
            raise ValueError(
                f"Organism '{organism}' is not available. Available: {available}"
            )
        return self.get_query_service_url()

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
