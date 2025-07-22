"""LAPIS API client for Loculus."""

from typing import Any

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
        filters: dict[str, Any] | None = None,
        limit: int | None = None,
        offset: int | None = None,
        order_by: str | None = None,
        fields: list[str] | None = None,
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
            raise RuntimeError(
                f"LAPIS query failed: HTTP {e.response.status_code}"
            ) from e
        except ValidationError as e:
            raise RuntimeError(f"Invalid LAPIS response format: {e}") from e
        except Exception as e:
            raise RuntimeError(f"LAPIS query failed: {e}") from e

    def get_aggregated_data(
        self,
        organism: str,
        filters: dict[str, Any] | None = None,
        group_by: list[str] | None = None,
        order_by: str | None = None,
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
            ) from e
        except ValidationError as e:
            raise RuntimeError(f"Invalid LAPIS response format: {e}") from e
        except Exception as e:
            raise RuntimeError(f"LAPIS aggregated query failed: {e}") from e

    def get_aligned_sequences(
        self,
        organism: str,
        segment: str = "main",
        filters: dict[str, Any] | None = None,
        limit: int | None = None,
        offset: int | None = None,
        order_by: str | None = None,
    ) -> LapisSequenceResponse:
        """Get aligned sequences from LAPIS."""
        url = self._build_url(organism, f"/sample/alignedNucleotideSequences/{segment}")

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
            # Request FASTA format
            headers = {"Accept": "text/x-fasta"}
            response = self.client.get(url, params=params, headers=headers)
            response.raise_for_status()

            # Parse FASTA response
            fasta_data = []
            if response.text.strip():
                lines = response.text.strip().split("\n")
                current_header = None
                current_sequence: list[str] = []

                for line in lines:
                    if line.startswith(">"):
                        if current_header:
                            # Save previous sequence
                            fasta_data.append(
                                {
                                    "accessionVersion": current_header,
                                    "alignedNucleotideSequence": "".join(
                                        current_sequence
                                    ),
                                }
                            )
                        current_header = line[1:]  # Remove '>'
                        current_sequence = []
                    else:
                        current_sequence.append(line)

                # Save last sequence
                if current_header:
                    fasta_data.append(
                        {
                            "accessionVersion": current_header,
                            "alignedNucleotideSequence": "".join(current_sequence),
                        }
                    )

            return LapisSequenceResponse(data=fasta_data, info={})
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"LAPIS sequence query failed: HTTP {e.response.status_code}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"LAPIS sequence query failed: {e}") from e

    def get_unaligned_sequences(
        self,
        organism: str,
        segment: str = "main",
        filters: dict[str, Any] | None = None,
        limit: int | None = None,
        offset: int | None = None,
        order_by: str | None = None,
    ) -> LapisSequenceResponse:
        """Get unaligned sequences from LAPIS."""
        url = self._build_url(
            organism, f"/sample/unalignedNucleotideSequences/{segment}"
        )

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
            # Request FASTA format
            headers = {"Accept": "text/x-fasta"}
            response = self.client.get(url, params=params, headers=headers)
            response.raise_for_status()

            # Parse FASTA response
            fasta_data = []
            if response.text.strip():
                lines = response.text.strip().split("\n")
                current_header = None
                current_sequence: list[str] = []

                for line in lines:
                    if line.startswith(">"):
                        if current_header:
                            # Save previous sequence
                            fasta_data.append(
                                {
                                    "accessionVersion": current_header,
                                    "unalignedNucleotideSequence": "".join(
                                        current_sequence
                                    ),
                                }
                            )
                        current_header = line[1:]  # Remove '>'
                        current_sequence = []
                    else:
                        current_sequence.append(line)

                # Save last sequence
                if current_header:
                    fasta_data.append(
                        {
                            "accessionVersion": current_header,
                            "unalignedNucleotideSequence": "".join(current_sequence),
                        }
                    )

            return LapisSequenceResponse(data=fasta_data, info={})
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"LAPIS sequence query failed: HTTP {e.response.status_code}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"LAPIS sequence query failed: {e}") from e

    def close(self) -> None:
        """Close the HTTP client."""
        self.client.close()
