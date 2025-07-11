"""LAPIS API client for Loculus."""

from typing import Any, Optional

import httpx
from pydantic import ValidationError

from .models import LapisAggregatedResponse, LapisResponse, LapisSequenceResponse


class LapisClient:
    """Client for LAPIS API."""

    def __init__(self, lapis_url: str):
        self.lapis_url = lapis_url
        self.client = httpx.Client(
            base_url=lapis_url,
            timeout=60.0,  # LAPIS queries can take longer
            follow_redirects=True,
        )

    def _build_url(self, organism: str, endpoint: str) -> str:
        """Build URL for organism-specific endpoint."""
        # The lapis_url already includes the organism path, so just use the endpoint
        return f"/{endpoint.lstrip('/')}"

    def get_sample_details(
        self,
        organism: str,
        filters: Optional[dict[str, Any]] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        order_by: Optional[str] = None,
        fields: Optional[list[str]] = None,
    ) -> LapisResponse:
        """Get sample details from LAPIS."""
        url = self._build_url(organism, "/sample/details")

        params = {}
        if filters:
            params.update(filters)
        if limit is not None:
            params["limit"] = str(limit)
        if offset is not None:
            params["offset"] = str(offset)
        if order_by:
            params["orderBy"] = order_by
        if fields:
            params["fields"] = ",".join(fields)

        try:
            response = self.client.get(url, params=params)
            response.raise_for_status()
            return LapisResponse.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"LAPIS query failed: HTTP {e.response.status_code}")
        except ValidationError as e:
            raise RuntimeError(f"Invalid LAPIS response format: {e}")
        except Exception as e:
            raise RuntimeError(f"LAPIS query failed: {e}")

    def get_aggregated_data(
        self,
        organism: str,
        filters: Optional[dict[str, Any]] = None,
        group_by: Optional[list[str]] = None,
        order_by: Optional[str] = None,
    ) -> LapisAggregatedResponse:
        """Get aggregated data from LAPIS."""
        url = self._build_url(organism, "/sample/aggregated")

        params = {}
        if filters:
            params.update(filters)
        if group_by:
            params["groupBy"] = ",".join(group_by)
        if order_by:
            params["orderBy"] = order_by

        try:
            response = self.client.get(url, params=params)
            response.raise_for_status()
            return LapisAggregatedResponse.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"LAPIS aggregated query failed: HTTP {e.response.status_code}"
            )
        except ValidationError as e:
            raise RuntimeError(f"Invalid LAPIS response format: {e}")
        except Exception as e:
            raise RuntimeError(f"LAPIS aggregated query failed: {e}")

    def get_aligned_sequences(
        self,
        organism: str,
        filters: Optional[dict[str, Any]] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        order_by: Optional[str] = None,
    ) -> LapisSequenceResponse:
        """Get aligned sequences from LAPIS."""
        url = self._build_url(organism, "/sample/alignedNucleotideSequences")

        params = {}
        if filters:
            params.update(filters)
        if limit is not None:
            params["limit"] = str(limit)
        if offset is not None:
            params["offset"] = str(offset)
        if order_by:
            params["orderBy"] = order_by

        try:
            response = self.client.get(url, params=params)
            response.raise_for_status()
            return LapisSequenceResponse.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"LAPIS sequence query failed: HTTP {e.response.status_code}"
            )
        except ValidationError as e:
            raise RuntimeError(f"Invalid LAPIS response format: {e}")
        except Exception as e:
            raise RuntimeError(f"LAPIS sequence query failed: {e}")

    def get_unaligned_sequences(
        self,
        organism: str,
        filters: Optional[dict[str, Any]] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        order_by: Optional[str] = None,
    ) -> LapisSequenceResponse:
        """Get unaligned sequences from LAPIS."""
        url = self._build_url(organism, "/sample/unalignedNucleotideSequences")

        params = {}
        if filters:
            params.update(filters)
        if limit is not None:
            params["limit"] = str(limit)
        if offset is not None:
            params["offset"] = str(offset)
        if order_by:
            params["orderBy"] = order_by

        try:
            response = self.client.get(url, params=params)
            response.raise_for_status()
            return LapisSequenceResponse.model_validate(response.json())
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"LAPIS sequence query failed: HTTP {e.response.status_code}"
            )
        except ValidationError as e:
            raise RuntimeError(f"Invalid LAPIS response format: {e}")
        except Exception as e:
            raise RuntimeError(f"LAPIS sequence query failed: {e}")

    def close(self) -> None:
        """Close the HTTP client."""
        self.client.close()
